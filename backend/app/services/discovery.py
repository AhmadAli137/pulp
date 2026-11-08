"""The biggest discovery for one account: the single finding most worth telling this person.

Candidates are the account's flags (each with evidence), its strongest demographic insight and its most unusual trait.
They are ranked by how serious the finding is, how rare it is across all 4,500 accounts, and whether it is something
people would not see for themselves (a spotless record that still fails a layoff, a balance that dips on timing rather
than shortage). Every number comes from code; the wording is fixed templates over the flag evidence.
"""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

SEVERITY = {"risk": 1.0, "watch": 0.8, "info": 0.6}
# Findings people rarely notice on their own get a boost.
NON_OBVIOUS = {"fragile_but_clean": 1.3, "timing_dips": 1.3, "no_adjustment_when_hit": 1.2, "weathered_before": 1.2,
               "cuts_when_hit": 1.15, "penalty_interest": 1.15, "slow_recovery": 1.1, "savings_elsewhere": 1.1,
               "lifestyle_creep": 1.1, "rent_pressure": 1.1}
TOTAL = 4500


def _m(x: float) -> str:
    return f"${x:,.0f}"


def _f(row: Any, k: str, d: float = 0.0) -> float:
    try:
        v = float(row.get(k, d))
        return v if math.isfinite(v) else d
    except (TypeError, ValueError):
        return d


@lru_cache(maxsize=1)
def _prevalence() -> dict[str, float]:
    from .features import flag_matrix, get_features
    return {k: float(v) for k, v in flag_matrix(get_features()).mean().items()}


def _action(key: str, row: Any) -> str:
    S, I, B = _f(row, "S"), _f(row, "I"), _f(row, "B")
    gap = max(0.0, S - 0.55 * I)
    if key == "fragile_but_clean":
        need = max(0.0, 6 * gap - B)
        return (f"Six months on 55% income needs about {_m(6 * gap)} in the cushion; that is {_m(need)} more than today."
                if need > 0 else "Keep the cushion where it is; it now covers six months on 55% income.")
    if key in ("timing_dips", "penalty_interest"):
        pay, bill = _f(row, "payday_dom"), _f(row, "bill_dom")
        if pay and bill:
            return f"Ask billers to collect after the {int(pay)}th, when pay usually lands, instead of around the {int(bill)}th."
        return "Move bill dates to just after payday; the money is there, it arrives a few days late."
    if key == "thin_margin":
        return f"Even {_m(0.05 * S)} a month kept back would start a cushion; the plans in My Plan show where it could come from."
    if key == "loan_stress":
        return "Protect the loan payment first in any shock; refinancing to a longer term is one of the plans worth comparing."
    if key == "savings_elsewhere":
        return "Tell Pulp what the regular transfer is for; if it is savings you can reach, your real cushion is bigger."
    if key == "weathered_before":
        return "Your past response is evidence: plans can lean on the habits that got you through last time."
    if key == "cuts_when_hit":
        return "That reflex shortens any shock; the plans assume you would do it again."
    if key == "no_adjustment_when_hit":
        return "Decide now what you would cut first, so the cushion does not take the whole hit next time."
    if key == "slow_recovery":
        return "A second shock soon after would land on a thinner cushion; rebuilding it is the first step of the plans."
    if key == "lifestyle_creep":
        return "Bringing spending back to last year's level is a goal in your profile you can keep or drop."
    if key == "balance_sliding":
        return "The cushion has been shrinking without a shock; the long-term plan shows how to turn it around."
    if key == "deep_buffer":
        return "The question is what the cushion is for: some of it may work harder toward a goal."
    return "See the plans in My Plan for what to do about it."


def discovery(account_id: int) -> dict:
    from .features import flags_for, get_features
    f = get_features()
    if account_id not in f.index:
        raise KeyError(account_id)
    row = f.loc[account_id]
    prev = _prevalence()
    cands: list[dict] = []
    for fl in flags_for(row):
        p = prev.get(fl["key"], 0.5)
        score = SEVERITY.get(fl["severity"], 0.6) * (1 - p) * NON_OBVIOUS.get(fl["key"], 1.0)
        insight = fl["insight"][0].upper() + fl["insight"][1:]
        cands.append({"kind": "flag", "key": fl["key"], "title": fl["label"], "plain": f"{insight}.", "evidence": fl["evidence"][0].upper() + fl["evidence"][1:] + ".",
                      "rarity": f"Only {p:.0%} of the {TOTAL:,} accounts show this." if p < 0.25 else f"{p:.0%} of the {TOTAL:,} accounts show this.",
                      "share": round(p, 4), "severity": fl["severity"], "action": _action(fl["key"], row), "score": round(score, 4),
                      "link": "/insights"})
    try:
        from .demographics import demographics
        for ins in demographics(account_id).get("insights", [])[:3]:
            if ins.get("strength") in ("strong", "moderate"):
                cands.append({"kind": "demographic", "key": ins["key"], "title": ins["title"], "plain": ins["plain"], "evidence": ins["technical"],
                              "rarity": ins.get("compare") or "", "share": None, "severity": "info",
                              "action": "See how your age, household and district compare on Insights.",
                              "score": 0.62 if ins["strength"] == "strong" else 0.45, "link": "/insights"})
    except Exception:
        pass
    if not cands:
        from .features import account_feature_summary
        summ = account_feature_summary(f, account_id)
        best = max(((k, v) for k, v in summ.items() if isinstance(v, dict) and v.get("percentile") is not None),
                   key=lambda kv: abs(kv[1]["percentile"] - 50), default=None)
        if best:
            k, v = best
            p = v["percentile"]
            cands.append({"kind": "trait", "key": k, "title": "What sets you apart", "plain": f"Your {v['doc']} is higher than {p:.0f}% of accounts." if p >= 50
                          else f"Your {v['doc']} is lower than {100 - p:.0f}% of accounts.", "evidence": f"{k} = {v['value']:.3g}",
                          "rarity": "", "share": None, "severity": "info", "action": "See Insights for what it means.", "score": 0.3, "link": "/insights"})
    cands.sort(key=lambda c: c["score"], reverse=True)
    top = cands[0] if cands else None
    return {"account_id": account_id, "discovery": top, "runners_up": cands[1:3],
            "method": "Ranked by severity x rarity across all accounts x how unlikely you are to notice it yourself; numbers from the engine and the flag evidence."}


def spoken(account_id: int) -> str | None:
    """One sentence for Pulp to open with."""
    try:
        d = discovery(account_id)["discovery"]
    except Exception:
        return None
    if not d:
        return None
    return f"The biggest thing I found in your records: {d['plain'][0].lower()}{d['plain'][1:]}"
