"""Explain financial circumstances and borrowing context without inventing intent."""
from __future__ import annotations

from typing import Literal
import math
import pandas as pd
from pydantic import BaseModel, Field, field_validator


def _cash_difference(value: float) -> str:
    if value < 0:
        return f"${abs(value):,.0f} more went out than came in"
    if value > 0:
        return f"${value:,.0f} was left after money went out"
    return "money coming in and going out was balanced"


class LoanPurpose(BaseModel):
    type: Literal["loan_purpose"] = "loan_purpose"
    loan_id: int = Field(gt=0)
    purpose: str = Field(min_length=2, max_length=300)

    @field_validator("purpose")
    @classmethod
    def meaningful(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Describe what the loan was for")
        return value


def build_life_profile(monthly, summary: dict, loan=None) -> dict:
    rows = monthly.sort_values("month")
    recent = rows.tail(6)
    constraints = {c.get("type"): c for c in summary.get("constraints", [])}
    inflow = float(recent.money_in.median())
    room = recent.money_in - recent.money_out
    median_room = float(room.median())
    negative = int((room < 0).sum())
    cv = float(recent.money_in.std(ddof=0) / recent.money_in.mean()) if recent.money_in.mean() > 0 else None
    period = {"from": str(recent.month.iloc[0]), "to": str(recent.month.iloc[-1]), "months": len(recent)}
    steady = cv is not None and cv <= .2 and len(recent) >= 3
    headline = "A starting picture that needs more context" if len(recent) < 3 else "Regular money coming in, with little room for another commitment" if steady and median_room <= max(0, inflow * .1) else "Regular money coming in, with some room to plan" if steady else "A plan that needs room for uneven months"
    account_story = f"Across {len(recent)} recorded months through {period['to']}, more money left than came in during {negative} months. In a typical month, {_cash_difference(median_room)}."
    if cv is not None and cv > .2 and len(recent) >= 3:
        account_story += f" Money coming in ranged from ${float(recent.money_in.min()):,.0f} to ${float(recent.money_in.max()):,.0f} per month."
    confirmed = []
    for g in sorted(summary.get("goals", []), key=lambda g: g.get("priority", 1))[:2]:
        confirmed.append({"text": f"Your stated goal: {g.get('label') or str(g.get('type', 'reach a goal')).replace('_', ' ')}.", "source": "confirmed goal"})
    preference = next((p.get("choice") for p in summary.get("preferences", []) if p.get("type") == "risk_preference"), None)
    if preference in ("safety", "speed", "balanced"):
        confirmed.append({"text": {"safety": "You said keeping a larger safety cushion matters more than reaching the goal sooner.", "speed": "You said reaching the goal sooner matters, even with a smaller cushion.", "balanced": "You asked to balance your goal with keeping a safety cushion."}[preference], "source": "confirmed preference"})
    work = constraints.get("work_type", {}).get("value")
    if work:
        confirmed.append({"text": f"You described your work as {work}.", "source": "confirmed personal detail"})
    pattern = {"interpretation": "Predictability may matter more than a larger average balance when deciding what to commit each month." if not steady or negative else "There may be room to plan, but other accounts, upcoming costs and essential commitments still need checking.",
               "basis": account_story, "certainty": "A working interpretation of account cash flow; it does not establish your intentions or disposable income."}
    out = {"headline": headline, "period": period, "summary": account_story, "interpretation": pattern,
           "confirmed_motivations": confirmed, "loan": None,
           "question": "What matters most to protect in your life while we plan around these numbers?",
           "limits": "This describes an anonymized account, not a verified biography. Cash flow cannot establish occupation, family circumstances or why someone borrowed."}
    if loan is None:
        out["loan_note"] = "No loan appears in the supplied loan file for this account. This does not rule out borrowing elsewhere."
        return out
    loan_id = int(loan.loan_id)
    start = str(loan.loan_start)[:10]
    origination_month = start[:7]
    status = str(loan.status)
    payment = float(loan.monthly_payment)
    purpose = constraints.get("loan_purpose", {})
    purpose_text = purpose.get("purpose") if purpose.get("loan_id") == loan_id else None
    pre = rows[(rows.month >= str(pd.Period(origination_month, freq="M") - 3)) & (rows.month < origination_month)]
    # Whole months only: no within-month chronology or loan-proceeds attribution is available.
    first_after = (pd.Period(origination_month, freq="M") + 1)
    after = rows[(rows.month >= str(first_after)) & (rows.month <= str(first_after + 2))]
    evidence = []
    hypotheses = []
    if len(pre) >= 3:
        pre_net = pre.money_in - pre.money_out
        deficits = int((pre_net < 0).sum())
        evidence.append({"text": f"Before borrowing, {deficits} of the {len(pre)} recorded months had more going out than coming in; in a typical month, {_cash_difference(float(pre_net.median()))}.", "from": str(pre.month.iloc[0]), "to": str(pre.month.iloc[-1])})
        if deficits >= 2:
            hypotheses.append({"title": "Borrowing may have helped bridge a cash-flow gap", "basis": evidence[-1]["text"], "alternative": "A planned purchase could also explain the loan; deficits alone do not establish its purpose.", "question": "Was the loan covering recurring bills, a temporary income gap, or a specific purchase?", "decision": "Find out whether the pressure was temporary or still continues before assuming another repayment is manageable."})
        pre_mean = float(pre.money_in.mean())
        variability = float(pre.money_in.std(ddof=0) / pre_mean) if pre_mean > 0 else None
        if variability is not None and variability > .3:
            evidence.append({"text": f"Inflow before borrowing ranged from ${float(pre.money_in.min()):,.0f} to ${float(pre.money_in.max()):,.0f} per month.", "from": str(pre.month.iloc[0]), "to": str(pre.month.iloc[-1])})
            if len(hypotheses) < 2:
                hypotheses.append({"title": "Borrowing may have smoothed uneven inflows", "basis": evidence[-1]["text"], "alternative": "Transfers between accounts can create this pattern too; it does not establish variable wages or employment.", "question": "Was income arriving unevenly, or were these transfers between your own accounts?", "decision": "Distinguish a timing problem from a lasting income shortfall before choosing a new commitment."})
        if len(after) >= 2 and "loan_payments" in rows:
            pre_out = float((pre.money_out - pre.loan_payments).median())
            after_out = float((after.money_out - after.loan_payments).max())
            if pre_out > 0 and after_out > 1.5 * pre_out and len(hypotheses) < 2:
                basis = f"Outflow excluding recorded loan repayments reached ${after_out:,.0f} in a month after borrowing, against ${pre_out:,.0f} in a typical pre-loan month."
                evidence.append({"text": basis, "from": str(after.month.iloc[0]), "to": str(after.month.iloc[-1])})
                hypotheses.append({"title": "The loan may have accompanied a larger expense", "basis": basis, "alternative": "The outflow could be a transfer, an unrelated expense, or several purchases. Monthly totals cannot identify what was bought or how it was funded.", "question": "Did the loan pay for something specific, and does that cost still affect your life?", "decision": "Understand whether this was a one-time cost or an ongoing commitment before planning the next goal."})
    if purpose_text:
        hypotheses = []
        out["confirmed_motivations"].append({"text": f"You said the loan was for: {purpose_text}.", "source": "confirmed loan purpose"})
    question = ("Does this loan still have a balance, and what are its current payment and terms?" if purpose_text else f"What was the loan taken out on {start} for, and is it still serving that purpose?")
    burden = f"The scheduled payment was ${payment:,.0f} per month."
    share = payment / inflow if inflow > 0 and math.isfinite(inflow) else None
    if share is not None and status in ("C", "D"):
        burden += f" That is {share:.0%} of the money typically coming in during the latest recorded months, before other commitments. We still need to check today's balance and payments."
    if status in ("B", "D"):
        question = "The historical loan status reports repayment problems. Are any payments still overdue, and is there a current repayment arrangement?" if purpose_text else question
    out["question"] = question
    out["loan"] = {"loan_id": loan_id, "amount": float(loan.amount), "start": start, "duration_months": int(loan.duration_months), "payment": payment,
                   "status": status, "status_meaning": {"A": "Repaid", "B": "The term ended without full repayment recorded", "C": "Still being repaid, with no repayment problem recorded", "D": "Still running, with repayment problems recorded"}.get(status, str(loan.status_meaning)), "status_as_of": "2025-12-31", "burden": burden,
                   "confirmed_purpose": purpose_text, "purpose_status": "confirmed by you" if purpose_text else "not recorded",
                   "evidence": evidence, "hypotheses": hypotheses,
                   "context_limit": "There are fewer than three complete pre-loan months, so the records do not support a before-and-after explanation." if len(pre) < 3 else "These patterns suggest questions, not a proven cause of borrowing.",
                   "question": question, "decision": "Before comparing faster repayment with keeping cash for a shock or goal, establish the current balance, interest, repayment terms and the purpose you want to protect.",
                   "unknowns": ["Original principal is not the current outstanding balance.", "Interest rate, loan purpose, payment flexibility and spending beneficiaries are not supplied.", "A matching change in monthly totals does not establish that loan proceeds paid for it."]}
    return out
