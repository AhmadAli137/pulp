"""Intake: getting to know the person before and while planning, with the least friction.

Explicit scenarios run immediately. Ask one relevant missing question after the calculation, avoid
repeating answered questions, and confirm new personal details before saving them.
"""
from __future__ import annotations

import re

from . import context_manager as cm
from .gemini_agent import QUESTION_BANK, next_question

AFFIRM = re.compile(r"^\s*(yes|yeah|yep|yup|ya|right|correct|that'?s (right|correct|it)|exactly|sure|sounds right|you got it|ok(ay)?|true|affirmative|spot on|perfect)\b[\s,.!]*", re.I)
NEGATE = re.compile(r"^\s*(no|nope|nah|not quite|not really|wrong|that'?s (not right|wrong|off)|incorrect)\b[\s,.!]*", re.I)
SKIP = re.compile(r"\b(skip|just run it|run it anyway|go ahead|never mind the questions|don'?t ask)\b", re.I)

GOAL_LABEL = {"emergency_fund": "build an emergency fund", "move_out": "move out", "home_purchase": "buy a home", "entrepreneurship": "start a business",
              "education": "go back to school", "vehicle": "buy a car", "travel": "travel", "wedding": "pay for a wedding", "debt_payoff": "pay off debt",
              "retirement": "retire", "family": "grow your family", "other": "reach that goal"}
CONCERN_LABEL = {"income_loss": "losing your job", "irregular_income": "income that comes in unevenly", "rising_costs": "rising costs",
                 "rent_increase": "rent going up", "debt": "debt", "unexpected_expense": "a surprise bill", "other": "that"}


def classify_reply(msg: str) -> tuple[str | None, str]:
    """('affirm'|'negate'|None, the rest of the message after the yes/no)."""
    m = AFFIRM.match(msg)
    if m:
        return "affirm", msg[m.end():].strip()
    m = NEGATE.match(msg)
    if m:
        return "negate", msg[m.end():].strip()
    return None, msg.strip()


def wants_skip(msg: str) -> bool:
    return bool(SKIP.search(msg or ""))


def is_cold(summary: dict) -> bool:
    """Just met: nothing confirmed about goals, worries or constraints."""
    return not summary.get("goals") and not summary.get("concerns") and not summary.get("constraints")


def restate(proposal: dict) -> str:
    """One spoken sentence saying back what PULP is about to remember."""
    bits: list[str] = []
    for ch in proposal.get("changes", []):
        v = ch.get("value", {}) or {}
        f = ch.get("field")
        if f == "goals":
            s = "you want to " + GOAL_LABEL.get(v.get("type", "other"), "reach that goal")
            if v.get("target_months"):
                s += f" in about {int(v['target_months'])} months"
            if v.get("target_amount"):
                s += f", and you would need around ${float(v['target_amount']):,.0f} for it"
            bits.append(s)
        elif f == "concerns":
            bits.append("you're worried about " + CONCERN_LABEL.get(v.get("type", "other"), "that"))
        elif f == "constraints":
            t = v.get("type")
            if t == "can_free_up_per_month" and v.get("amount") is not None:
                bits.append(f"you could free up about ${float(v['amount']):,.0f} a month if you had to")
            elif t == "expected_rent" and v.get("amount") is not None:
                bits.append(f"you expect rent around ${float(v['amount']):,.0f}")
            elif t == "income_replacement":
                bits.append("you'd have some income replacement if work stopped")
            elif t == "work_type" and v.get("value"):
                bits.append(f"you work {v['value']}")
            elif t == "transfer_purpose" and v.get("value"):
                bits.append(f"the monthly transfer to the other account is {v['value']}")
            elif v.get("label"):
                bits.append(str(v["label"]).lower())
        elif f == "preferences":
            c = v.get("choice")
            if c == "safety":
                bits.append("you'd rather keep a bigger safety cushion than rush the goal")
            elif c == "speed":
                bits.append("you'd rather reach the goal faster even with a thinner cushion")
        elif f == "upcoming_events":
            bits.append((v.get("label") or "something big") + " is coming up")
    if not bits:
        return "I think I learned something about you there. Did I get it right?"
    joined = bits[0] if len(bits) == 1 else ", ".join(bits[:-1]) + ", and " + bits[-1]
    return f"So, {joined}. Did I get that right?"


# --------------------------------------------------------------------------- profile-driven questions (what Stage 1 could not be sure of)
def profile_questions(summary: dict, insights: dict | None) -> list[dict]:
    if not insights:
        return []
    flags = {f["key"] for f in insights.get("flags", [])}
    arch = insights.get("archetype") or {}
    have = {c.get("type") for c in summary.get("constraints", [])}
    qs: list[dict] = []
    if "work_type" not in have and (arch.get("confidence", 1.0) < 0.9 or flags & {"cash_economy", "income_volatile"}):
        guess = arch.get("likely_occupation")
        qs.append({"key": "work_type", "relevance": 0.9, "field": "constraints", "type": "work_type",
                   "text": (f"Your money looks like {guess.lower()}, but I'd rather hear it from you: do you work for an employer, or for yourself?" if guess and guess.lower() not in ("unclear", "unknown")
                            else "Do you work for an employer, or for yourself?")})
    if "savings_elsewhere" in flags and "transfer_purpose" not in have:
        qs.append({"key": "transfer_purpose", "relevance": 0.95, "field": "constraints", "type": "transfer_purpose",
                   "text": "Money leaves this account for another one most months. Is that savings you could fall back on, or a payment?"})
    if "loan_stress" in flags and "loan_flexibility" not in have:
        qs.append({"key": "loan_flexibility", "relevance": 0.8, "field": "constraints", "type": "loan_flexibility",
                   "text": "The loan takes a big bite each month. Is that payment fixed, or could it be stretched if things got tight?"})
    if "pension_dependent" in flags and "other_income" not in have:
        qs.append({"key": "other_income", "relevance": 0.7, "field": "constraints", "type": "other_income",
                   "text": "Most of what comes in is pension. Is there any other income on top of it?"})
    if "thin_margin" in flags and "can_free_up_per_month" not in have:
        qs.append({"key": "flex_item", "relevance": 0.85, "field": "constraints", "type": "can_free_up_per_month",
                   "text": "Almost everything that comes in goes back out. If you had to cut one thing next month, what would it be, and roughly how much is it?"})
    if "household" not in have:
        qs.append({"key": "household", "relevance": 0.6, "field": "constraints", "type": "household",
                   "text": "Do you rent or own where you live, and does anyone depend on your income?"})
    return qs


def pick_question(summary: dict, pending: list[dict] | None, insights: dict | None) -> dict | None:
    """The single most useful question right now: the bank's heuristic plus the profile-driven ones, minus repeats."""
    asked = summary.get("asked_questions", [])
    base = next_question(summary, pending)
    best = None
    best_val = base["value"] if base else 0.0
    if base:
        best = {"key": base["key"], "text": base["text"], "value": base["value"]}
    for q in (insights or {}).get("decision_profile", {}).get("questions", []):
        # A question becomes less useful only after it was actually shown.
        val = q["value"] - 0.5 * asked.count(q["key"])
        if val > best_val:
            best, best_val = {"key": q["key"], "text": q["text"], "value": val}, val
    for q in profile_questions(summary, insights):
        val = q["relevance"] - 0.15 - 0.5 * asked.count(q["key"])
        if val > best_val:
            best, best_val = {"key": q["key"], "text": q["text"], "value": round(val, 3)}, val
    return best


def first_questions(summary: dict, insights: dict | None, n: int = 2) -> list[dict]:
    """For someone PULP just met: the first one or two questions, without repeats."""
    out: list[dict] = []
    s = dict(summary)
    asked = list(s.get("asked_questions", []))
    for _ in range(n):
        s["asked_questions"] = asked
        q = pick_question(s, None, insights)
        if not q:
            break
        out.append(q)
        asked.append(q["key"])
    return out


def pending_proposals(ctx: dict) -> list[dict]:
    return [p for p in ctx.get("proposals", []) if p.get("status") == "pending"]


def set_pending_twist(account_id: int, key: str | None) -> None:
    ctx = cm.load_context(account_id)
    stage = dict(ctx.get("stage") or {})
    if key:
        stage["pending_twist"] = key
    else:
        stage.pop("pending_twist", None)
    ctx["stage"] = stage
    cm.save_context(ctx)


def get_pending_twist(ctx: dict) -> str | None:
    return (ctx.get("stage") or {}).get("pending_twist")
