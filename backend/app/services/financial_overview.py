"""Reported balance sheet, actual goal progress and honest on-demand briefings."""
from __future__ import annotations
from datetime import date, datetime, timezone, timedelta
import calendar
import math
from typing import Literal
from pydantic import BaseModel, Field, field_validator
from . import context_manager as cm
from .data_store import get_store
from .financial_profiles import get_metrics
from .narrator import narrative_for


class BalanceItem(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    amount: float = Field(ge=0, le=1e12, allow_inf_nan=False)


class FinancialPosition(BaseModel):
    type: Literal["financial_position"] = "financial_position"
    assets: list[BalanceItem] = Field(default_factory=list, max_length=32)
    liabilities: list[BalanceItem] = Field(default_factory=list, max_length=32)
    as_of: date
    complete: bool = False

    @field_validator("as_of")
    @classmethod
    def not_in_future(cls, value):
        if value > datetime.now(timezone.utc).date():
            raise ValueError("Balance date cannot be in the future")
        return value


def goal_progress(ctx: dict, today: date) -> list[dict]:
    out = []
    for item in ctx.get("goals", []):
        g = item["value"]
        def amount(key):
            v = g.get(key)
            return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v >= 0 else None
        target, saved = amount("target_amount"), amount("saved_amount")
        target = target if target and target > 0 else None
        deadline = None
        months = g.get("target_months")
        if isinstance(months, (int, float)) and math.isfinite(months) and 0 < months <= 240:
            start = date.fromisoformat(item["created_at"][:10])
            year, month = divmod(start.year * 12 + start.month - 1 + int(months), 12)
            deadline = date(year, month+1, min(start.day, calendar.monthrange(year, month+1)[1]))
        remaining = max(0, target-saved) if target is not None and saved is not None else None
        months_left = (deadline-today).days/30.4375 if deadline else None
        monthly = round(remaining/months_left, 2) if remaining is not None and months_left and months_left > 0 else None
        question = ("What total budget should we use?" if target is None else "How much have you already set aside specifically for this goal?" if saved is None else "When would you like to reach this goal?" if deadline is None else "Has your target date changed?" if deadline < today and remaining else None)
        out.append({"id": item["id"], "type": g.get("type", "other"), "label": g.get("label") or str(g.get("type", "Goal")).replace("_", " "),
                    "target": target, "saved": saved, "remaining": remaining, "progress": min(1, saved/target) if saved is not None and target else None,
                    "deadline": deadline.isoformat() if deadline else None, "monthly_needed": monthly,
                    "saved_as_of": g.get("saved_as_of") or (item["updated_at"][:10] if saved is not None else None), "question": question})
    return out


def overview(account_id: int, today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    ctx = cm.load_context(account_id)
    m = get_metrics(account_id)
    rows = get_store().monthly_for(account_id).sort_values("month")
    latest = rows.iloc[-1]
    raw = next((i["value"] for i in ctx.get("constraints", []) if i["value"].get("type") == "financial_position"), None)
    position = None
    if raw:
        try:
            value = FinancialPosition.model_validate(raw).model_dump(mode="json")
            assets = round(sum(i["amount"] for i in value["assets"]), 2)
            liabilities = round(sum(i["amount"] for i in value["liabilities"]), 2)
            position = {**value, "asset_total": assets, "liability_total": liabilities, "difference": round(assets-liabilities, 2)}
        except ValueError:
            pass  # Legacy invalid entries are unknown, never zero.
    goals = goal_progress(ctx, today)
    ins = narrative_for(account_id, use_ai=False).get("decision_profile", {})
    questions = []
    if not position:
        questions.append("What assets and outstanding debts do you have today, including anything outside this account?")
    elif not position["complete"]:
        questions.append("Are any assets or debts missing from the balances you entered?")
    for g in goals:
        if g["question"]: questions.append(f"For {g['label'].lower()}: {g['question']}")
    questions += [q["text"] for q in ins.get("questions", []) if q["text"] not in questions]
    plan = ctx.get("active_plan")
    choices = []
    for c in (plan or {}).get("ranked", [])[:3]:
        choices.append({"label": c.get("action") or c["label"], "how": c.get("how", ""), "effect": c.get("means", ""),
                        "questions": c.get("needs_context", []), "monthly_contribution": c["levers"]["goal_contribution_per_month"],
                        "monthly_change": c["levers"]["freed_up_per_month"], "source": c["source"]})
    return {"account_id": account_id, "as_of": today.isoformat(), "context_version": ctx["context_version"],
            "position": position, "recorded": {"through": str(latest["month"]), "closing_balance": float(latest["month_end_balance"]),
                "loan_payment": m.active_loan_payment, "debt_balance_known": False},
            "goals": goals, "questions": questions[:5], "choices": choices,
            "plan_stale": bool(plan and plan["request"]["context_version"] != ctx["context_version"]),
            "cash_flow": {"inflow": m.typical_inflow, "outflow": m.typical_spending, "room": m.typical_inflow-m.typical_spending,
                          "parts": [{"label": k.replace("_", " "), "amount": float(v)} for k,v in m.outflow_mix.items() if float(v)>0]},
            "note": "Reported balances and goal savings are your entries, not a bank feed. Historical cash is separate; original loan amounts and monthly payments are not outstanding debt balances."}


def briefing(account_id: int, period: str, today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    view = overview(account_id, today)
    ctx = cm.load_context(account_id)
    start = today - timedelta(days=6 if period == "weekly" else 0)
    changes = []
    for field in ("goals", "constraints", "preferences", "upcoming_events"):
        for item in ctx.get(field, []):
            if start.isoformat() <= item.get("updated_at", "")[:10] <= today.isoformat():
                label = item["value"].get("label") or str(item["value"].get("type", field)).replace("_", " ")
                changes.append({"date": item["updated_at"][:10], "text": f"Updated {label}", "kind": field})
    return {"period": period, "from": start.isoformat(), "through": today.isoformat(), "data_through": view["recorded"]["through"],
            "headline": "Your week in perspective" if period == "weekly" else "Your daily perspective",
            "delivery": "Generated inside Pulp when opened; no automatic notifications are scheduled.",
            "freshness": "No new bank transactions are connected. This briefing reviews saved goals, personal updates and existing records.",
            "changes": sorted(changes, key=lambda x:x["date"], reverse=True), "goals": view["goals"],
            "focus": view["questions"][0] if view["questions"] else "Does your current plan still fit what matters to you?",
            "next_steps": view["questions"][:3], "choices": view["choices"], "plan_stale": view["plan_stale"]}
