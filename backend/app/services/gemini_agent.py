"""Conversational companion: discovers life context, proposes structured memory updates, explains numbers.

Two engines behind one interface:
  * Gemini (google-genai) with narrow backend tools and a Pydantic-validated extraction step.
  * Offline deterministic engine (keyword extraction + the same question heuristic) used when no API key
    is configured or Gemini fails. The product never depends on the AI service for financial numbers.

Question priority is a simple heuristic, not a trained model:
    QuestionValue = ExpectedPlanningRelevance - UserInteractionBurden - RepetitionPenalty
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, ValidationError

from ..config import AI_PROVIDER, GEMINI_API_KEY, GEMINI_MODEL, VULTR_INFERENCE_API_KEY, VULTR_INFERENCE_MODEL
from . import context_manager as cm
from .financial_profiles import get_metrics
from .scenario_engine import ScenarioSpec, simulate
from .strategy_optimizer import GOAL_LABELS, compare_strategies
from .tangerine_metrics import compute_shock, horizon_verdict

log = logging.getLogger("pulp.agent")

GoalType = Literal["emergency_fund", "move_out", "home_purchase", "entrepreneurship", "education", "vehicle",
                   "travel", "wedding", "debt_payoff", "retirement", "family", "other"]
ConcernType = Literal["income_loss", "irregular_income", "rising_costs", "rent_increase", "debt", "unexpected_expense", "other"]


class ProposedChange(BaseModel):
    field: Literal["goals", "concerns", "constraints", "preferences", "upcoming_events", "accepted_actions"]
    operation: Literal["add", "update", "remove"] = "add"
    value: dict[str, Any] = Field(default_factory=dict)


class AgentExtraction(BaseModel):
    intent: Literal["update_goal", "update_concern", "update_constraint", "update_preference", "update_event",
                    "question", "run_scenario", "chitchat", "none"] = "none"
    proposed_changes: list[ProposedChange] = Field(default_factory=list)
    requires_confirmation: bool = True
    follow_up_question: Optional[str] = None
    rationale: str = ""


# ----------------------------------------------------------------------------- question heuristic
QUESTION_BANK: list[dict] = [
    {"key": "goal", "text": "What's something meaningful you'd like to achieve over the next few years?", "burden": 0.10,
     "relevance": lambda s: 1.0 if not s["goals"] else 0.0},
    {"key": "goal_timing", "text": "When would you ideally like that to happen?", "burden": 0.10,
     "relevance": lambda s: 0.9 if s["goals"] and not s["goals"][0].get("target_months") else 0.0},
    {"key": "rent", "text": "What monthly rent are you expecting once you move out?", "burden": 0.20,
     "relevance": lambda s: 0.95 if any(g.get("type") == "move_out" for g in s["goals"]) and not _has(s, "constraints", "expected_rent") else 0.0},
    {"key": "startup_budget", "text": "How much would you like to have set aside before launching the business?", "burden": 0.20,
     "relevance": lambda s: 0.95 if any(g.get("type") == "entrepreneurship" for g in s["goals"]) and not _has(s, "constraints", "startup_budget") else 0.0},
    {"key": "goal_amount", "text": "Roughly how much would you need to set aside for that goal?", "burden": 0.20,
     "relevance": lambda s: 0.85 if s["goals"] and s["goals"][0].get("type") not in ("emergency_fund", "move_out", "entrepreneurship") and not s["goals"][0].get("target_amount") else 0.0},
    {"key": "income_replacement", "text": "If your income stopped, would you receive EI or any other replacement income, and for roughly how long?", "burden": 0.15,
     "relevance": lambda s: 0.9 if any(c.get("type") in ("income_loss", "irregular_income") for c in s["concerns"]) and not _has(s, "constraints", "income_replacement") else 0.0},
    {"key": "worry", "text": "What's your biggest financial worry right now?", "burden": 0.10,
     "relevance": lambda s: 0.8 if not s["concerns"] else 0.0},
    {"key": "flexibility", "text": "If an unexpected expense came up, how much could you realistically free up each month?", "burden": 0.20,
     "relevance": lambda s: 0.7 if not _has(s, "constraints", "can_free_up_per_month") else 0.0},
    {"key": "risk", "text": "Would you rather reach that goal faster, or keep a larger financial safety buffer?", "burden": 0.10,
     "relevance": lambda s: 0.6 if s["goals"] and not _has(s, "preferences", "risk_preference") else 0.0},
    {"key": "events", "text": "Is anything big coming up in the next year, like a move, a new family member, or a job change?", "burden": 0.10,
     "relevance": lambda s: 0.4 if not s["upcoming_events"] else 0.0},
]
REPETITION_PENALTY = 0.5


def _has(summary: dict, field: str, vtype: str) -> bool:
    return any(x.get("type") == vtype for x in summary.get(field, []))


def next_question(summary: dict, pending: list[dict] | None = None) -> dict | None:
    """Pick the question with the highest heuristic value given what is still missing."""
    asked = summary.get("asked_questions", [])
    # Treat pending (unconfirmed) proposals as known so we do not re-ask for what was just said.
    s = json.loads(json.dumps(summary))
    for p in pending or []:
        for ch in p.get("changes", []):
            s.setdefault(ch["field"], []).append(ch.get("value", {}))
    best, best_val = None, 0.0
    scored = []
    for q in QUESTION_BANK:
        rel = q["relevance"](s)
        val = rel - q["burden"] - REPETITION_PENALTY * asked.count(q["key"])
        scored.append({"key": q["key"], "value": round(val, 3), "relevance": rel})
        if val > best_val:
            best, best_val = q, val
    if best is None:
        return None
    return {"key": best["key"], "text": best["text"], "value": round(best_val, 3), "scored": scored}


# ----------------------------------------------------------------------------- offline extraction
GOAL_PATTERNS = [
    ("move_out", r"move out|my own place|own apartment|rent(ing)? (a|an|my own) (place|apartment)"),
    ("home_purchase", r"buy (a|my own) (house|home|condo)|house|home purchase|mortgage|own a home"),
    ("entrepreneurship", r"business|start-?up|start a company|freelanc|self[- ]employ|open a (shop|store|cafe)"),
    ("education", r"school|tuition|retrain|course|degree|college|university|certification|bootcamp|study"),
    ("vehicle", r"\bcar\b|vehicle|truck"),
    ("travel", r"travel|trip|vacation|holiday"),
    ("wedding", r"wedding|get married"),
    ("debt_payoff", r"pay (off|down) (my )?(debt|loan|credit)"),
    ("retirement", r"retire"),
    ("emergency_fund", r"emergency fund|rainy day|safety net|cushion|buffer"),
    ("family", r"\bbaby\b|\bkids?\b|children|family"),
]
CONCERN_PATTERNS = [
    ("income_loss", r"lose my job|los(e|ing) (my|the) job|laid off|lay-?off|unemploy|job loss|job security|get fired|let go"),
    ("irregular_income", r"irregular|unstable|unpredictable|commission|gig|contract work|seasonal"),
    ("rent_increase", r"rent (is )?(going|went) up|rent increase|landlord"),
    ("rising_costs", r"rising cost|inflation|bills (are )?(going|went) up|cost of living|groceries|prices"),
    ("debt", r"\bdebt\b|credit card|owe"),
    ("unexpected_expense", r"unexpected|surprise (bill|expense)|repair|emergency"),
]


def _months_from(text: str) -> int | None:
    t = text.lower()
    m = re.search(r"(\d+(?:\.\d+)?)\s*(years?|yrs?)", t)
    if m:
        return int(round(float(m.group(1)) * 12))
    m = re.search(r"(\d+)\s*months?", t)
    if m:
        return int(m.group(1))
    if "next year" in t:
        return 12
    if "a year" in t or "one year" in t or "within the year" in t:
        return 12
    if "this year" in t or "few months" in t:
        return 6
    if "couple of years" in t or "two years" in t:
        return 24
    if "five years" in t:
        return 60
    return None


def _amounts(text: str) -> list[float]:
    vals = []
    for m in re.finditer(r"\$\s?([\d,]+(?:\.\d+)?)\s*(k|thousand)?", text.lower()):
        v = float(m.group(1).replace(",", ""))
        if m.group(2):
            v *= 1000
        vals.append(v)
    for m in re.finditer(r"\b(\d+(?:\.\d+)?)\s?k\b", text.lower()):
        vals.append(float(m.group(1)) * 1000)
    return vals


def offline_extract(text: str, summary: dict) -> AgentExtraction:
    t = text.lower()
    changes: list[ProposedChange] = []
    months = _months_from(t)
    amounts = _amounts(text)
    existing_goal_types = {g.get("type") for g in summary.get("goals", [])}

    goal_found = None
    for gtype, pat in GOAL_PATTERNS:
        if re.search(pat, t):
            goal_found = gtype
            break
    concern_found = None
    for ctype, pat in CONCERN_PATTERNS:
        if re.search(pat, t):
            concern_found = ctype
            break
    # "pay off debt" is a goal, "debt" alone a concern
    if goal_found == "debt_payoff":
        concern_found = None

    if goal_found:
        v: dict[str, Any] = {"type": goal_found, "label": GOAL_LABELS.get(goal_found, "Goal"), "priority": 1}
        if months:
            v["target_months"] = months
        if amounts and goal_found != "move_out":
            v["target_amount"] = max(amounts)
        if goal_found in existing_goal_types:
            changes.append(ProposedChange(field="goals", operation="update", value=v))
        else:
            # a new primary goal demotes previous ones
            for g in summary.get("goals", []):
                changes.append(ProposedChange(field="goals", operation="update", value={"type": g.get("type"), "priority": 2}))
            changes.append(ProposedChange(field="goals", operation="add", value=v))
    elif months and summary.get("goals") and not summary["goals"][0].get("target_months"):
        changes.append(ProposedChange(field="goals", operation="update", value={"type": summary["goals"][0]["type"], "target_months": months}))
    elif amounts and summary.get("goals") and not summary["goals"][0].get("target_amount") and "rent" not in t and "free up" not in t:
        changes.append(ProposedChange(field="goals", operation="update", value={"type": summary["goals"][0]["type"], "target_amount": max(amounts)}))

    if concern_found:
        changes.append(ProposedChange(field="concerns", value={"type": concern_found, "label": concern_found.replace("_", " ")}))
        if concern_found in ("income_loss", "irregular_income"):
            changes.append(ProposedChange(field="preferences", value={"type": "priority", "choice": "preserve_stability", "label": "Preserve financial stability"}))

    if re.search(r"\brent\b", t) and amounts and (goal_found == "move_out" or "move_out" in existing_goal_types):
        changes.append(ProposedChange(field="constraints", value={"type": "expected_rent", "amount": max(amounts)}))
    if re.search(r"free up|cut back|set aside|spare|save (an )?extra|could save|can save", t) and amounts:
        changes.append(ProposedChange(field="constraints", value={"type": "can_free_up_per_month", "amount": min(amounts)}))
    if re.search(r"\bei\b|employment insurance", t):
        changes.append(ProposedChange(field="constraints", value={"type": "income_replacement", "fraction": 0.55, "months": months or 6, "label": "EI at 55%"}))
    if (goal_found == "entrepreneurship" or "entrepreneurship" in existing_goal_types) and amounts and re.search(r"budget|launch|start|set aside|need", t):
        changes.append(ProposedChange(field="constraints", value={"type": "startup_budget", "amount": max(amounts)}))
    if re.search(r"safety|safer|secure|bigger buffer|larger buffer|cushion|peace of mind", t) and not goal_found == "emergency_fund":
        changes.append(ProposedChange(field="preferences", value={"type": "risk_preference", "choice": "safety"}))
    elif re.search(r"faster|sooner|quick|as soon as|asap", t):
        changes.append(ProposedChange(field="preferences", value={"type": "risk_preference", "choice": "speed"}))
    if re.search(r"moving|new baby|having a baby|new job|switch jobs|changing jobs|getting married", t) and not goal_found:
        changes.append(ProposedChange(field="upcoming_events", value={"type": "life_event", "label": text.strip()[:80], "months_from_now": months or 12}))

    intent = "none"
    if any(c.field == "goals" for c in changes):
        intent = "update_goal"
    elif any(c.field == "concerns" for c in changes):
        intent = "update_concern"
    elif any(c.field == "constraints" for c in changes):
        intent = "update_constraint"
    elif any(c.field == "preferences" for c in changes):
        intent = "update_preference"
    elif any(c.field == "upcoming_events" for c in changes):
        intent = "update_event"
    elif "?" in text:
        intent = "question"
    return AgentExtraction(intent=intent, proposed_changes=changes, requires_confirmation=bool(changes),
                           rationale="Offline keyword extraction (no AI service).")


# ----------------------------------------------------------------------------- tools exposed to the agent
def tool_get_customer_profile(account_id: int) -> dict:
    """Official Tangerine metrics for the account: typical inflow I, spending S, fixed costs F, household bills H, buffer B, baseline runway."""
    m = get_metrics(int(account_id))
    return {k: v for k, v in m.to_dict().items() if k not in ("history", "buffer_rows", "inflow_mix", "outflow_mix")}


def tool_get_customer_history(account_id: int) -> dict:
    """Monthly history (money in, money out, balances) for the account."""
    m = get_metrics(int(account_id))
    return {"months": m.months_available, "history": m.history[-12:]}


def tool_get_customer_context(account_id: int) -> dict:
    """Confirmed life context (goals, concerns, constraints, preferences) for the account."""
    return cm.summarize(cm.load_context(int(account_id)))


def tool_run_official_shock(account_id: int, income_fraction: float = 1.0, bills_increase: float = 0.0,
                            one_off_cost: float = 0.0, horizon_months: int = 6) -> dict:
    """Official sponsor shock: retained income fraction r, household-bill increase h (fraction), one-off cost, horizon in months. Returns runway and verdict."""
    m = get_metrics(int(account_id))
    sh = compute_shock(m.typical_inflow, m.typical_spending, m.household_bills, m.buffer,
                       r=float(income_fraction), h=float(bills_increase), one_off=float(one_off_cost))
    return {"shock": sh, "verdict": horizon_verdict(sh, int(horizon_months))}


def tool_simulate_scenario(account_id: int, income_fraction: float = 1.0, bills_increase: float = 0.0, one_off_cost: float = 0.0,
                           shock_start: int = 0, shock_duration: int = 6, horizon_months: int = 24, freed_up_per_month: float = 0.0,
                           goal_contribution_per_month: float = 0.0, goal_target: float = 0.0) -> dict:
    """Monte Carlo projection of the buffer under a scenario and simple strategy knobs. Returns probabilities and medians, not the paths."""
    m = get_metrics(int(account_id))
    from .scenario_engine import StrategyAdjust
    spec = ScenarioSpec(scenario_type="custom", income_fraction=income_fraction, bills_increase=bills_increase, one_off_cost=one_off_cost,
                        shock_start=shock_start, shock_duration=shock_duration, horizon_months=horizon_months, n_paths=300,
                        strategy=StrategyAdjust(freed_up_per_month=freed_up_per_month, goal_contribution_per_month=goal_contribution_per_month, goal_target=goal_target))
    res = simulate(m, spec)
    return {k: res[k] for k in ("prob_below_zero_any", "median_min_buffer", "median_end_buffer", "goal_reached_share", "goal_reached_month_median", "calibration")}


def tool_compare_strategies(account_id: int) -> dict:
    """Compare feasible saving strategies for the account under its current confirmed context."""
    m = get_metrics(int(account_id))
    res = compare_strategies(m, cm.load_context(int(account_id)), n_paths=200)
    return {"goal": res["goal"], "recommended": res["recommended"], "why": res["why"], "weights": res["weights"],
            "strategies": [{k: s[k] for k in ("key", "label", "feasible", "prob_shortfall_under_stress", "goal_progress_at_deadline", "months_to_goal_deterministic", "monthly_contribution")} for s in res["strategies"]]}


def tool_propose_context_update(account_id: int, field: str, value_json: str, operation: str = "add") -> dict:
    """Stage a proposed memory update for the user to confirm. field in goals|concerns|constraints|preferences|upcoming_events; value_json is a JSON object."""
    change = ProposedChange(field=field, operation=operation, value=json.loads(value_json))  # validated
    prop = cm.propose(int(account_id), [change.model_dump()], source="gemini_tool", rationale="Proposed during conversation")
    return {"proposal_id": prop["id"], "status": prop["status"]}


def tool_get_replanning_diff(account_id: int) -> dict:
    """Difference between the previous and current plan after the latest context change."""
    from .feedback_loop import replanning_diff
    d = replanning_diff(int(account_id))
    return {"has_previous": d["has_previous"], "diff": d.get("diff")}


# Proposals are produced by the validated extraction step, so the propose tool is not exposed to the chat turn (avoids duplicates).
TOOLS = [tool_get_customer_profile, tool_get_customer_history, tool_get_customer_context, tool_run_official_shock,
         tool_simulate_scenario, tool_compare_strategies, tool_get_replanning_diff]


# ----------------------------------------------------------------------------- reply composition
def _money(x: float) -> str:
    return f"${x:,.0f}"


def offline_reply(account_id: int, text: str, extraction: AgentExtraction, summary: dict, question: dict | None) -> tuple[str, list[dict]]:
    """Grounded template reply that quotes backend numbers. Returns (reply, tool_results)."""
    m = get_metrics(account_id)
    tools_used: list[dict] = []
    parts: list[str] = []
    goal_changes = [c for c in extraction.proposed_changes if c.field == "goals" and c.operation == "add"]
    concern_changes = [c for c in extraction.proposed_changes if c.field == "concerns"]
    if goal_changes:
        g = goal_changes[0].value
        parts.append(f"That helps me understand your priorities: {g.get('label', 'that goal').lower()}"
                     + (f" in about {g['target_months']} months" if g.get("target_months") else "") + ".")
        surplus = m.typical_surplus
        if g.get("target_amount") and surplus > 0:
            mo = g["target_amount"] / surplus
            parts.append(f"Your typical surplus is {_money(surplus)} a month, so {_money(g['target_amount'])} takes about {mo:.0f} months at that pace.")
        elif surplus <= 0:
            parts.append(f"Right now typical spending ({_money(m.typical_spending)}) is at or above typical inflow ({_money(m.typical_inflow)}), so the plan will have to start by freeing up cash.")
        else:
            parts.append(f"Your typical surplus is {_money(surplus)} a month; once I know the amount I can tell you the timeline.")
    if concern_changes and concern_changes[0].value.get("type") in ("income_loss", "irregular_income"):
        r = 0.55 if concern_changes[0].value["type"] == "income_loss" else 0.70
        res = tool_run_official_shock(account_id, income_fraction=r, horizon_months=6)
        tools_used.append({"tool": "run_official_shock", "args": {"income_fraction": r, "horizon_months": 6}, "result": {"runway_label": res["shock"]["runway_label"], "verdict": res["verdict"]["verdict"]}})
        parts.append(f"Let's look at what that would mean. At {int(r * 100)}% of your usual inflow, the official runway is {res['shock']['runway_label']} months. {res['verdict']['verdict']}")
    elif concern_changes and concern_changes[0].value.get("type") in ("rising_costs", "rent_increase"):
        res = tool_run_official_shock(account_id, bills_increase=0.15, horizon_months=6)
        tools_used.append({"tool": "run_official_shock", "args": {"bills_increase": 0.15, "horizon_months": 6}, "result": {"runway_label": res["shock"]["runway_label"]}})
        parts.append(f"If household bills rose 15%, spending would be {_money(res['shock']['spending_after'])} a month against {_money(m.typical_inflow)} coming in; runway {res['shock']['runway_label']} months.")
    elif concern_changes:
        parts.append("Noted. I'll keep that concern in the plan so the strategy comparison weighs it.")
    if not parts:
        if extraction.proposed_changes:
            parts.append("Got it. I'll propose adding that to your profile so the plan can use it.")
        elif "?" in text:
            sh = compute_shock(m.typical_inflow, m.typical_spending, m.household_bills, m.buffer)
            parts.append(f"Here is where you stand: typical inflow {_money(m.typical_inflow)}, spending {_money(m.typical_spending)}, buffer {_money(m.buffer)}, baseline runway {sh['runway_label']}.")
        else:
            parts.append("Thanks. Tell me about a goal or a worry and I'll connect it to your numbers.")
    if extraction.proposed_changes:
        parts.append("I've drafted an update to your profile; please confirm it below and I'll replan.")
    if question:
        parts.append(question["text"])
    return " ".join(parts), tools_used


# ----------------------------------------------------------------------------- Gemini engine
SYSTEM_PROMPT = """You are PULP, a calm financial companion inside a bank app. Tagline: Planning Under Life's Pressures. Prepare for what comes next. Your mascot name is Pip, a tangerine.
Your job is to learn the life context the bank data cannot see (goals, deadlines, worries, flexibility, risk preference,
upcoming events) and connect it to the customer's actual numbers, which you MUST get from the tools. Never invent figures.
Rules:
- Ask at most one question per turn. Do not repeat questions already asked. Do not ask irrelevant questions.
- The person may be speaking as a hypothetical customer attached to an anonymized account; never claim the record is truly theirs.
- Use tools for every number; never compute months of runway yourself, call run_official_shock. Explain results in plain language with dollar amounts and months. No guarantees, no investment advice.
- Keep replies under 120 words. Warm, direct, specific.
Account id: {account_id}. Confirmed context so far: {context}. Questions already asked: {asked}."""

EXTRACT_PROMPT = """From the user's latest message, extract structured updates to their profile. Output JSON matching the schema.
Vocabulary: goals.value = {{type: one of {goal_types}, label, target_amount?, target_months?, priority: 1}};
concerns.value = {{type: one of {concern_types}, label}};
constraints.value = {{type: expected_rent|can_free_up_per_month|startup_budget|income_replacement, amount?, fraction?, months?}};
preferences.value = {{type: risk_preference, choice: safety|speed|balanced}};
upcoming_events.value = {{type: life_event, label, months_from_now, amount?}}.
Only propose what the user actually said. If nothing new, proposed_changes = []. follow_up_question must be one short question
that fills the most useful missing piece, or null. Existing context: {context}. User message: {message}"""


def _gemini_client():
    from google import genai  # imported lazily so the app runs without the package
    return genai.Client(api_key=GEMINI_API_KEY, http_options={"timeout": 45_000})


def gemini_turn(account_id: int, text: str, summary: dict, history: list[dict]) -> tuple[str, AgentExtraction, list[dict]]:
    from google.genai import types
    client = _gemini_client()
    sys_prompt = SYSTEM_PROMPT.format(account_id=account_id, context=json.dumps({k: summary[k] for k in ("goals", "concerns", "constraints", "preferences", "upcoming_events")}),
                                      asked=summary.get("asked_questions", []))
    contents = []
    for h in history[-10:]:
        contents.append(types.Content(role="user" if h["role"] == "user" else "model", parts=[types.Part(text=h["text"])]))
    contents.append(types.Content(role="user", parts=[types.Part(text=text)]))
    chat_cfg = types.GenerateContentConfig(system_instruction=sys_prompt, tools=TOOLS, temperature=0.4,
                                           automatic_function_calling=types.AutomaticFunctionCallingConfig(maximum_remote_calls=4))
    resp = client.models.generate_content(model=GEMINI_MODEL, contents=contents, config=chat_cfg)
    reply = (resp.text or "").strip()
    tool_log = []
    try:
        hist = getattr(resp, "automatic_function_calling_history", None) or []
        for c in hist:
            for p in (c.parts or []):
                if getattr(p, "function_call", None):
                    tool_log.append({"tool": p.function_call.name, "args": dict(p.function_call.args or {})})
                if getattr(p, "function_response", None):
                    r = p.function_response.response
                    tool_log.append({"tool": p.function_response.name, "result": json.loads(json.dumps(r, default=str))[:1] if isinstance(r, list) else {k: r[k] for k in list(r)[:6]} if isinstance(r, dict) else str(r)[:200]})
    except Exception:  # pragma: no cover
        pass

    ex_prompt = EXTRACT_PROMPT.format(goal_types=list(GOAL_LABELS.keys()), concern_types=["income_loss", "irregular_income", "rising_costs", "rent_increase", "debt", "unexpected_expense", "other"],
                                      context=json.dumps({k: summary[k] for k in ("goals", "concerns", "constraints", "preferences")}), message=text)
    ex_cfg = types.GenerateContentConfig(response_mime_type="application/json", response_schema=AgentExtraction, temperature=0.0)
    extraction = AgentExtraction()
    for attempt in range(2):
        try:
            ex = client.models.generate_content(model=GEMINI_MODEL, contents=ex_prompt, config=ex_cfg)
            extraction = AgentExtraction.model_validate_json(ex.text)
            break
        except (ValidationError, ValueError) as e:
            log.warning("extraction validation failed (attempt %s): %s", attempt + 1, e)
            if attempt == 1:
                extraction = offline_extract(text, summary)
                extraction.rationale = "Gemini extraction failed validation twice; used offline extraction."
    return reply, extraction, tool_log


# ----------------------------------------------------------------------------- entry point
def active_provider() -> str:
    """Which engine answers: gemini | vultr | offline, honouring AI_PROVIDER and the keys that are present."""
    if AI_PROVIDER == "offline":
        return "offline"
    if AI_PROVIDER == "gemini":
        return "gemini" if GEMINI_API_KEY else "offline"
    if AI_PROVIDER == "vultr":
        return "vultr" if VULTR_INFERENCE_API_KEY else "offline"
    if GEMINI_API_KEY:
        return "gemini"
    if VULTR_INFERENCE_API_KEY:
        return "vultr"
    return "offline"


def provider_info() -> dict:
    p = active_provider()
    model = GEMINI_MODEL if p == "gemini" else VULTR_INFERENCE_MODEL if p == "vultr" else None
    label = {"gemini": "Gemini companion", "vultr": "Vultr Serverless Inference companion", "offline": "offline companion"}[p]
    return {"ai_provider": p, "ai_model": model, "ai_label": label}


AI_MODES = ("gemini", "vultr")


def chat(account_id: int, text: str, prefer_offline: bool = False) -> dict:
    ctx = cm.load_context(account_id)
    summary = cm.summarize(ctx)
    pending = summary["pending_proposals"]
    cm.record_turn(account_id, "user", text)
    mode = "offline"
    tools_used: list[dict] = []
    reply = ""
    extraction = AgentExtraction()
    provider = "offline" if prefer_offline else active_provider()
    if provider == "gemini":
        try:
            reply, extraction, tools_used = gemini_turn(account_id, text, summary, ctx["conversation"][:-1])
            mode = "gemini"
        except Exception as e:  # any API failure degrades gracefully
            log.warning("Gemini unavailable, using offline engine: %s", e)
            mode = "offline_fallback"
    elif provider == "vultr":
        try:
            from .vultr_inference import vultr_turn
            ex_prompt = EXTRACT_PROMPT.format(
                goal_types=list(GOAL_LABELS.keys()),
                concern_types=["income_loss", "irregular_income", "rising_costs", "rent_increase", "debt", "unexpected_expense", "other"],
                context=json.dumps({k: summary[k] for k in ("goals", "concerns", "constraints", "preferences")}), message=text)
            reply, extraction, tools_used = vultr_turn(account_id, text, summary, ctx["conversation"][:-1], SYSTEM_PROMPT, ex_prompt, AgentExtraction)
            mode = "vultr"
        except Exception as e:
            log.warning("Vultr inference unavailable, using offline engine: %s", e)
            mode = "offline_fallback"
    if mode not in AI_MODES:
        # Treat pending (not yet confirmed) proposals as known context so follow-up answers resolve correctly.
        known = json.loads(json.dumps(summary))
        for p in pending:
            for ch in p.get("changes", []):
                known.setdefault(ch["field"], []).append(ch.get("value", {}))
        extraction = offline_extract(text, known)
    question = next_question(summary, pending + ([{"changes": [c.model_dump() for c in extraction.proposed_changes]}] if extraction.proposed_changes else []))
    if mode not in AI_MODES:
        reply, tools_used = offline_reply(account_id, text, extraction, summary, question)
    elif question and extraction.follow_up_question is None and "?" not in reply:
        reply = f"{reply} {question['text']}"
    if mode in AI_MODES and extraction.follow_up_question:
        question = {"key": "gemini_follow_up", "text": extraction.follow_up_question, "value": None}
    proposal = None
    if extraction.proposed_changes:
        proposal = cm.propose(account_id, [c.model_dump() for c in extraction.proposed_changes],
                              source=mode if mode in AI_MODES else "offline_extractor", rationale=extraction.rationale or "Extracted from conversation")
    if question and question.get("key") and question["key"] != "gemini_follow_up":
        cm.record_question(account_id, question["key"])
    cm.record_turn(account_id, "assistant", reply, {"mode": mode})
    return {
        "account_id": int(account_id), "mode": mode, "reply": reply,
        "extraction": extraction.model_dump(), "proposal": proposal, "tool_results": tools_used,
        "next_question": question, "context": cm.summarize(cm.load_context(account_id)),
        "notice": None if mode in AI_MODES else "AI service not configured or unavailable; offline companion is answering from the calculator.",
    }
