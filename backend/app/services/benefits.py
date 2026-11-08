"""The bottom line for one account: what using PULP gives this person, in time, money, perspective and control.

Every number is computed from the account's records or from the engine, and every item says what it rests on. Time
saved compares an explicit by-hand estimate (stated assumptions) with the seconds PULP took. Money saved is split into
costs already visible in the records (annualised) and the shortfall a plan avoids if a layoff hits. Nothing here is a
promise; it is what the records and the engine show.
"""
from __future__ import annotations

import math
import time
from typing import Any

MONEY_COLUMNS = 13  # money columns per month in monthly_summary.csv (in, out, and the parts of each)
MIN_PER_MONTH = 3  # minutes to categorise one month of statements by hand
BUDGET_HOURS = 2  # building a monthly budget from those categories
SCENARIO_HOURS = 1  # one shock scenario in a spreadsheet
SCENARIOS = 3


def _f(row: Any, k: str, d: float = 0.0) -> float:
    try:
        v = float(row.get(k, d))
        return v if math.isfinite(v) else d
    except (TypeError, ValueError):
        return d


def _m(x: float) -> str:
    return f"${x:,.0f}"


def _mo(x: float) -> str:
    return f"{x:.0f}" if abs(x - round(x)) < 0.05 else f"{x:.1f}"


def benefits(account_id: int) -> dict:
    t0 = time.perf_counter()
    from . import context_manager as cm
    from .data_store import get_store
    from .features import flags_for, get_features
    f = get_features()
    if account_id not in f.index:
        raise KeyError(account_id)
    row = f.loc[account_id]
    store = get_store()
    S, I, B = _f(row, "S"), _f(row, "I"), _f(row, "B")
    months = int(_f(row, "months"))
    so = store.standing_orders
    n_so = int((so["account_id"] == account_id).sum()) if not so.empty else 0
    loan = store.loan_for(account_id)

    # ---- money: costs already visible in the records, annualised
    money_items = []
    pen = _f(row, "penalty_total")
    if pen > 0 and months:
        yearly = pen / months * 12
        money_items.append({"label": "Penalty interest for dipping below zero", "amount": round(yearly, 2), "kind": "found in your records",
                            "basis": f"{_m(pen)} charged over {months} months of records, annualised; moving bill dates after payday stops it"})
    fee = _f(row, "fee_share")
    median_fee = float(f["fee_share"].median())
    extra_fee = max(0.0, fee - median_fee) * S * 12
    if extra_fee >= 1:
        money_items.append({"label": "Bank fees above the typical account", "amount": round(extra_fee, 2), "kind": "found in your records",
                            "basis": f"fees are {fee:.2%} of what goes out against {median_fee:.2%} for the median account, on {_m(S)} a month"})
    dec = _f(row, "december_spend_ratio")
    if dec > 1.2:
        over = (dec - 1.2) * S
        money_items.append({"label": "December spending above a 1.2x budget", "amount": round(over, 2), "kind": "found in your records",
                            "basis": f"December runs at {dec:.1f}x a typical month of {_m(S)}; a budget of 1.2x keeps the difference"})
    per_year = round(sum(i["amount"] for i in money_items), 2)

    # ---- the layoff: change nothing vs the best-balance plan (the Life Planner, not stored)
    from .life_planner import run
    lp = run(account_id, {"income_fraction": 0.55, "bills_increase": 0.0, "one_off_cost": 0.0, "shock_duration": 6, "label": "Laid off for 6 months"},
             store=False)
    base = lp["baseline"]["outcome"]
    best = next((p for p in lp["plans"] if p.get("role") == "best_tradeoff"), lp["plans"][0] if lp["plans"] else None)
    without = float(base["shortfall_total"])
    with_plan = float(best["outcome"]["shortfall_total"]) if best else without
    shock = {"label": "Laid off for 6 months on 55% of income (EI)", "shortfall_without": round(without, 2), "shortfall_with_plan": round(with_plan, 2),
             "avoided": round(max(0.0, without - with_plan), 2), "plan": best["name"] if best else None, "kind": "if a layoff hits",
             "basis": "month-by-month simulation over the plan horizon: the money that would run short with no change, against the best-balance plan"}

    # ---- perspective
    flags = flags_for(row)
    persp = []
    try:
        from .discovery import discovery
        d = discovery(account_id).get("discovery")
    except Exception:
        d = None
    if d:
        persp.append({"label": d["title"], "text": d["plain"], "basis": d.get("rarity") or d.get("evidence", "")})
    try:
        from .archetypes import archetype_for
        arch = archetype_for(account_id)
    except Exception:
        arch = None
    if arch:
        persp.append({"label": "Who you are like", "text": f"Your money behaves like the '{arch['name']}' group, {arch['share']:.0%} of the 4,500 accounts.",
                      "basis": "k-means clusters over the behavioural signals"})
    try:
        from .demographics import demographics
        ins = (demographics(account_id).get("insights") or [None])[0]
    except Exception:
        ins = None
    if ins:
        persp.append({"label": ins.get("title", "Where you live"), "text": ins.get("plain", ""), "basis": ins.get("technical", "")[:200]})
    persp.append({"label": "Patterns in your own records", "text": f"{len(flags)} patterns stood out, each with the evidence behind it.",
                  "basis": "evidence-backed flag rules over about 78 signals"})

    # ---- control
    dur = lp["shock"]["duration"] or 6
    covered_now = min(float(base["months_covered"]), dur)
    covered_plan = min(float(best["outcome"]["months_covered"]), dur) if best else covered_now
    ctx = cm.load_context(account_id)
    dated_goals = sum(1 for x in ctx.get("goals", []) if (x.get("value") or {}).get("target_months"))
    search = lp.get("search") or {}
    control = {
        "runway_now_months": round(float(covered_now), 1), "runway_with_plan_months": round(float(covered_plan), 1),
        "runway_gain_months": round(max(0.0, covered_plan - covered_now), 1), "plans_tried": int(search.get("generated", 0)),
        "choices": len(lp.get("plans") or []), "goals_with_dates": dated_goals,
        "items": [
            {"label": "Months a layoff is covered", "text": f"{_mo(covered_now)} of 6 today, {_mo(covered_plan)} of 6 with the best-balance plan.",
             "basis": "the same simulation as the money figure"},
            {"label": "Real choices, not one answer", "text": f"{search.get('generated', 0)} plans tried, {len(lp.get('plans') or [])} distinct finalists to choose from.",
             "basis": "the Life Planner search, screened for your life"},
            {"label": "See a shock before it happens", "text": "Any shock can be tried on your own numbers in seconds, before it is real.",
             "basis": "the official formula, run on demand"},
            {"label": "Every change is yours to undo", "text": "Nothing Pulp learns about you is permanent; each change is logged and reversible.",
             "basis": "the profile change log"},
        ] + ([{"label": "Goals with a date", "text": f"{dated_goals} goals have a target date and a weight in every plan.",
               "basis": "your profile"}] if dated_goals else []),
    }

    # ---- time
    line_items = months * MONEY_COLUMNS
    hours = months * MIN_PER_MONTH / 60 + BUDGET_HOURS + SCENARIO_HOURS * SCENARIOS
    elapsed = time.perf_counter() - t0
    pulp_seconds = round(max(1.0, elapsed + (lp.get("elapsed_ms") or 0) / 1000), 1)
    time_part = {
        "hours_saved": round(hours, 1), "pulp_seconds": pulp_seconds,
        "basis": (f"By hand: {MIN_PER_MONTH} minutes to categorise each of {months} months of statements, {BUDGET_HOURS} hours to build a budget, "
                  f"{SCENARIO_HOURS} hour per shock scenario in a spreadsheet x {SCENARIOS}. Pulp: measured for this account."),
        "items": [f"{months} months of records", f"{line_items:,} monthly amounts read",
                  f"{n_so} standing order{'s' if n_so != 1 else ''}", "a running loan" if loan is not None else "no running loan",
                  f"{search.get('generated', 0)} plans simulated month by month"],
    }

    # ---- headline
    took = "under two seconds" if pulp_seconds < 2 else f"about {_mo(pulp_seconds)} seconds"
    parts = [f"Pulp read {months} months of records in {took}"]
    if per_year >= 1:
        parts.append(f"found about {_m(per_year)} a year you can stop losing")
    if without > 0:
        parts.append(f"and a plan that turns a {_m(without)} layoff shortfall into " + ("none" if with_plan <= 0 else _m(with_plan)))
    elif covered_now >= dur:
        parts.append("and showed your cushion already covers a six-month layoff")
    headline = (", ".join(parts[:-1]) + (", " if len(parts) > 2 else " ") + parts[-1] if len(parts) > 1 else parts[0]) + "."
    headline = headline.replace(", and", " and") if len(parts) == 2 else headline

    return {"account_id": int(account_id), "headline": headline, "time": time_part,
            "money": {"per_year": per_year, "items": money_items, "shock": shock},
            "perspective": {"count": len(persp), "headline": persp[0]["text"] if persp else "", "items": persp},
            "control": control, "elapsed_ms": round(elapsed * 1000)}
