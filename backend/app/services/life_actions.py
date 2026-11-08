"""Life actions: turn engine levers into decisions a person can actually make.

The engine thinks in dials (free up $X a month, move $Y into a goal pot, keep a $Z floor, add $W of income). People
think in decisions: spend less on card purchases, pause the transfer to the other bank, take a weekend shift, move
the bill date after payday, build six months first and only then invest. This module maps one to the other using the
account's own spending mix and flags, so every suggestion names something visible in that person's statements.

Everything here is code. The Strategist may propose levers phrased as decisions too; they pass through unchanged.
"""
from __future__ import annotations

import math

FLEXIBLE = ("card", "cash_out", "transfers_out")   # outflow parts a person can usually move; bills, insurance, loan are fixed


def _m(x: float) -> str:
    return f"${x:,.0f}"


def spending_mix(m, row) -> dict:
    """Dollars per typical month by outflow part, from the feature shares."""
    S = float(m.typical_spending)
    mix = {
        "household bills": S * float(row.bills_share), "insurance": S * float(row.insurance_share), "loan": S * float(row.loan_share),
        "fees": S * float(row.fee_share), "cash_out": S * float(row.cash_wd_share), "card": S * float(row.card_wd_share),
        "transfers_out": S * float(row.transfer_out_share),
    }
    mix["regular_transfer"] = float(row.regular_transfer_out_amount) if bool(row.regular_transfer_out) else 0.0
    mix["surplus"] = float(m.typical_inflow) - S
    return mix


def _biggest_flexible(mix: dict) -> tuple[str, float]:
    best = max(FLEXIBLE, key=lambda k: mix.get(k, 0.0))
    return best, mix.get(best, 0.0)


def _spend_less_action(freed: float, mix: dict, constraints: dict) -> tuple[str, str]:
    allowance = constraints.get("can_free_up_per_month", {}).get("amount")
    if allowance is not None and float(allowance) >= freed:
        return (f"Set aside {_m(freed)} a month from the spending you said you can change",
                "Choose the specific expense within your confirmed limit; keep essential and protected costs intact.")
    part, amount = _biggest_flexible(mix)
    if part == "transfers_out" and mix.get("regular_transfer", 0) > 0:
        return ("Check what the recurring transfer pays for before changing it",
                f"The model needs {_m(freed)} more each month. Is that transfer accessible savings, an essential payment, or support for someone?")
    return (f"Check whether {_m(freed)} a month can be freed without affecting essentials",
            "Card and cash totals do not tell us what is optional. Which expense would you willingly change, and by how much?")


def humanize_candidate(c: dict, m, row, req: dict, stay: dict | None) -> dict:
    """Attach action, means and horizon to one candidate. Strategist labels that already read as decisions are kept."""
    lv = c["levers"]
    freed, contrib, floor, extra = (float(lv[k]) for k in ("freed_up_per_month", "goal_contribution_per_month", "emergency_floor", "extra_income_per_month"))
    mix = spending_mix(m, row)
    goal = req["goal"]
    constraints = {c.get("type"): c for c in req.get("confirmed_context", {}).get("constraints", [])}
    allowance = constraints.get("can_free_up_per_month", {}).get("amount")
    needs_context = []
    if freed > 0 and (allowance is None or float(allowance) < freed):
        needs_context.append("Which spending is optional, and how much can realistically change?")
    if extra > 0 and "extra_income_capacity" not in constraints:
        needs_context.append("Is extra work or another income source realistic for you, and at what amount?")
    c["needs_context"] = needs_context
    c["feasibility"] = "needs_context" if needs_context else "modeled_with_confirmed_limits"
    parts: list[str] = []
    hows: list[str] = []
    horizon = "now"
    kept = not needs_context and c["source"] == "strategist" and bool(c["label"]) and not c["label"].lower().startswith(("trim", "save ", "stay"))
    if kept:   # the Strategist already phrased it as a decision; keep its words, add only the how
        parts.append(c["label"])
        hows.append(c.get("why") or "")
        if freed > 0:
            hows.append(f"It frees up about {_m(freed)} a month.")
        if extra > 0:
            hows.append(f"It brings in about {_m(extra)} more a month.")
        horizon = "this month" if (freed > 0 or extra > 0) else horizon
    else:
        if freed > 0:
            a, h = _spend_less_action(freed, mix, constraints)
            parts.append(a); hows.append(h); horizon = "this month"
        if extra > 0:
            parts.append(f"Explore whether another {_m(extra)} a month of income is realistic")
            hows.append("Do not assume extra hours are available or suitable; confirm the source and time required first.")
            horizon = "this month"
    if contrib > 0 and goal.get("target_amount", 0) > 0 and not kept:
        parts.append(f"Move {_m(contrib)} a month into a separate pot for {goal['label'].lower()}")
        hows.append("Automatic, the day after pay lands, so you never see it as spendable.")
        horizon = "this year" if horizon == "now" else horizon
    if floor > 0:
        months = floor / m.typical_spending if m.typical_spending else 0
        hows.append(f"Keep {_m(floor)} untouched as your floor, about {months:.1f} months of spending; contributions pause if you dip under it.")
    if not parts:
        parts.append("Change nothing for now")
        hows.append("Your cushion does the work. Watch the balance each month and revisit if the shock lasts longer.")
    action = parts[0] if len(parts) == 1 else parts[0] + ", and " + parts[1][0].lower() + parts[1][1:]
    p = float(c["prob_shortfall_under_stress"])
    if stay and stay is not c and stay["label"] != c["label"]:
        p0 = float(stay["prob_shortfall_under_stress"])
        means = f"The chance of running dry under this shock goes from {p0:.0%} to {p:.0%}."
    else:
        means = f"Under this shock there is a {p:.0%} chance of running dry."
    if c.get("goal_progress_at_deadline", 0) >= 0.999 and c.get("months_to_goal_deterministic"):
        means += f" The {goal['label'].lower()} lands around month {float(c['months_to_goal_deterministic']):.0f}."
    c["action"] = action[:160]
    c["how"] = " ".join(h for h in hows if h)[:300]
    c["means"] = means
    c["horizon"] = horizon
    return c


def habit_actions(flags: list[dict], mix: dict, row=None) -> list[dict]:
    out = []
    keys = {f["key"] for f in flags}
    if "timing_dips" in keys or "penalty_interest" in keys:
        days = ""
        try:
            if row is not None and float(row.get("bill_dom", 0) or 0) > 0 and float(row.get("payday_dom", 0) or 0) > 0:
                days = f" Your bills usually leave around the {int(row['bill_dom'])}th and your pay lands around the {int(row['payday_dom'])}th."
        except (TypeError, ValueError):
            days = ""
        out.append({"title": "Move your bill dates to just after payday", "how": "Your account dips below zero in months where the money was there; the bills just land first." + days + " Ask whether the biller allows a date change and whether it has a fee.",
                    "horizon": "this month", "effect": "may reduce timing-related overdrafts if the payment dates can move", "source": "habit"})
    if "fee_bleed" in keys:
        out.append({"title": "Stop the fee leak", "how": f"Fees and penalty interest are about {_m(mix.get('fees', 0))} a month. Ask the bank for a no-fee package or keep a small cushion so the penalty interest stops.",
                    "horizon": "this month", "effect": f"about {_m(mix.get('fees', 0) * 12)} a year back", "source": "habit"})
    if "savings_elsewhere" in keys and mix.get("regular_transfer", 0) > 0:
        out.append({"title": "Find out whether the other account is available for your goal", "how": f"About {_m(mix['regular_transfer'])} leaves every month to another account. If that is savings, your real safety net is bigger than this balance shows; if it is a debt payment, tell me.",
                    "horizon": "now", "effect": "a truer picture of your runway", "source": "habit"})
    if "lifestyle_creep" in keys:
        out.append({"title": "Freeze spending growth for a year", "how": "Spending has been rising faster than income. Holding it flat, not cutting, rebuilds the margin on its own.",
                    "horizon": "this year", "effect": "the margin stops shrinking", "source": "habit"})
    if "thin_margin" in keys:
        out.append({"title": "Give yourself a monthly margin", "how": f"You keep about {_m(max(0.0, mix.get('surplus', 0)))} a month. Pick one category to trim so there is always something left over.",
                    "horizon": "this month", "effect": "a shock becomes a squeeze, not a cliff", "source": "habit"})
    return out


def future_action(m, row) -> dict:
    months = float(m.buffer) / float(m.typical_spending) if m.typical_spending else 0.0
    return {"title": "Choose how much backup money you want to protect",
            "how": f"The recorded balance covers about {months:.1f} months of typical outflows. What upcoming bills, dependents or income changes should that money protect?",
            "horizon": "later", "effect": "a reserve target based on your life before allocating money to a goal", "source": "future"}


def life_actions(plan: dict, m, row, flags: list[dict]) -> dict:
    """The 'actions' beat: the top plans as decisions, the habits worth changing, and one line about the future."""
    mix = spending_mix(m, row)
    stay = plan.get("stay_the_course")
    p0 = float(stay["prob_shortfall_under_stress"]) if stay else None
    actions = []
    seen = set()
    for c in (plan.get("ranked") or [])[:3]:
        if c.get("action") in seen or not c.get("action") or c["action"].startswith("Change nothing"):
            continue
        seen.add(c["action"])
        effect = f"shortfall risk {p0:.0%} → {float(c['prob_shortfall_under_stress']):.0%}" if p0 is not None else f"shortfall risk {float(c['prob_shortfall_under_stress']):.0%}"
        actions.append({"title": c["action"], "how": c.get("how", ""), "horizon": c.get("horizon", "this month"), "effect": effect, "source": c["source"]})
    actions += habit_actions(flags, mix, row)[:2]
    actions.append(future_action(m, row))
    headline = "What you could actually do" if actions else "Nothing to change right now"
    return {"headline": headline, "actions": actions[:5]}
