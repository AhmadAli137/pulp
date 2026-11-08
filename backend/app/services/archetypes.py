"""Archetypes: cluster the behavioural features, describe each cluster in numbers (code), name it (Gemini on ADK).

The clustering and every statistic are deterministic. The model only receives the per-cluster numbers and returns a
name, a plain description and a life-stage / occupation guess with a confidence and the evidence it used. If no
model is available, rule-based names are used and the result says so.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from .. import config
from .adk_runtime import LlmAgent, adk_available, agent_output, run_agent
from .features import FLAG_RULES, flag_matrix, get_features

CLUSTER_FEATURES = [
    "pension_share", "cash_deposit_share", "transfer_in_share", "income_cv", "inflow_regular_share", "spending_ratio",
    "bills_share", "card_wd_share", "cash_wd_share", "transfer_out_share", "neg_months_share", "log_I", "buffer_months",
    "has_running_loan", "owner_age", "account_age_years",
]
DESCRIBE_FEATURES = CLUSTER_FEATURES + ["I", "S", "B", "surplus", "fee_share", "lifestyle_creep", "balance_trend_pm",
                                        "regular_transfer_out", "inflow_vs_district_salary", "card_rank"]
DEFAULT_K = 6
ARTEFACT = "archetypes.json"


class ArchetypeName(BaseModel):
    id: int
    name: str = Field(description="2-4 words, concrete, no jargon")
    description: str = Field(description="One or two plain sentences on how this group's money behaves")
    likely_life_stage: str
    likely_occupation: str = Field(description="A hedged guess such as 'salaried employee' or 'self-employed / cash trades'")
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: str = Field(description="The two or three numbers that drove the guess")


class ArchetypeNames(BaseModel):
    archetypes: list[ArchetypeName]


def _matrix(f: pd.DataFrame) -> pd.DataFrame:
    x = f.copy()
    x["log_I"] = np.log1p(x["I"].clip(lower=0))
    x["buffer_months"] = np.where(x["S"] > 0, (x["B"] / x["S"]).clip(-6, 36), 0.0)
    x["has_running_loan"] = x["has_running_loan"].astype(float)
    x = x[CLUSTER_FEATURES].replace([np.inf, -np.inf], np.nan)
    return x.fillna(x.median(numeric_only=True))


def cluster_accounts(f: pd.DataFrame, k: int = DEFAULT_K, seed: int = 42) -> pd.Series:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler

    x = _matrix(f)
    z = StandardScaler().fit_transform(x.to_numpy(float))
    km = KMeans(n_clusters=k, n_init=10, random_state=seed)
    labels = km.fit_predict(z)
    # stable ordering: relabel clusters by size, largest first
    order = pd.Series(labels).value_counts().index.tolist()
    remap = {old: new for new, old in enumerate(order)}
    return pd.Series([remap[l] for l in labels], index=f.index, name="archetype")


def describe_clusters(f: pd.DataFrame, labels: pd.Series) -> list[dict]:
    x = f.copy()
    x["log_I"] = np.log1p(x["I"].clip(lower=0))
    x["buffer_months"] = np.where(x["S"] > 0, (x["B"] / x["S"]).clip(-6, 36), 0.0)
    x = x.replace([np.inf, -np.inf], np.nan)
    pop_med = x[DESCRIBE_FEATURES].median(numeric_only=True)
    pop_std = x[DESCRIBE_FEATURES].std(numeric_only=True).replace(0, np.nan)
    fm = flag_matrix(f)
    out = []
    for cid in sorted(labels.unique()):
        idx = labels[labels == cid].index
        sub = x.loc[idx]
        med = sub[DESCRIBE_FEATURES].median(numeric_only=True)
        z = ((med - pop_med) / pop_std).dropna().sort_values(key=lambda s: -s.abs())
        distinguishing = [{"feature": k, "cluster_median": float(med[k]), "population_median": float(pop_med[k]), "z": float(v)}
                          for k, v in z.head(6).items()]
        flags = fm.loc[idx].mean().sort_values(ascending=False)
        out.append({
            "id": int(cid), "size": int(len(idx)), "share": float(len(idx) / len(f)),
            "medians": {k: (None if not np.isfinite(med[k]) else float(med[k])) for k in DESCRIBE_FEATURES if k in med},
            "survive6_layoff_pct": float(f.loc[idx, "survives6_layoff"].mean() * 100),
            "survive6_combined_pct": float(f.loc[idx, "survives6_combined"].mean() * 100),
            "median_runway_layoff": float(np.nanmedian(f.loc[idx, "runway_layoff"].replace(np.inf, 120))),
            "distinguishing": distinguishing,
            "flag_prevalence": {k: float(v) for k, v in flags.head(5).items() if v > 0},
            "example_accounts": [int(a) for a in idx[:5]],
        })
    return out


def rule_name(desc: dict) -> dict:
    """Deterministic fallback names from the dominant medians."""
    m = desc["medians"]
    parts, stage, job, conf = [], "unknown", "unknown", 0.4
    if (m.get("pension_share") or 0) >= 0.5:
        parts.append("Pension-funded"); stage, job, conf = "retired", "retiree", 0.7
    elif (m.get("cash_deposit_share") or 0) >= 0.8 and (m.get("income_cv") or 0) >= 0.4:
        parts.append("Uneven cash earners"); job, conf = "self-employed / cash-paid work", 0.5
    elif (m.get("transfer_in_share") or 0) >= 0.6:
        parts.append("Steady transfer income"); job, conf = "salaried employee", 0.55
    else:
        parts.append("Cash-deposit households"); job = "mixed"
    if (m.get("spending_ratio") or 0) >= 0.97:
        parts.append("on the edge")
    elif (m.get("buffer_months") or 0) >= 12:
        parts.append("with deep savings")
    if (m.get("has_running_loan") or 0) >= 0.5:
        parts.append("carrying a loan")
    age = m.get("owner_age")
    if age is not None and stage == "unknown":
        stage = "young adult" if age < 30 else "mid-career" if age < 50 else "pre-retirement" if age < 65 else "retired"
    return {"id": desc["id"], "name": " ".join(parts)[:60], "description": "Named by rules from the cluster medians; no model available.",
            "likely_life_stage": stage, "likely_occupation": job, "confidence": conf,
            "evidence": ", ".join(f"{d['feature']} {d['cluster_median']:.2f} vs {d['population_median']:.2f}" for d in desc["distinguishing"][:3])}


NAMER_INSTRUCTION = """You are PULP's Archetype Namer. You receive, as JSON, the clusters of a bank's accounts: for each one the
median of its behavioural features, the features that most distinguish it from the population (z-scores), its survival
rates under a layoff shock, and the share of accounts carrying each flag. Feature meanings are provided.

For every cluster return a short concrete name (2-4 words a bank employee would use, no jargon), a one- or two-sentence
description of how this group's money behaves, a hedged likely life stage and likely occupation (say "unclear" when the
numbers do not support a guess), a confidence between 0 and 1, and the two or three numbers that drove your guess.
Use only the numbers given. Do not invent demographics. Return every cluster id exactly once."""


def name_clusters(descs: list[dict], use_ai: bool = True) -> tuple[list[dict], str]:
    if not (use_ai and adk_available()):
        return [rule_name(d) for d in descs], "rules"
    from .features import FEATURE_DOCS
    payload = json.dumps({"feature_meanings": {k: FEATURE_DOCS.get(k, k) for k in DESCRIBE_FEATURES},
                          "clusters": [{k: v for k, v in d.items() if k != "example_accounts"} for d in descs]}, default=float)
    agent = LlmAgent(name="archetype_namer", model=config.GEMINI_MODEL, description="Names behavioural clusters from their statistics.",
                     instruction=NAMER_INSTRUCTION, output_schema=ArchetypeNames, output_key="archetype_namer")
    try:
        res = run_agent(agent, payload, user_id="stage1")
        parsed = agent_output(res, "archetype_namer")
        names = ArchetypeNames.model_validate(parsed).archetypes
    except Exception as exc:  # fall back, never fail the pipeline
        fallback = [rule_name(d) for d in descs]
        for fb in fallback:
            fb["description"] += f" (model naming failed: {type(exc).__name__})"
        return fallback, "rules"
    by_id = {n.id: n.model_dump() for n in names}
    out = [by_id.get(d["id"]) or rule_name(d) for d in descs]
    return out, f"google-adk/{config.GEMINI_MODEL}"


def build_archetypes(f: pd.DataFrame | None = None, k: int = DEFAULT_K, use_ai: bool = True) -> dict:
    f = f if f is not None else get_features()
    labels = cluster_accounts(f, k=k)
    descs = describe_clusters(f, labels)
    names, source = name_clusters(descs, use_ai=use_ai)
    clusters = []
    for d, n in zip(descs, names):
        c = dict(d)
        c.update({k2: n[k2] for k2 in ("name", "description", "likely_life_stage", "likely_occupation", "confidence", "evidence")})
        clusters.append(c)
    return {"k": k, "method": "k-means on standardised behavioural features (n_init=10, seed 42), clusters relabelled by size",
            "features": CLUSTER_FEATURES, "naming_source": source, "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "n_accounts": int(len(f)), "clusters": clusters, "labels": {str(int(a)): int(l) for a, l in labels.items()}}


def save_archetypes(doc: dict, path: Path | None = None) -> Path:
    path = path or (config.DERIVED_WRITE_DIR / ARTEFACT)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1), encoding="utf-8")
    return path


_CACHE: dict = {}


def get_archetypes() -> dict:
    """Committed artefact if it matches the dataset; else compute with rule names and cache it."""
    if "doc" in _CACHE:
        return _CACHE["doc"]
    f = get_features()
    for d in config.DERIVED_READ_DIRS:
        p = Path(d) / ARTEFACT
        if p.exists():
            try:
                doc = json.loads(p.read_text(encoding="utf-8"))
                if doc.get("n_accounts") == len(f) and set(doc.get("labels", {}).keys()) == {str(int(a)) for a in f.index}:
                    doc["loaded_from"] = str(p)
                    _CACHE["doc"] = doc
                    return doc
            except Exception:
                continue
    doc = build_archetypes(f, use_ai=False)
    try:
        doc["loaded_from"] = str(save_archetypes(doc))
    except Exception:
        doc["loaded_from"] = "memory"
    _CACHE["doc"] = doc
    return doc


def archetype_for(account_id: int) -> dict | None:
    doc = get_archetypes()
    cid = doc["labels"].get(str(int(account_id)))
    if cid is None:
        return None
    c = next((c for c in doc["clusters"] if c["id"] == cid), None)
    if not c:
        return None
    return {"id": cid, "name": c["name"], "description": c["description"], "likely_life_stage": c["likely_life_stage"],
            "likely_occupation": c["likely_occupation"], "confidence": c["confidence"], "evidence": c["evidence"],
            "share": c["share"], "size": c["size"], "survive6_layoff_pct": c["survive6_layoff_pct"],
            "naming_source": doc["naming_source"]}


def flag_catalog() -> list[dict]:
    return [{"key": fr.key, "label": fr.label, "severity": fr.severity} for fr in FLAG_RULES]
