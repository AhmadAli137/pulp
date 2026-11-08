"""Life Fit Assessor: does a decision fit this person's stage of life, body, time and household?

The Life Planner knows money. This agent knows the person: their age (and so how physically demanding a plan can be),
how much time a shared household leaves, whether a lodger works in a home shared with a partner, whether a move is
realistic at 58, whether gig work exists in a rural district. It builds a capacity profile from the persona and the
records, then scores every decision 0 to 1 with the reason. Poor fits are screened out; weaker fits cost points in the
objective. It also adds the decisions that suit later or earlier life (paid advice in your field, work from home,
starting CPP at 60, downsizing, a loan payment pause, a partner adding hours), so the search is not one-size-fits-all.

Amounts are fractions of the account's own figures; ages and rules are stated in the reason text.
"""
from __future__ import annotations

from typing import Any

# What each decision asks of a person: physical demand 0-1, hours a week, needs a spare room, a relocation.
DEMANDS: dict[str, dict] = {
    "second_job": {"physical": 0.5, "hours": 10},
    "gig": {"physical": 0.6, "hours": 12, "gig": True},
    "extra_hours": {"physical": 0.4, "hours": 6},
    "move": {"physical": 0.45, "relocation": True},
    "housing_share": {"needs_room": True, "hours": 1},
    "consulting": {"physical": 0.05, "hours": 5},
    "home_work": {"physical": 0.05, "hours": 6},
    "partner_hours": {"physical": 0.3, "hours": 8, "partner": True},
    "downsize": {"physical": 0.4, "relocation": True},
    "sell_items": {"physical": 0.2, "hours": 3},
    "move_back_home": {"relocation": True},
}


def _f(row: Any, k: str, d: float = 0.0) -> float:
    try:
        v = float(row.get(k, d))
        return v if v == v else d
    except (TypeError, ValueError):
        return d


def capacity(row: Any, persona: dict | None, ctx_text: str, urban_pct: float) -> dict:
    age = _f(row, "owner_age") or 40.0
    joint = _f(row, "n_authorized_users") > 0
    pension = _f(row, "pension_share") >= 0.5
    physical = 1.0 if age < 45 else 0.8 if age < 55 else 0.55 if age < 65 else 0.35
    if any(k in ctx_text for k in ("health", "injur", "back pain", "disab", "chronic", "surgery")):
        physical = min(physical, 0.35)
    time = 1.0
    if joint:
        time = 0.55 if 27 <= age <= 45 else 0.75
    if pension:
        time = min(time, 0.8)
    if any(k in ctx_text for k in ("caregiver", "caring for", "kids", "children", "no time", "busy")):
        time = min(time, 0.5)
    occ = ((persona or {}).get("occupation") or {}).get("label", "")
    return {"age": round(age), "physical": physical, "time": time, "joint": joint, "rural": urban_pct < 70, "pension": pension,
            "occupation": occ, "self_employed": _f(row, "cash_deposit_share") >= 0.8 and _f(row, "income_cv") >= 0.4,
            "summary": (f"Age {age:.0f}; physical capacity {'high' if physical >= 0.8 else 'moderate' if physical >= 0.5 else 'limited'}; "
                        f"{'shares the household' if joint else 'manages alone'}; {'rural' if urban_pct < 70 else 'urban'} district"
                        + (f"; {occ.lower()}" if occ else ""))}


def assess(step: Any, cap: dict) -> tuple[float, str]:
    """Fit 0-1 and a plain reason for one decision."""
    d = DEMANDS.get(getattr(step, "fit_key", "") or step.family, {})
    if step.decision.startswith("gig"):
        d = DEMANDS["gig"]
    fit = 1.0
    good, bad = [], []
    phys = d.get("physical", 0.0)
    if phys:
        loss = phys * (1 - cap["physical"]) * 1.4
        fit -= loss
        (bad if loss >= 0.15 else good).append(f"{'physically demanding' if phys >= 0.4 else 'light physical effort'}" + (f" at {cap['age']}" if loss >= 0.15 else ""))
    hours = d.get("hours", 0)
    if hours:
        loss = (hours / 20) * (1 - cap["time"]) * 1.2
        fit -= loss
        (bad if loss >= 0.1 else good).append(f"about {hours} hours a week" + (" in a busy household" if loss >= 0.1 else ""))
    if d.get("needs_room"):
        fit -= 0.15
        bad.append("assumes a spare room")
        if cap["joint"]:
            fit -= 0.25
            bad.append("a home shared with a partner")
        if cap["rural"]:
            fit -= 0.15
            bad.append("fewer people looking for rooms in a rural district")
    if step.family == "downsize":
        fit -= 0.2
        bad.append("assumes you own your home")
    if d.get("relocation"):
        if cap["age"] >= 55:
            fit -= 0.3
            bad.append(f"moving is a big upheaval at {cap['age']}")
        if cap["joint"]:
            fit -= 0.15
            bad.append("a move uproots the whole household")
    if d.get("gig") and cap["rural"]:
        fit -= 0.25
        bad.append("little gig work in a rural district")
    if step.family == "consulting" and cap["age"] >= 45:
        fit += 0.1
        good.append("draws on years of experience")
    if step.family == "home_work":
        good.append("from home, on your schedule")
    if not d:
        good.append("no physical or time demands")
    fit = max(0.0, min(1.0, fit))
    note = ("fits well: " + ", ".join(good)) if fit >= 0.7 and not bad else (
        ("harder for you: " + ", ".join(bad)) if bad else "fits: " + ", ".join(good))
    return round(fit, 2), note


def extra_decisions(a: Any, shock: Any, goals: list, horizon: int, Step: type, money: Any) -> list:
    """Decisions that fit particular stages of life, added to the Life Planner's catalog."""
    r = a.row
    I, S, P = a.I, a.S, a.P
    age = _f(r, "owner_age") or 40.0
    joint = _f(r, "n_authorized_users") > 0
    pension = _f(r, "pension_share") >= 0.5
    start = shock.start or 1
    out = []
    if age >= 40 and not pension:
        out.append(Step(decision="consulting", family="consulting", title="Paid advice in your field",
                        detail=f"A few hours a week of consulting, training or mentoring in work you know, about {money(0.1 * I)} a month.",
                        category="income", month_start=1, month_end=min(horizon, 18), monthly_effect=0.1 * I, disruption=0.12,
                        because="Experience earns more per hour than a second job, with less wear on the body.",
                        evidence=f"Age about {age:.0f}, money in {money(I)} a month"))
    if not pension:
        out.append(Step(decision="home_work", family="home_work", title="Work from home a few hours a week",
                        detail=f"Tutoring, bookkeeping or online work from home, about {money(0.07 * I)} a month.",
                        category="income", month_start=start, month_end=min(horizon, start + 11), monthly_effect=0.07 * I, disruption=0.1,
                        because="Income that fits around the rest of life, with no commute.",
                        evidence="Works from home; hours flex to what the household allows"))
    if joint:
        out.append(Step(decision="partner_hours", family="partner_hours", title="Your partner adds a few hours",
                        detail=f"The other person on the account picks up extra paid hours, about {money(0.1 * I)} a month.",
                        category="income", month_start=start, month_end=min(horizon, start + max(5, shock.duration)), monthly_effect=0.1 * I,
                        disruption=0.18, because="Two earners can share the load instead of one person taking it all.",
                        evidence="Two people can use this account"))
    if 58 <= age < 64 and not pension:
        m0 = int(round((60 - age) * 12)) + 1 if age < 60 else 1
        if m0 <= horizon:
            out.append(Step(decision="cpp_at_60", family="pension_timing", title="Start CPP at 60",
                            detail=f"Take the Canada Pension Plan early from month {m0}: smaller payments for life (about 36% less than at 65), roughly {money(0.12 * I)} a month.",
                            category="income", month_start=m0, month_end=horizon, monthly_effect=0.12 * I, disruption=0.15,
                            because="Starting early trades a smaller lifetime pension for money now, when the cushion needs it.",
                            evidence=f"Age about {age:.0f}, no pension income in the records yet"))
    try:
        from .data_store import get_store
        so = get_store().standing_orders
        rents = bool(((so["account_id"] == a.account_id) & (so["purpose"] == "household bills")).any())
    except Exception:
        rents = False
    if age >= 55 and not rents and horizon >= 24:
        out.append(Step(decision="downsize", family="downsize", title="Downsize the home (if you own it)",
                        detail=f"Move to a smaller place and keep part of the difference, about {money(6 * S)} once, after a year of selling and moving.",
                        category="housing", month_start=min(horizon, 13), month_end=horizon, one_off=6 * S, disruption=0.4,
                        because="Later in life, the home is often the largest store of money, and a smaller one costs less to run.",
                        evidence=f"Age about {age:.0f}; no rent-like standing order, but ownership is an assumption the records cannot confirm"))
    if P > 0 and shock.start:
        out.append(Step(decision="payment_holiday", family="payment_holiday", title="Ask the bank for a 3-month payment pause",
                        detail=f"Pause the {money(P)} loan payment for three months during the shock, then repay it over the following year.",
                        category="debt", month_start=start, month_end=start + 2, monthly_effect=P, disruption=0.05, effect="holiday",
                        because="Banks often allow a short pause for a job loss; it buys time without new debt.",
                        evidence=f"Running loan payment {money(P)} a month"))
    if _f(r, "cash_deposit_share") >= 0.8 and _f(r, "income_cv") >= 0.4:
        out.append(Step(decision="raise_rates", family="raise_rates", title="Raise your rates 5%",
                        detail=f"Charge regular clients 5% more from the next quarter, about {money(0.05 * I)} a month.",
                        category="income", month_start=3, month_end=horizon, monthly_effect=0.05 * I, disruption=0.08,
                        because="For self-employed income, price is a lever a salaried person does not have.",
                        evidence=f"{_f(r, 'cash_deposit_share'):.0%} of money in is cash and it varies month to month"))
    out.append(Step(decision="sell_items", family="sell_items", title="Sell things you no longer use",
                    detail=f"A clear-out sale (furniture, equipment, a second vehicle if there is one), about {money(0.3 * S)} once.",
                    category="spending", month_start=start, month_end=start, one_off=0.3 * S, disruption=0.05,
                    because="Money sitting in things can cushion the first month of a shock.", evidence="Most households have some"))
    ins = S * _f(r, "insurance_share")
    if ins > 0:
        out.append(Step(decision="insurance_review", family="insurance_review", title="Shop around for insurance",
                        detail=f"Compare quotes on the {money(ins)} a month of insurance, saving about {money(0.15 * ins)} a month.",
                        category="spending", month_start=1, month_end=horizon, monthly_effect=0.15 * ins, disruption=0.02,
                        because="Premiums drift up at renewal; a comparison usually finds a cheaper equal policy.",
                        evidence=f"Insurance is {_f(r, 'insurance_share'):.0%} of spending"))
    if age < 30 and not joint:
        out.append(Step(decision="move_back_home", family="move_back_home", title="Live with family for a few months",
                        detail=f"Move in with family for six months and save most of what housing costs, about {money(0.25 * S)} a month.",
                        category="housing", month_start=start, month_end=min(horizon, start + 5), monthly_effect=0.25 * S, disruption=0.3,
                        because="At this stage, family can be the cheapest safety net.", evidence=f"Age about {age:.0f}, manages money alone"))
    return out
