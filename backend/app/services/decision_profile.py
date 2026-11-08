"""Observed account patterns translated into questions and everyday decision contexts.

This is a deterministic interpretation layer, not a claim about merchants, employment,
transfer ownership, or which spending a person can cut. Rebuilt against confirmed context.
"""
from __future__ import annotations

import math
from .features import AS_OF


def build_decision_profile(monthly, row, summary: dict, loan=None) -> dict:
    recent = monthly.sort_values("month").tail(6)
    net = recent["money_in"] - recent["money_out"]
    period = {"from": str(recent["month"].iloc[0]), "to": str(recent["month"].iloc[-1]), "months": len(recent)}
    full_period = {"from": str(monthly["month"].min()), "to": str(monthly["month"].max()), "months": len(monthly)}
    margin = round(float(net.median()), 2)
    constraints = {c.get("type"): c for c in summary.get("constraints", [])}
    observations = []
    def number(key):
        v = float(row.get(key, 0) or 0)
        return v if math.isfinite(v) else 0.0
    def add(key, evidence, meaning, question, unlocks, priority, constraint):
        observations.append({"key": key, "evidence": evidence, "life_effect": meaning,
            "question": question, "unlocks": unlocks, "priority": priority,
            "needs_answer": constraint not in constraints, "source": "Monthly account summaries", "period": period if key == "monthly_room" else full_period})
    add("monthly_room", f"In the latest {len(recent)} recorded months through {period['to']}, the median money left after outflows was ${margin:,.0f}; {int((net < 0).sum())} months ended with more going out than coming in.",
        "A new monthly commitment could leave less for a trip or an unexpected bill. Confirm what the transfers cover and which costs are essential before relying on this amount.",
        "Which regular costs must stay untouched, and is there anything you would willingly spend less on?",
        "Compare a recurring purchase with keeping that money for your goal.", 70, "can_free_up_per_month")
    if number("regular_transfer_out_amount") > 0:
        amount = number("regular_transfer_out_amount")
        add("transfer_purpose", f"The records show a recurring transfer of about ${amount:,.0f} per month out of this account.",
            "A transfer could be paying for rent, debt, or family support. Check what it covers and whether you can access the money before counting it as savings or considering a pause.",
            f"What is that roughly ${amount:,.0f} transfer for: your own savings, a bill, or supporting someone?",
            "Decide whether this money is available at all before comparing changes to it.", 95, "transfer_purpose")
    if number("timing_dip_share") > 0 and number("neg_months_share") > 0:
        add("bill_timing", "Some recorded months went below zero even though total inflow covered total outflow.",
            "The dates money arrives and bills leave may explain some of those dips. Check the dates before deciding whether a larger cash cushion or a different bill date would help.",
            "Which bill arrives before your income, and can its payment date be changed?",
            "Compare asking to move that bill date with keeping a small payment buffer.", 90, "bill_date_flexibility")
    if number("pension_share") >= .75:
        add("income_options", "Most recorded inflow is labelled pension.",
            "Confirm which income would continue if work stopped. If your pension would continue, include it when setting how much income remains in the shock.",
            "Is this pension your only income, or is there other income we should include?",
            "Compare a smaller commitment or a later goal date without assuming you can work more.", 60, "other_income")
    if number("fee_share") > .005:
        add("fees", "Fees take a recurring share of recorded outflows.",
            "Avoidable fees could be a small improvement without giving up something you enjoy, but the fee conditions matter.",
            "Are these account fees, overdraft charges, or charges you cannot avoid?",
            "Compare eligible account options or a payment buffer after checking their conditions.", 75, "fee_conditions")
    goals = sorted(summary.get("goals", []), key=lambda g: g.get("priority", 1))
    questions = []
    from .life_profile import build_life_profile
    life_profile = build_life_profile(monthly, summary, loan)
    home_district = row.get("owner_home_district_name")
    branch_district = row.get("district_name")
    life_profile["geography"] = {
        "home_district": home_district if isinstance(home_district, str) else None,
        "branch_district": branch_district if isinstance(branch_district, str) else None,
    }
    owner_age = number("owner_age")
    if owner_age > 0:
        life_profile["recorded_age"] = {"years": owner_age, "as_of": AS_OF.date().isoformat()}
    if life_profile["loan"]:
        story = life_profile["loan"]
        questions.append({"key": "loan_current_terms" if story["confirmed_purpose"] else "loan_purpose", "text": story["question"], "why": story["decision"], "value": 1.1})
    if goals:
        goal = goals[0]
        if not goal.get("target_months"):
            questions.append({"key": "goal_timing", "text": "When would you like to take that vacation?" if goal.get("type") == "travel" else "When would you like to reach that goal?", "why": "Timing changes how much you would need to put aside each month.", "value": 1.3})
        elif not goal.get("target_amount"):
            questions.append({"key": "goal_amount", "text": "What total budget would feel comfortable for that vacation?" if goal.get("type") == "travel" else "What total amount should we plan for?", "why": "We need your budget before choosing a saving amount or suggesting cuts.", "value": 1.25})
        elif goal.get("saved_amount") is None:
            questions.append({"key": "goal_saved", "text": "How much have you already set aside specifically for this goal?", "why": "Actual savings tell us the remaining gap; account cash may already have another purpose.", "value": 1.2})
    for o in sorted(observations, key=lambda o: -o["priority"]):
        if o["needs_answer"]:
            questions.append({"key": o["key"], "text": o["question"], "why": o["life_effect"], "value": o["priority"] / 100})
    questions.sort(key=lambda q: -q["value"])
    small = [{"label": "Add a monthly expense or keep that money for your goal", "question": "What monthly purchase or service are you considering, and what would it cost?"}]
    if any(o["key"] == "bill_timing" for o in observations):
        small.insert(0, {"label": "Change a bill date or keep a payment buffer", "question": "Which bill would you want to move, and when does it leave?"})
    if goals:
        label = goals[0].get("label") or goals[0].get("type", "your goal").replace("_", " ")
        big = [{"label": f"{label}: keep the date, lower the budget, or wait longer", "question": questions[0]["text"] if questions else "Would you rather adjust the cost or the date?"}]
    else:
        big = [{"label": "A trip, a move, study, or a change in work", "question": "What bigger decision are you weighing up in your own life?"}]
    return {"life_profile": life_profile, "period": period, "recent_monthly_room": margin, "lowest_recorded_monthly_room": round(float(net.min()), 2),
        "observations": observations, "questions": questions, "decisions": {"small": small, "big": big},
        "limits": ["These are historical records, not a live balance or a promise of affordability.",
                   "Card and cash totals do not identify optional purchases.",
                   "Transfers do not establish ownership, accessibility or purpose.",
                   "Confirm current income, essential costs and protected spending before treating an option as feasible."]}
