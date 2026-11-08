"""Pattern Hunter: a hypothesis loop over the population, run offline before the demo.

The agent (Gemini on Google ADK) never sees raw rows. It gets a catalogue of features and flags and a handful of
statistical tools that run on the feature table in code: quantile survival tables, rank correlations, flag
comparisons and two-way cross-tabs. It proposes a hypothesis, tests it, and records only findings that clear the
evidence bar built into `record_finding`. A fixed call budget keeps the run bounded.

Without a model, `baseline_battery` runs the same tools over a fixed list and writes templated findings, so the
Insights screen always has something to show and the model's run can be compared against it.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from .. import config
from .adk_runtime import LlmAgent, adk_available, agent_output, run_agent
from .features import FEATURE_DOCS, FLAG_RULES, flag_matrix, get_features
from .resilience_history import default_validation

ARTEFACT = "hunter_findings.json"
MAX_TOOL_CALLS = 24
MIN_GROUP = 100              # accounts per group for a finding to count
MIN_EFFECT_PP = 10.0         # percentage points of survival difference
MIN_RHO = 0.2
# flags whose rule already uses the survival target; comparing them to the target is circular
TAUTOLOGICAL_FLAGS = {"fragile_but_clean"}

NUMERIC_FEATURES = [k for k in FEATURE_DOCS if k not in ("survives6_layoff", "survives6_combined", "has_running_loan", "loan_in_debt", "regular_transfer_out")]


class Toolbox:
    """Statistical tools over the feature table. Every method returns JSON-serialisable dicts."""

    def __init__(self, f: pd.DataFrame, budget: int = MAX_TOOL_CALLS):
        self.f = f.replace([np.inf, -np.inf], np.nan)
        self.f["runway_layoff_capped"] = f["runway_layoff"].replace(np.inf, 120.0)
        self.fm = flag_matrix(f)
        self.budget = budget
        self.calls: list[dict] = []
        self.findings: list[dict] = []

    # --- bookkeeping
    def _spend(self, name: str, args: dict) -> dict | None:
        """Exploration calls count against the budget; record_finding never does, so recording cannot be starved."""
        self.calls.append({"tool": name, "args": args})
        if name == "record_finding":
            return None
        used = sum(1 for c in self.calls if c["tool"] != "record_finding")
        if used > self.budget:
            return {"error": f"exploration budget of {self.budget} calls exhausted; call record_finding for every result that cleared the bar, then write your final JSON summary"}
        return None

    def _hint(self, result: dict) -> dict:
        used = sum(1 for c in self.calls if c["tool"] != "record_finding")
        left = self.budget - used
        if left <= 4 and not self.findings:
            result["budget_note"] = f"{left} exploration calls left and nothing recorded yet: record the findings you already have before exploring further"
        elif left <= 4:
            result["budget_note"] = f"{left} exploration calls left"
        return result

    def _survival(self, idx: pd.Index, shock: str) -> float:
        col = "survives6_layoff" if shock == "layoff" else "survives6_combined"
        return float(self.f.loc[idx, col].mean() * 100)

    # --- tools (plain functions with docstrings; ADK turns them into declarations)
    def list_features(self) -> dict:
        """List the numeric features and the flags available, with their meanings."""
        if (e := self._spend("list_features", {})):
            return e
        return {"features": {k: FEATURE_DOCS[k] for k in NUMERIC_FEATURES if k in self.f.columns},
                "flags": {fr.key: fr.label + (" (circular: defined from the target, do not test)" if fr.key in TAUTOLOGICAL_FLAGS else "") for fr in FLAG_RULES},
                "targets": {"layoff": "survives 6 months on 55% income", "combined": "survives 6 months on 55% income with bills +15%"},
                "note": f"{len(self.f)} accounts. Findings need groups of at least {MIN_GROUP} and an effect of {MIN_EFFECT_PP:.0f} points or |rho| >= {MIN_RHO}."}

    def describe(self, feature: str) -> dict:
        """Quantiles (10, 25, 50, 75, 90) and share of accounts with a value, for one numeric feature."""
        if (e := self._spend("describe", {"feature": feature})):
            return e
        if feature not in self.f.columns:
            return {"error": f"unknown feature {feature}"}
        s = pd.to_numeric(self.f[feature], errors="coerce").dropna()
        return {"feature": feature, "meaning": FEATURE_DOCS.get(feature, ""), "n": int(len(s)),
                "quantiles": {str(q): float(s.quantile(q)) for q in (0.1, 0.25, 0.5, 0.75, 0.9)}}

    def survival_by_quantile(self, feature: str, shock: str = "layoff", bins: int = 4) -> dict:
        """Split accounts into equal-count bins of a feature and report the six-month survival rate per bin."""
        if (e := self._spend("survival_by_quantile", {"feature": feature, "shock": shock, "bins": bins})):
            return e
        if feature not in self.f.columns:
            return {"error": f"unknown feature {feature}"}
        s = pd.to_numeric(self.f[feature], errors="coerce")
        valid = s.dropna()
        if valid.nunique() < bins:
            return {"error": "feature has too few distinct values for that many bins"}
        try:
            q = pd.qcut(valid, bins, duplicates="drop")
        except ValueError as exc:
            return {"error": str(exc)}
        rows = []
        for interval, idx in valid.groupby(q, observed=True).groups.items():
            rows.append({"range": f"{interval.left:.3g} to {interval.right:.3g}", "n": int(len(idx)), "survive6_pct": round(self._survival(idx, shock), 1)})
        spread = max(r["survive6_pct"] for r in rows) - min(r["survive6_pct"] for r in rows)
        return self._hint({"feature": feature, "shock": shock, "bins": rows, "spread_pp": round(spread, 1)})

    def correlation(self, feature_a: str, feature_b: str) -> dict:
        """Spearman rank correlation between two numeric features (runway_layoff_capped is runway with no-shortfall as 120)."""
        if (e := self._spend("correlation", {"feature_a": feature_a, "feature_b": feature_b})):
            return e
        for c in (feature_a, feature_b):
            if c not in self.f.columns:
                return {"error": f"unknown feature {c}"}
        a = pd.to_numeric(self.f[feature_a], errors="coerce")
        b = pd.to_numeric(self.f[feature_b], errors="coerce")
        ok = a.notna() & b.notna()
        rho = float(a[ok].corr(b[ok], method="spearman")) if ok.sum() > 10 else float("nan")
        return self._hint({"feature_a": feature_a, "feature_b": feature_b, "n": int(ok.sum()), "spearman": None if np.isnan(rho) else round(rho, 3)})

    def compare_flag(self, flag: str) -> dict:
        """Accounts with a flag versus without: counts, survival under both shocks, and medians of I, S, B and S/I."""
        if (e := self._spend("compare_flag", {"flag": flag})):
            return e
        if flag not in self.fm.columns:
            return {"error": f"unknown flag {flag}; see list_features"}
        out = {}
        for label, mask in (("with", self.fm[flag]), ("without", ~self.fm[flag])):
            idx = self.fm.index[mask]
            sub = self.f.loc[idx]
            out[label] = {"n": int(len(idx)), "survive6_layoff_pct": round(self._survival(idx, "layoff"), 1),
                          "survive6_combined_pct": round(self._survival(idx, "combined"), 1),
                          "median_I": float(sub.I.median()), "median_S": float(sub.S.median()), "median_B": float(sub.B.median()),
                          "median_spending_ratio": float(sub.spending_ratio.median())}
        out["flag"] = flag
        out["effect_pp_layoff"] = round(out["with"]["survive6_layoff_pct"] - out["without"]["survive6_layoff_pct"], 1)
        if flag in TAUTOLOGICAL_FLAGS:
            out["warning"] = "this flag is defined using the layoff runway, so the comparison is circular; do not record it as a finding"
        return self._hint(out)

    def crosstab_survival(self, feature_a: str, feature_b: str, bins: int = 3, shock: str = "layoff") -> dict:
        """Two-way grid: bins of feature_a by bins of feature_b, six-month survival in each cell (for interactions)."""
        if (e := self._spend("crosstab_survival", {"feature_a": feature_a, "feature_b": feature_b, "bins": bins, "shock": shock})):
            return e
        for c in (feature_a, feature_b):
            if c not in self.f.columns:
                return {"error": f"unknown feature {c}"}
        a = pd.to_numeric(self.f[feature_a], errors="coerce")
        b = pd.to_numeric(self.f[feature_b], errors="coerce")
        ok = a.notna() & b.notna()
        try:
            qa = pd.qcut(a[ok], bins, duplicates="drop")
            qb = pd.qcut(b[ok], bins, duplicates="drop")
        except ValueError as exc:
            return {"error": str(exc)}
        col = "survives6_layoff" if shock == "layoff" else "survives6_combined"
        tab = self.f.loc[ok, col].groupby([qa, qb], observed=True).agg(["mean", "size"])
        cells = [{"a_range": f"{ia.left:.3g} to {ia.right:.3g}", "b_range": f"{ib.left:.3g} to {ib.right:.3g}", "n": int(n), "survive6_pct": round(float(m) * 100, 1)}
                 for (ia, ib), (m, n) in tab.iterrows()]
        return self._hint({"feature_a": feature_a, "feature_b": feature_b, "shock": shock, "cells": cells})

    def record_finding(self, title: str, statement: str, evidence: str, strength: str, caveat: str = "") -> dict:
        """Record a finding. Statement = one sentence with the numbers; evidence = which tool result supports it; strength = strong|moderate|weak."""
        if (e := self._spend("record_finding", {"title": title})):
            return e
        if strength not in ("strong", "moderate", "weak"):
            return {"error": "strength must be strong, moderate or weak"}
        if len(statement) < 20 or not any(ch.isdigit() for ch in statement):
            return {"error": "statement must include the numbers that support it"}
        self.findings.append({"title": title[:120], "statement": statement[:600], "evidence": evidence[:600], "strength": strength,
                              "caveat": caveat[:300], "recorded_after_call": len(self.calls)})
        return {"recorded": len(self.findings)}


HUNTER_INSTRUCTION = f"""You are PULP's Pattern Hunter, a careful analyst working on anonymised bank accounts.
Goal: find what predicts whether a household survives six months of a layoff (income at 55%) or the combined shock
(layoff plus household bills up 15%), with a strong preference for findings that are NOT obvious from the balance alone:
habits, timing, trends, interactions between two features, and what the flags reveal.

Method, strictly:
1. Call list_features once.
2. Form hypotheses one at a time and test each with one or two tool calls (survival_by_quantile, compare_flag,
   correlation, crosstab_survival). Do not re-test what the population numbers already show (buffer and spending
   ratio predicting runway is already known; look for what adds to or contradicts that).
3. Record a finding with record_finding IMMEDIATELY after the tool result that supports it, before the next hypothesis,
   when groups have at least {MIN_GROUP} accounts and the effect is at least {MIN_EFFECT_PP:.0f} percentage points of
   survival or |rho| >= {MIN_RHO}. Put the exact numbers in the statement. Mark strength honestly. Add a caveat when the
   comparison could be confounded (for example drawdown and buffer both depend on the balance).
4. You have a budget of {MAX_TOOL_CALLS} exploration calls; record_finding is free. Aim for 5 to 8 recorded findings.
   Stop early if you run out of good hypotheses.
5. Finish with ONLY a JSON object: {{"summary": "<three sentences for the pitch>", "best_finding": "<title>", "findings_recorded": <n>}}.
Never compute numbers yourself; quote the tools."""


def run_hunter(f: pd.DataFrame | None = None, budget: int = MAX_TOOL_CALLS) -> dict:
    f = f if f is not None else get_features()
    tb = Toolbox(f, budget=budget)
    t0 = time.perf_counter()
    agent = LlmAgent(name="pattern_hunter", model=config.GEMINI_MODEL, description="Hypothesis loop over the population features.",
                     instruction=HUNTER_INSTRUCTION,
                     tools=[tb.list_features, tb.describe, tb.survival_by_quantile, tb.correlation, tb.compare_flag, tb.crosstab_survival, tb.record_finding],
                     output_key="pattern_hunter")
    res = run_agent(agent, "Begin. The dataset is loaded; start with list_features.", user_id="stage1")
    final = agent_output(res, "pattern_hunter") or {}
    return {"mode": "adk", "model": config.GEMINI_MODEL, "ran_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "budget": budget, "tool_calls_made": len(tb.calls), "tool_log": tb.calls, "findings": tb.findings,
            "summary": final.get("summary"), "best_finding": final.get("best_finding"),
            "seconds": round(time.perf_counter() - t0, 1), "n_accounts": int(len(f))}


def baseline_battery(f: pd.DataFrame | None = None) -> dict:
    """Deterministic sweep with the same tools: every flag compared, every numeric feature binned; findings templated."""
    f = f if f is not None else get_features()
    tb = Toolbox(f, budget=10_000)
    rows = []
    for fr in FLAG_RULES:
        if fr.key in TAUTOLOGICAL_FLAGS:
            continue
        r = tb.compare_flag(fr.key)
        if "error" in r or min(r["with"]["n"], r["without"]["n"]) < MIN_GROUP:
            continue
        if abs(r["effect_pp_layoff"]) >= MIN_EFFECT_PP:
            rows.append({"title": f"Flag '{fr.label}' moves layoff survival by {r['effect_pp_layoff']:+.0f} points",
                         "statement": f"{r['with']['n']} accounts with '{fr.label}' survive six months on 55% income {r['with']['survive6_layoff_pct']:.0f}% of the time versus {r['without']['survive6_layoff_pct']:.0f}% for the other {r['without']['n']}.",
                         "evidence": f"compare_flag({fr.key})", "strength": "strong" if abs(r["effect_pp_layoff"]) >= 25 else "moderate",
                         "caveat": "Flags correlate with income and buffer; this is a difference, not a cause.", "effect": abs(r["effect_pp_layoff"])})
    for feat in ("timing_dip_share", "fee_share", "lifestyle_creep", "balance_trend_pm", "bills_share_trend", "income_cv", "inflow_regular_share",
                 "regular_transfer_out_amount", "owner_age", "account_age_years", "inflow_vs_district_salary", "card_wd_share", "cash_wd_share", "pension_share"):
        if feat not in f.columns:
            continue
        r = tb.survival_by_quantile(feat, "layoff", 4)
        if "error" in r or min(b["n"] for b in r["bins"]) < MIN_GROUP or r["spread_pp"] < MIN_EFFECT_PP:
            continue
        lo, hi = r["bins"][0], r["bins"][-1]
        rows.append({"title": f"{FEATURE_DOCS.get(feat, feat)[:60]} spreads survival by {r['spread_pp']:.0f} points",
                     "statement": f"Lowest quartile of {feat} ({lo['range']}) survives {lo['survive6_pct']:.0f}% of the time; highest quartile ({hi['range']}) {hi['survive6_pct']:.0f}%.",
                     "evidence": f"survival_by_quantile({feat}, layoff, 4)", "strength": "strong" if r["spread_pp"] >= 25 else "moderate",
                     "caveat": "Quartile spread; not adjusted for income.", "effect": r["spread_pp"]})
    # ground truth: flags versus loans that actually went bad
    try:
        from .data_store import get_store
        val = default_validation(f, get_store().loans, tb.fm)
        if val.get("available"):
            for d in val["by_flag"][:3]:
                if abs(d["bad_rate_with_pct"] - d["bad_rate_without_pct"]) >= 5:
                    label = next((fr.label for fr in FLAG_RULES if fr.key == d["flag"]), d["flag"])
                    rows.append({"title": f"Loans went bad {d['lift']:.1f}x as often with '{label}'",
                                 "statement": f"Among the {val['loans']} accounts with a loan, {d['bad_rate_with_pct']:.0f}% of the {d['n_with']} flagged '{label}' saw the loan go bad (status B or D) versus {d['bad_rate_without_pct']:.0f}% of the rest.",
                                 "evidence": f"default_validation({d['flag']})", "strength": "strong" if d["lift"] >= 2 else "moderate",
                                 "caveat": "Real outcomes, not simulation; small groups, and the loan status is a snapshot at end of 2025.", "effect": abs(d["bad_rate_with_pct"] - d["bad_rate_without_pct"]) * 2})
            bs = val["by_survival"]
            if bs.get("fails_layoff_bad_rate_pct") is not None and bs.get("survives_layoff_bad_rate_pct") is not None:
                rows.append({"title": "Simulated layoff failure lines up with real loan trouble",
                             "statement": f"Accounts that fail the simulated six-month layoff saw their loan go bad {bs['fails_layoff_bad_rate_pct']:.0f}% of the time ({bs['n_fail']} accounts) versus {bs['survives_layoff_bad_rate_pct']:.0f}% for those that survive it ({bs['n_survive']}).",
                             "evidence": "default_validation(survives6_layoff)", "strength": "strong" if abs(bs["fails_layoff_bad_rate_pct"] - bs["survives_layoff_bad_rate_pct"]) >= 10 else "moderate",
                             "caveat": "The runway formula uses the loan payment inside spending, so this is partly circular.", "effect": abs(bs["fails_layoff_bad_rate_pct"] - bs["survives_layoff_bad_rate_pct"]) * 2})
    except Exception:
        pass
    rows.sort(key=lambda d: -d["effect"])
    return {"mode": "baseline", "model": None, "ran_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "budget": None,
            "tool_calls_made": len(tb.calls), "tool_log": [], "findings": rows[:12], "summary": None, "best_finding": rows[0]["title"] if rows else None,
            "seconds": None, "n_accounts": int(len(f))}


def save_findings(doc: dict, path: Path | None = None) -> Path:
    path = path or (config.DERIVED_WRITE_DIR / ARTEFACT)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1, default=float), encoding="utf-8")
    return path


_CACHE: dict = {}


def get_findings() -> dict:
    """Committed Pattern Hunter run if present, else the deterministic battery (computed once per process)."""
    if "doc" in _CACHE:
        return _CACHE["doc"]
    for d in config.DERIVED_READ_DIRS:
        p = Path(d) / ARTEFACT
        if p.exists():
            try:
                doc = json.loads(p.read_text(encoding="utf-8"))
                doc["loaded_from"] = str(p)
                _CACHE["doc"] = doc
                return doc
            except Exception:
                continue
    doc = baseline_battery()
    doc["loaded_from"] = "computed"
    _CACHE["doc"] = doc
    return doc
