"""Personalized goal ideas: goals tied to one specific signal in this account's records.

General goals (an emergency fund, retirement) fit anyone. These fit one person: the loan they are actually paying off
and when it ends, the car lease that leaves by standing order, the overdraft interest they keep paying, the rent-sized
standing order, the uneven cash income, how their income compares with their district's salary. Each idea carries the
evidence it rests on and is sized from the account's own figures (S, I, P, the standing order); nothing is invented.

A "lens" lets people (and us) experiment with personalization: the same ideas re-ranked for safety, ambition, life
events or money habits. A model, when available, may choose among the eligible ideas and reword them; it cannot add an
idea that is not eligible or change an amount.
"""
from __future__ import annotations

import json
import math
from datetime import date
from typing import Any, Callable

AS_OF = date(2025, 12, 31)
URGENCY = {"short": 1.0, "medium": 0.75, "long": 0.5}
LENSES = {
    "balanced": "A mix of protection, growth and the things in your records that stand out",
    "safety": "Protection first: cushions, smoother months, fewer surprises",
    "ambitious": "Growth: owning, investing and earning more",
    "life": "Life events the records point to: a lease ending, a loan finishing, retirement, family",
    "habits": "Money habits: interest, fees, timing and spending drift",
}
LENS_BOOST = {
    "safety": {"safety": 1.6, "habit": 1.1, "growth": 0.6, "life": 0.9},
    "ambitious": {"growth": 1.7, "life": 1.0, "safety": 0.7, "habit": 0.8},
    "life": {"life": 1.7, "growth": 1.0, "safety": 0.8, "habit": 0.8},
    "habits": {"habit": 1.8, "safety": 1.0, "growth": 0.7, "life": 0.8},
    "balanced": {},
}


def _f(row: Any, k: str, d: float = 0.0) -> float:
    try:
        v = float(row.get(k, d))
        return v if math.isfinite(v) else d
    except (TypeError, ValueError):
        return d


def _m(x: float) -> str:
    return f"${x:,.0f}"


def _round(x: float) -> float:
    step = 100 if x < 5000 else 500 if x < 20000 else 1000 if x < 100000 else 5000
    return float(max(step, round(x / step) * step))


def _month_name(months_from_now: int) -> str:
    y, m = AS_OF.year, AS_OF.month + months_from_now
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    return date(y, m, 1).strftime("%b %Y")


def _idea(key, label, gtype, size, horizon, target, months, importance, why, evidence, family, relevance, signal):
    return {"id": key, "key": key, "type": gtype, "label": label, "size": size, "horizon": horizon, "target_amount": _round(target),
            "target_months": int(max(1, months)), "importance": int(max(1, min(5, importance))), "why": why, "evidence": evidence,
            "source": "persona", "personal": True, "family": family, "relevance": round(float(relevance), 3), "signal": signal}


def _context(account_id: int) -> dict:
    from .data_store import get_store
    store = get_store()
    so = store.standing_orders
    mine = so[so["account_id"] == account_id] if not so.empty else so
    loan = store.loans[store.loans["account_id"] == account_id]
    return {"so": mine.to_dict("records") if len(mine) else [], "loan": loan.iloc[0].to_dict() if len(loan) else None}


def ideas(account_id: int) -> list[dict]:
    """Every eligible personalized goal idea, before any lens."""
    from .features import get_features
    f = get_features()
    row = f.loc[account_id]
    S, I, B, P, H = (max(0.0, _f(row, k)) for k in ("S", "I", "B", "P", "H"))
    S = max(S, 1.0)
    age = _f(row, "owner_age") or 40
    surplus = I - S
    ctx = _context(account_id)
    out: list[dict] = []

    # Life events the records point to
    loan = ctx["loan"]
    if loan and str(loan.get("status")) in ("C", "D") and P > 0:
        try:
            start = date.fromisoformat(str(loan["loan_start"])[:10])
            elapsed = (AS_OF.year - start.year) * 12 + AS_OF.month - start.month
            left = max(1, int(loan["duration_months"]) - max(0, elapsed))
        except Exception:
            left = 24
        early = min(12, max(3, left // 3))
        out.append(_idea("loan_early", f"Be loan-free by {_month_name(left - early)}, {early} months early", "debt", "large",
                         "medium" if left - early <= 36 else "long", early * P, max(1, left - early), 4,
                         f"The loan ends in {_month_name(left)} on schedule; paying {early} payments ahead frees {_m(P)} a month sooner.",
                         f"Loan of {_m(float(loan['amount']))} from {str(loan['loan_start'])[:7]}, {int(loan['duration_months'])} months at {_m(P)}; about {left} payments left",
                         "life", 0.75 + min(0.2, _f(row, "loan_payment_share")), "loan"))
    lease = sum(float(o["amount"]) for o in ctx["so"] if str(o.get("purpose")) == "leasing")
    if lease > 0:
        out.append(_idea("lease_end", "A down payment ready for when the lease ends", "vehicle", "large", "medium", 8 * lease, 24, 4,
                         "Leases end on a date you know; having a down payment ready means choosing the next car instead of taking whatever lease is offered.",
                         f"A leasing payment of {_m(lease)} leaves every month by standing order", "life", 0.85, "leasing"))
    rent = sum(float(o["amount"]) for o in ctx["so"] if str(o.get("purpose")) == "household bills")
    if rent >= 0.2 * S and age < 55 and not loan:
        out.append(_idea("rent_to_own", f"Turn the {_m(rent)} a month for housing into a down payment", "home", "large", "long", 40 * rent, 60, 4,
                         "A standing order this size usually means rent; a down payment would turn that money into something you own.",
                         f"A standing order of {_m(rent)} a month labelled household bills, {rent / S:.0%} of spending", "growth", 0.8, "rent"))
    if 55 <= age < 65 and _f(row, "pension_share") < 0.5:
        years = max(1, round(65 - age))
        out.append(_idea("retirement_bridge", f"A first-year-of-retirement fund, {years} years out", "retirement", "large", "long", 12 * S, years * 12, 4,
                         "The first year after work stops is when savings matter most, before pensions settle into a rhythm.",
                         f"Age about {age:.0f}; no pension income yet; typical spending {_m(S)} a month", "life", 0.8, "age"))
    transfer = _f(row, "recurring_partner_amount")
    purpose = str(row.get("recurring_partner_purpose") or "")
    if transfer > 0 and purpose == "":
        out.append(_idea("support_reserve", "Six months of the support you send, set aside", "family", "large" if 6 * transfer > 3 * S else "small", "medium",
                         6 * transfer, 18, 3, "Someone counts on that transfer; a reserve keeps it going if your own income dips.",
                         f"A steady {_m(transfer)} a month goes to the same account ({int(_f(row, 'recurring_partner_months'))} months, no label)", "life", 0.7, "transfer"))

    # Safety: smoother months
    gap = max(0.0, S - 0.55 * I)
    runway = _f(row, "runway_layoff", 120.0)
    if gap > 0 and runway < 6:
        need = max(0.0, 6 * gap - B)
        out.append(_idea("layoff_proof", "Layoff-proof: cover six months on EI", "emergency_fund", "large" if need > 3 * S else "small", "medium",
                         need, 18, 5, f"On 55% of income you would be {_m(gap)} short each month; this closes the gap for six months.",
                         f"Today the cushion lasts {runway:.1f} months of a layoff; six months needs {_m(6 * gap)}", "safety", 0.9, "runway_layoff"))
    ratio = _f(row, "spending_ratio")
    if ratio >= 0.95:
        out.append(_idea("keep_back", "Keep back 5% of every deposit", "habit", "small", "short", 0.05 * I * 12, 12, 3,
                       "When nearly everything that comes in goes out, a fixed slice set aside first is the habit that builds a cushion.",
                       f"Spending runs at {ratio:.0%} of income", "habit", 0.55 + min(0.3, (ratio - 0.95) * 2), "thin_margin"))
    cv = _f(row, "income_cv")
    if cv >= 0.5:
        out.append(_idea("slow_month_fund", "A slow-month fund to pay yourself a steady wage", "income_smoothing", "large" if 2 * I > 3 * S else "small", "short",
                         2 * I, 12, 4, "With uneven income, a fund that tops up the lean months lets you budget as if you were salaried.",
                         f"Income swings a lot: volatility {cv:.2f}, regular in only {_f(row, 'inflow_regular_share'):.0%} of months", "safety", 0.6 + min(0.3, cv / 4), "income_cv"))
    cash = _f(row, "cash_deposit_share")
    if cash >= 0.8 and cv >= 0.4:
        out.append(_idea("tax_setaside", "Set aside for tax on cash or self-employed income (if that is you)", "tax", "small", "short", 0.15 * I * 12 * 0.25, 12, 3,
                         "Cash and contract income often has no tax taken off; a set-aside avoids a large bill in spring.",
                         f"{cash:.0%} of money in arrives as cash deposits", "safety", 0.55, "cash_income"))
    if B >= 6 * S:
        out.append(_idea("put_cash_to_work", "Put the cash above six months to work", "investing", "large", "long", max(0.0, B - 6 * S), 36, 3,
                         "Beyond six months of spending, cash in the account loses ground to prices.",
                         f"The cushion is {_m(B)}, {B / S:.0f} months of spending", "growth", 0.7, "deep_buffer"))

    # Money habits
    penalty = _f(row, "penalty_total")
    neg = _f(row, "neg_months_share")
    if penalty > 0 or neg >= 0.1:
        out.append(_idea("overdraft_free", "Never pay overdraft interest again: a one-bill float", "habit", "small", "short", max(0.25 * S, H or 0.25 * S), 4, 4,
                         "A small float covers bills that land before pay, so the account stops going under on timing alone.",
                         (f"{_m(penalty)} in penalty interest paid" if penalty > 0 else f"Below zero in {neg:.0%} of months")
                         + (f"; bills leave around the {int(_f(row, 'bill_dom'))}th, pay lands around the {int(_f(row, 'payday_dom'))}th" if _f(row, 'bill_dom') and _f(row, 'payday_dom') else ""),
                         "habit", 0.65 + min(0.25, penalty / 500), "overdraft"))
    dec = _f(row, "december_spend_ratio")
    if dec >= 1.3:
        out.append(_idea("december_fund", f"A December fund so the holidays cost {dec:.1f}x without the hangover", "holidays", "small", "short", (dec - 1) * S, 11, 3,
                         "Saving a little each month for a spike you know is coming beats paying for it in January.",
                         f"December spending is {dec:.1f}x a typical month", "habit", 0.45 + min(0.35, (dec - 1.3)), "december"))
    creep = _f(row, "lifestyle_creep")
    if creep >= 0.005:
        out.append(_idea("spending_reset", "Bring spending back to where it was a year ago", "spending", "small", "short", 12 * creep * S * 6, 6, 3,
                         "Spending has been growing faster than income; resetting it restores the margin.",
                         f"Spending drifts up {creep * 100:.1f} points a month faster than income", "habit", 0.5 + min(0.3, creep * 20), "lifestyle_creep"))
    trend = _f(row, "balance_trend_pm")
    if trend <= -0.03:
        out.append(_idea("stop_the_slide", "Stop the slide: the cushion back to last year's level", "cushion", "small", "short", min(B, -trend * 12 * B), 9, 4,
                         "The cushion has been shrinking every month without a shock.",
                         f"The average balance falls about {-trend:.0%} of the cushion a month", "safety", 0.7, "balance_trend"))

    # Growth: earning and investing
    rel = _f(row, "inflow_vs_district_salary")
    ds = _f(row, "district_salary")
    if 0 < rel < 0.7 and age < 55 and _f(row, "pension_share") < 0.5:
        out.append(_idea("skills_fund", "A course or certification toward the local average salary", "career", "small", "medium", 1.5 * S, 12, 3,
                         f"Money in is below the {_m(ds)} average salary where the account is held; a qualification is often the fastest way to close that gap.",
                         f"Money in is {rel:.1f}x the district average salary", "growth", 0.55 + (0.7 - rel) * 0.5, "salary_gap"))
    if rel >= 1.8 and surplus > 0.1 * I:
        out.append(_idea("invest_surplus", "Invest part of the monthly surplus for five years", "investing", "large", "long", 30 * surplus, 60, 3,
                         "Earning well above the local average leaves room to build wealth, not just a cushion.",
                         f"Money in is {rel:.1f}x the district salary; about {_m(surplus)} is left over in a typical month", "growth", 0.65, "high_earner"))
    if age < 30:
        urban = _f(row, "district_unemployment") >= 0  # always true; place comes from the persona
        out.append(_idea("first_place", "Deposit and first month for a place of your own", "housing_move", "small", "short", 2 * S, 9, 4,
                         "Moving out or up is the next step at this age.", f"Age about {age:.0f}", "life", 0.6, "age"))
        del urban
    return out


LENS_FAMILY = {"safety": "safety", "ambitious": "growth", "life": "life", "habits": "habit"}


def broad_ideas(account_id: int) -> list[dict]:
    """Goals that suit most people, sized from this account's own spending and income, so every angle has something
    to offer even when the records show few specific signals. Ranked below the record-specific ideas."""
    from .features import get_features
    row = get_features().loc[account_id]
    S = max(_f(row, "S"), 1.0)
    I = max(_f(row, "I"), 0.0)
    age = _f(row, "owner_age") or 40
    joint = _f(row, "n_authorized_users") > 0
    cash_wd = _f(row, "cash_wd_share")
    ins = _f(row, "insurance_share")
    out = [
        # safety
        _idea("repairs_fund", "A repairs fund for the home and car", "repairs", "small", "medium", 1.0 * S, 12, 3,
              "Furnaces, brakes and roofs fail on their own schedule; a fund turns a crisis into an errand.",
              f"Sized at one month of your spending ({_m(S)})", "safety", 0.42, "spending"),
        _idea("health_fund", "A health and dental fund", "health", "small", "short", 0.3 * S, 9, 3,
              "Glasses, a crown or physio are rarely fully covered and always arrive at a bad time.",
              f"About {_m(0.3 * S)}, a third of a month's spending", "safety", 0.36, "spending"),
        _idea("cover_check", "Make sure your income is covered if you get sick", "insurance", "small", "short", 0.1 * S, 3, 3,
              "Disability or critical-illness cover protects the paycheque that every plan depends on.",
              "No insurance payments leave this account" if ins == 0 else f"Insurance is {ins:.0%} of spending today",
              "safety", 0.34 if ins == 0 else 0.2, "insurance"),
        # growth
        _idea("invest_monthly", "Invest a small fixed amount every month", "investing", "small", "long", 0.03 * I * 60, 60, 3,
              "A small automatic amount, started now, grows more than a large one started later.",
              f"About {_m(0.03 * I)} a month, 3% of what comes in", "growth", 0.4, "income"),
        _idea("side_income_seed", "A starter fund for a side income", "side_income", "small", "short", 0.5 * S, 6, 2,
              "Tools, a course or a licence can be the first step to a second income stream.",
              f"About half a month of spending ({_m(0.5 * S)})", "growth", 0.33, "spending"),
        _idea("raise_fund", "Save for the move that gets you a raise", "career", "small", "medium", 1.0 * S, 18, 3,
              "A certification, a portfolio or the cost of interviewing elsewhere often pays for itself in a year.",
              f"Income today {_m(I)} a month", "growth", 0.3, "income"),
        # life events
        _idea("big_trip", "A trip you've been putting off", "travel", "small", "medium", 1.5 * S, 24, 3,
              "Planned and saved for, a trip is a memory instead of a credit card bill.",
              f"About one and a half months of spending ({_m(1.5 * S)})", "life", 0.35, "spending"),
        _idea("next_car", "The next car, paid for in cash", "vehicle", "large", "long", 6 * S, 48, 3,
              "Buying the next car with savings avoids years of loan payments.", f"About six months of spending ({_m(6 * S)})",
              "life", 0.3, "spending"),
        _idea("celebration", "A celebration fund for the big moments", "celebration", "small", "medium", 1.0 * S, 18, 2,
              "Weddings, milestone birthdays and graduations come with costs that are easy to see coming.",
              "Two people share this account" if joint else f"Age about {age:.0f}", "life", 0.28, "life"),
        # habits
        _idea("no_spend_weekend", "One no-spend weekend a month", "habit", "small", "short", 0.04 * S * 12, 12, 2,
              "A weekend a month with nothing spent resets what feels normal, and the savings add up quietly.",
              f"Worth about {_m(0.04 * S)} a month at your usual spending", "habit", 0.38, "spending"),
        _idea("subscription_audit", "Cancel what you no longer use", "habit", "small", "short", 0.02 * S * 12, 6, 2,
              "Subscriptions and memberships creep in and rarely leave on their own.", "A once-a-year audit of standing payments",
              "habit", 0.32, "spending"),
    ]
    if cash_wd >= 0.6:
        out.append(_idea("cash_limit", "Set a weekly cash limit", "habit", "small", "short", 0.05 * S * 12, 12, 3,
                         "Cash leaves no trail, so a fixed weekly amount is the simplest way to keep it in check.",
                         f"{cash_wd:.0%} of your spending is taken out as cash", "habit", 0.44, "cash_withdrawals"))
    return out


def ranked(account_id: int, lens: str = "balanced", have_types: set[str] | None = None) -> list[dict]:
    """Record-specific ideas first, then broad ones; a lens other than balanced puts its own family on top."""
    lens = lens if lens in LENSES else "balanced"
    boost = LENS_BOOST[lens]
    have_types = have_types or set()
    specific = ideas(account_id)
    taken = {g["type"] for g in specific} | {g["id"] for g in specific}
    pool = specific + [g for g in broad_ideas(account_id) if g["id"] not in taken and (g["type"] not in taken or g["type"] == "habit")]
    out = []
    for g in pool:
        g = dict(g)
        g["lens_score"] = round(g["relevance"] * boost.get(g["family"], 1.0), 3)
        if lens != "balanced" and boost.get(g["family"], 1.0) >= 1.5:
            g["importance"] = min(5, g["importance"] + 1)
        g["in_profile"] = g["id"] in have_types or (g["type"] in have_types and g["type"] != "habit")
        g["from_records"] = g in specific or g["id"] in {x["id"] for x in specific}
        out.append(g)
    fam = LENS_FAMILY.get(lens)
    out.sort(key=lambda g: ((g["family"] == fam) if fam else 0, g["lens_score"]), reverse=True)
    return out


IDEAS_INSTRUCTION = """You are PULP's Persona Builder choosing personal goals for one account. You get facts about the account
and a list of eligible goal ideas, each tied to evidence in the records, with code-set amounts. Pick the 3 to 5 ideas this
person would most plausibly care about, given the lens, and for each write a warmer label (at most 9 words) and a one-sentence
why in second person. Never change or mention amounts; use only the ids given. Return JSON only:
{"picks": [{"id": str, "label": str, "why": str, "importance": 1-5}], "note": "one sentence on how you personalised"}"""


def model_pick(account_id: int, lens: str, candidates: list[dict], facts: dict) -> dict | None:
    from .adk_runtime import LlmAgent, adk_available, json_block, run_agent
    from .. import config
    if not adk_available() or not candidates:
        return None
    agent = LlmAgent(name="persona_builder", model=config.GEMINI_MODEL, instruction=IDEAS_INSTRUCTION)
    payload = json.dumps({"lens": LENSES.get(lens, lens), "facts": facts,
                          "ideas": [{k: c[k] for k in ("id", "label", "why", "evidence", "family")} for c in candidates]}, default=str)
    out = json_block(" ".join(run_agent(agent, payload, user_id=f"ideas-{account_id}").get("texts", {}).get("persona_builder", [])))
    if not out:
        return None
    by_id = {c["id"]: c for c in candidates}
    picks = []
    for p in out.get("picks") or []:
        c = by_id.get(p.get("id"))
        if not c:
            continue
        c = dict(c)
        if isinstance(p.get("label"), str) and 3 < len(p["label"]) < 90 and "$" not in p["label"]:
            c["label"] = p["label"].strip()
        if isinstance(p.get("why"), str) and len(p["why"]) < 300 and "$" not in p["why"]:
            c["why"] = p["why"].strip()
        if isinstance(p.get("importance"), int) and 1 <= p["importance"] <= 5:
            c["importance"] = p["importance"]
        c["picked_by"] = "model"
        picks.append(c)
    return {"picks": picks[:5], "note": str(out.get("note") or "")[:240], "model": config.GEMINI_MODEL} if picks else None
