"""Stage 3 planning council on Google ADK.

Flow (see docs/agents/README.md):

  frozen request  ->  deterministic fan-out (grid of levers scored by the Monte Carlo engine)
                  ->  ADK ParallelAgent: Strategist (Gemini, may call the scoring tool) || Challenger (Gemini, no tools)
                  ->  deterministic validation: every Strategist lever is clamped and re-scored by the engine,
                      Challenger flags are attached to the candidates they name, everything is ranked once
                  ->  ranked result (numbers from the engine only)

Agents interpret, code calculates: no model output is ever used as a dollar figure or a probability. If the ADK
or the Gemini key is unavailable the fan-out still runs and the result says so (mode = "offline").
"""
from __future__ import annotations

import asyncio
import itertools
import json
import os
import re
import time
from dataclasses import replace
from typing import Any

from .. import config
from . import context_manager as cm
from .scenario_engine import ScenarioSpec, StrategyAdjust, simulate
from .strategy_optimizer import _primary_goal, _weights
from .tangerine_metrics import OfficialMetrics, compute_shock, horizon_verdict

try:  # ADK is optional at import time so the slim Vercel function still boots
    from google.adk.agents import LlmAgent, ParallelAgent
    from google.adk.runners import InMemoryRunner
    from google.genai import types as gtypes

    ADK_AVAILABLE = True
except Exception:  # pragma: no cover - depends on the environment
    ADK_AVAILABLE = False

DISRUPTION_WEIGHT = 0.25     # penalty per 100% of typical spending cut; documented in the result
MAX_STRATEGIST_LEVERS = 3
GRID_FREED_SHARES = (0.0, 0.025, 0.05, 0.10)      # share of S freed up per month
GRID_CONTRIB_SHARES = (0.0, 0.5, 1.0)             # share of capacity moved into the goal fund
GRID_FLOOR_SHARES = (0.0, 0.5, 1.0)               # share of the stress need kept as an emergency floor


def council_available() -> bool:
    return ADK_AVAILABLE and bool(config.GEMINI_API_KEY)


# ----------------------------------------------------------------------------- request
def freeze_request(m: OfficialMetrics, ctx: dict, *, r: float, h: float, one_off: float, duration: int,
                   horizon: int, n_paths: int, seed: int = 42) -> dict:
    """Immutable inputs for one council run: metrics, shock, goal, weights and the confirmed context."""
    I, S, H, B = m.typical_inflow, m.typical_spending, m.household_bills, m.buffer
    shock = compute_shock(I, S, H, B, r=r, h=h, one_off=one_off)
    verdict = horizon_verdict(shock, duration)
    stress_need = one_off + duration * max(0.0, shock["monthly_gap"])
    goal = _primary_goal(ctx, m, stress_need)
    horizon = max(horizon, goal["target_months"])
    label = f"Shock: income x{r:.2f}" + (f", bills +{h:.0%}" if h else "") + (f", one-off ${one_off:,.0f}" if one_off else "") + f" for {duration} months"
    spec = ScenarioSpec(scenario_type="stress", income_fraction=r, bills_increase=h, one_off_cost=one_off, shock_start=0,
                        shock_duration=duration, horizon_months=horizon, n_paths=n_paths, seed=seed, label=label)
    summary = cm.summarize(ctx)
    return {
        "account_id": m.account_id,
        "context_version": ctx.get("context_version", 0),
        "metrics": {"I": I, "S": S, "H": H, "B": B, "F": m.typical_fixed_costs, "P": m.active_loan_payment,
                    "surplus": I - S, "months_available": m.months_available},
        "shock": {"r": r, "h": h, "one_off": one_off, "duration_months": duration, "label": label,
                  "official": {k: shock[k] for k in ("income_after", "spending_after", "buffer_left", "monthly_gap", "runway_label", "runway_status")},
                  "verdict": verdict},
        "stress_need": stress_need,
        "goal": goal,
        "weights": _weights(ctx),
        "horizon_months": horizon,
        "confirmed_context": {k: summary.get(k, []) for k in ("goals", "concerns", "constraints", "preferences", "upcoming_events")},
        "spec": spec.to_dict(),
    }


# ----------------------------------------------------------------------------- scoring (code)
def _spec_from(req: dict) -> ScenarioSpec:
    d = dict(req["spec"])
    d.pop("strategy", None)
    return ScenarioSpec(**d)


def score_candidate(m: OfficialMetrics, req: dict, strat: StrategyAdjust, *, source: str) -> dict:
    """Run one lever set through the engine and compute the documented objective."""
    spec = replace(_spec_from(req), strategy=strat, label=strat.label)
    mc = simulate(m, spec)
    det = simulate(m, spec, deterministic=True)
    goal = req["goal"]
    w = req["weights"]
    deadline = min(goal["target_months"], spec.horizon_months)
    amount = det["goal_fund_median"][deadline] if goal["target_amount"] > 0 else 0.0
    progress = min(1.0, amount / goal["target_amount"]) if goal["target_amount"] > 0 else 0.0
    p_short = mc["prob_below_zero_any"]
    disruption = strat.freed_up_per_month / max(1.0, m.typical_spending)
    score = w["resilience"] * (1 - p_short) + w["goal"] * progress - DISRUPTION_WEIGHT * disruption
    return {
        "label": strat.label, "source": source,
        "levers": {"freed_up_per_month": strat.freed_up_per_month, "goal_contribution_per_month": strat.goal_contribution_per_month,
                   "emergency_floor": strat.emergency_floor, "extra_income_per_month": strat.extra_income_per_month},
        "prob_shortfall_under_stress": p_short, "median_min_buffer": mc["median_min_buffer"], "median_end_buffer": mc["median_end_buffer"],
        "goal_progress_at_deadline": progress, "goal_amount_at_deadline": amount, "months_to_goal_deterministic": det.get("goal_reached_month_median"),
        "disruption": disruption, "score": score,
        "buffer_median_path": mc["buffer_percentiles"]["p50"], "goal_median_path": mc["goal_fund_median"],
        "flags": [],
    }


def fan_out(m: OfficialMetrics, req: dict) -> list[dict]:
    """Deterministic grid over the three lever dials. Infeasible combinations are skipped."""
    S, I = m.typical_spending, m.typical_inflow
    need = req["stress_need"]
    target = req["goal"]["target_amount"]
    out: list[dict] = []
    seen: set[tuple] = set()
    for fs, cs, fl in itertools.product(GRID_FREED_SHARES, GRID_CONTRIB_SHARES, GRID_FLOOR_SHARES):
        freed = round(fs * S, 2)
        capacity = max(0.0, I - S + freed)
        contrib = round(cs * capacity, 2) if target > 0 else 0.0
        floor = round(fl * need, 2)
        if contrib == 0.0 and (cs > 0 or fl > 0):
            continue  # a floor without contributions changes nothing
        key = (freed, contrib, floor)
        if key in seen:
            continue
        seen.add(key)
        parts = []
        parts.append("stay the course" if freed == 0 and contrib == 0 else "")
        if freed:
            parts.append(f"trim spending {fs:.1%}")
        if contrib:
            parts.append(f"save {cs:.0%} of capacity")
        if floor:
            parts.append(f"floor {fl:.0%} of stress need")
        label = ", ".join(p for p in parts if p)
        strat = StrategyAdjust(label=label, freed_up_per_month=freed, goal_contribution_per_month=contrib, goal_target=target, emergency_floor=floor)
        out.append(score_candidate(m, req, strat, source="grid"))
    return out


# ----------------------------------------------------------------------------- validation (code)
def _clamp_lever(m: OfficialMetrics, req: dict, lever: dict) -> tuple[StrategyAdjust | None, list[str]]:
    """Clamp a model-proposed lever into the admissible box; return None if nothing is left of it."""
    notes: list[str] = []
    S, I = m.typical_spending, m.typical_inflow

    def num(key: str, hi: float) -> float:
        try:
            v = float(lever.get(key, 0.0) or 0.0)
        except (TypeError, ValueError):
            v = 0.0
        if v < 0:
            notes.append(f"{key} below zero set to 0")
            v = 0.0
        if v > hi:
            notes.append(f"{key} capped at {hi:,.0f}")
            v = hi
        return round(v, 2)

    freed = num("freed_up_per_month", 0.30 * S)
    extra = num("extra_income_per_month", 0.50 * I)
    capacity = max(0.0, I - S + freed + extra)
    contrib = num("goal_contribution_per_month", capacity)
    floor = num("emergency_floor", 2.0 * max(req["stress_need"], 1.0))
    if freed == 0 and extra == 0 and contrib == 0:
        return None, notes + ["lever has no effect after clamping"]
    label = str(lever.get("label") or "Strategist lever").strip()[:80]
    return StrategyAdjust(label=label, freed_up_per_month=freed, goal_contribution_per_month=contrib, goal_target=req["goal"]["target_amount"],
                          emergency_floor=floor, extra_income_per_month=extra), notes


def _json_block(text: str) -> dict | None:
    """Pull the first JSON object out of a model reply (fenced or bare)."""
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    raw = fenced.group(1) if fenced else None
    if raw is None:
        start, end = text.find("{"), text.rfind("}")
        raw = text[start:end + 1] if start >= 0 and end > start else None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _attach_flags(candidates: list[dict], flags: list[dict]) -> list[dict]:
    """Match Challenger flags to candidates by label (case-insensitive substring either way)."""
    unmatched = []
    for f in flags:
        target = str(f.get("candidate", "")).strip().lower()
        hit = False
        for c in candidates:
            lab = c["label"].lower()
            if target and (target in lab or lab in target):
                c["flags"].append({"risk": f.get("risk", ""), "severity": f.get("severity", "medium"), "because": f.get("because", "")})
                hit = True
        if not hit:
            unmatched.append(f)
    return unmatched


# ----------------------------------------------------------------------------- agents (ADK)
STRATEGIST_INSTRUCTION = """You are the Strategist in PULP's planning council for one bank customer.
You receive a frozen request as JSON: the customer's official numbers (I inflow, S spending, H household bills, B buffer),
the shock, their confirmed goal, the weights, the confirmed life context, and the best grid candidates already scored.

Your job: propose up to {max_levers} levers the grid cannot invent because they come from THIS person's context
(for example pausing a stated recurring transfer, a side income they mentioned, deferring a stated goal, a temporary
cut tied to a named constraint). Each lever is a set of monthly dollar dials:
  freed_up_per_month (spending reduced), goal_contribution_per_month, emergency_floor, extra_income_per_month.
Never invent facts that are not in the request. If the context is empty, propose at most one generic lever and say so.

For every lever you propose, call score_strategy once with those exact dials so the engine scores it.
Then reply with ONLY a JSON object, no prose:
{{"levers": [{{"label": str, "freed_up_per_month": number, "goal_contribution_per_month": number,
  "emergency_floor": number, "extra_income_per_month": number, "why": str, "evidence": str}}]}}
Dollar amounts are monthly and in Canadian dollars. Do not report scores yourself; the engine already has them."""

CHALLENGER_INSTRUCTION = """You are the Challenger in PULP's planning council for one bank customer.
You receive a frozen request as JSON with the official numbers, the shock, the confirmed goal, the confirmed life context
(goals, concerns, constraints, preferences, upcoming events), and the top grid candidates with their levers and scores.

Your job is feasibility, not arithmetic: for each candidate, decide whether THIS person is likely to follow it,
using only the confirmed context and the numbers given (for example: a 10% spending trim when spending already equals
inflow; a goal contribution larger than the stated surplus; a floor that ignores a stated upcoming expense).
Reply with ONLY a JSON object, no prose:
{{"flags": [{{"candidate": str (the candidate label, copied exactly), "risk": str, "severity": "low"|"medium"|"high", "because": str}}],
 "questions": [str]}}
Flag at most one risk per candidate and leave unflagged candidates out. Questions are things the intake companion
should ask next because they would change the plan. Do not compute or restate any dollar figure or probability."""


def _build_root(score_tool) -> Any:
    strategist = LlmAgent(
        name="strategist", model=config.GEMINI_MODEL, description="Proposes person-specific levers and has the engine score them.",
        instruction=STRATEGIST_INSTRUCTION.format(max_levers=MAX_STRATEGIST_LEVERS), tools=[score_tool], output_key="strategist",
    )
    challenger = LlmAgent(
        name="challenger", model=config.GEMINI_MODEL, description="Checks each candidate against the confirmed context for feasibility.",
        instruction=CHALLENGER_INSTRUCTION, output_key="challenger",
    )
    return ParallelAgent(name="pulp_council", description="Strategist and Challenger review the same frozen request in parallel.",
                         sub_agents=[strategist, challenger])


async def _run_adk(root: Any, payload: str, account_id: int) -> dict:
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")
    runner = InMemoryRunner(agent=root, app_name="pulp")
    session = await runner.session_service.create_session(app_name="pulp", user_id=f"acct-{account_id}")
    msg = gtypes.Content(role="user", parts=[gtypes.Part(text=payload)])
    texts: dict[str, list[str]] = {}
    tool_calls: list[dict] = []
    try:
        async for ev in runner.run_async(user_id=session.user_id, session_id=session.id, new_message=msg):
            for call in ev.get_function_calls() or []:
                tool_calls.append({"agent": ev.author, "tool": call.name, "args": dict(call.args or {})})
            if ev.content and ev.content.parts:
                for p in ev.content.parts:
                    if getattr(p, "text", None):
                        texts.setdefault(ev.author or "?", []).append(p.text)
        final = await runner.session_service.get_session(app_name="pulp", user_id=session.user_id, session_id=session.id)
        state = dict(final.state) if final else {}
    finally:
        try:
            await runner.close()
        except Exception:
            pass
    return {"state": state, "texts": texts, "tool_calls": tool_calls}


# ----------------------------------------------------------------------------- entry point
def run_council(account_id: int, m: OfficialMetrics, *, r: float, h: float, one_off: float, duration: int = 6,
                horizon: int = 24, n_paths: int = 200, use_ai: bool = True, top_n: int = 8) -> dict:
    t0 = time.perf_counter()
    ctx = cm.load_context(account_id)
    req = freeze_request(m, ctx, r=r, h=h, one_off=one_off, duration=duration, horizon=horizon, n_paths=n_paths)
    candidates = fan_out(m, req)
    candidates.sort(key=lambda c: -c["score"])
    t_grid = time.perf_counter() - t0

    strategist_out: dict | None = None
    challenger_out: dict | None = None
    validation_notes: list[str] = []
    tool_calls: list[dict] = []
    unmatched_flags: list[dict] = []
    mode = "offline"
    error: str | None = None

    if use_ai and council_available():
        scored_by_tool: list[dict] = []

        def score_strategy(label: str, freed_up_per_month: float, goal_contribution_per_month: float,
                           emergency_floor: float, extra_income_per_month: float = 0.0) -> dict:
            """Score one lever set with PULP's Monte Carlo engine under the frozen shock.

            Args:
              label: short name for the lever set.
              freed_up_per_month: monthly spending reduction in dollars.
              goal_contribution_per_month: monthly amount moved into the goal fund in dollars.
              emergency_floor: buffer level in dollars below which contributions pause.
              extra_income_per_month: additional monthly income in dollars (0 if none).
            Returns:
              shortfall probability, goal progress at the deadline, disruption share and the combined score.
            """
            strat, notes = _clamp_lever(m, req, {"label": label, "freed_up_per_month": freed_up_per_month, "goal_contribution_per_month": goal_contribution_per_month,
                                                 "emergency_floor": emergency_floor, "extra_income_per_month": extra_income_per_month})
            if strat is None:
                return {"error": "lever has no effect", "notes": notes}
            c = score_candidate(m, req, strat, source="strategist")
            scored_by_tool.append(c)
            return {"label": c["label"], "prob_shortfall_under_stress": round(c["prob_shortfall_under_stress"], 3),
                    "goal_progress_at_deadline": round(c["goal_progress_at_deadline"], 3), "disruption": round(c["disruption"], 3),
                    "score": round(c["score"], 3), "clamped": notes}

        brief = dict(req)
        brief["grid_top"] = [{"label": c["label"], "levers": c["levers"], "prob_shortfall_under_stress": round(c["prob_shortfall_under_stress"], 3),
                              "goal_progress_at_deadline": round(c["goal_progress_at_deadline"], 3), "score": round(c["score"], 3)} for c in candidates[:5]]
        brief.pop("spec", None)
        payload = json.dumps(brief, default=float)
        try:
            res = asyncio.run(_run_adk(_build_root(score_strategy), payload, account_id))
            mode = "adk"
            tool_calls = res["tool_calls"]
            state = res["state"]
            s_text = state.get("strategist") or "\n".join(res["texts"].get("strategist", []))
            c_text = state.get("challenger") or "\n".join(res["texts"].get("challenger", []))
            strategist_out = _json_block(s_text) or {"levers": [], "raw": s_text[:2000]}
            challenger_out = _json_block(c_text) or {"flags": [], "questions": [], "raw": c_text[:2000]}
        except Exception as exc:  # the council never breaks the deterministic answer
            error = f"{type(exc).__name__}: {exc}"[:500]
            mode = "offline"

        # Validation: re-score every proposed lever ourselves; ignore the model's own numbers entirely.
        if strategist_out:
            for lever in (strategist_out.get("levers") or [])[:MAX_STRATEGIST_LEVERS]:
                if not isinstance(lever, dict):
                    continue
                strat, notes = _clamp_lever(m, req, lever)
                if strat is None:
                    validation_notes.append(f"dropped '{lever.get('label', '?')}': {'; '.join(notes)}")
                    continue
                c = score_candidate(m, req, strat, source="strategist")
                c["why"] = str(lever.get("why", ""))[:400]
                c["evidence"] = str(lever.get("evidence", ""))[:400]
                if notes:
                    c["validation"] = notes
                candidates.append(c)
        if challenger_out:
            flags = [f for f in (challenger_out.get("flags") or []) if isinstance(f, dict)]
            unmatched_flags = _attach_flags(candidates, flags)

    # Final ranking is deterministic; a high-severity flag demotes a candidate below unflagged ones with a close score.
    for c in candidates:
        penalty = sum(0.05 if f.get("severity") == "high" else 0.02 if f.get("severity") == "medium" else 0.0 for f in c["flags"])
        c["adjusted_score"] = c["score"] - penalty
    candidates.sort(key=lambda c: -c["adjusted_score"])
    ranked = candidates[:top_n]
    stay = next((c for c in candidates if c["levers"]["freed_up_per_month"] == 0 and c["levers"]["goal_contribution_per_month"] == 0
                 and c["levers"]["extra_income_per_month"] == 0), None)
    best = ranked[0] if ranked else None
    why = None
    if best:
        w = req["weights"]
        why = (f"'{best['label']}' scores {best['score']:.2f} = {w['resilience']:.0%} x (1 - {best['prob_shortfall_under_stress']:.0%} shortfall risk) "
               f"+ {w['goal']:.0%} x {best['goal_progress_at_deadline']:.0%} goal progress - {DISRUPTION_WEIGHT} x {best['disruption']:.1%} of spending cut"
               + (f"; {len(best['flags'])} Challenger flag(s) applied" if best["flags"] else "") + ".")
    return {
        "account_id": account_id,
        "mode": mode,
        "framework": {"name": "google-adk", "available": ADK_AVAILABLE, "model": config.GEMINI_MODEL if mode == "adk" else None,
                      "agents": ["strategist", "challenger"] if mode == "adk" else []},
        "error": error,
        "request": {k: v for k, v in req.items() if k != "spec"},
        "objective": {"formula": "resilience_w x (1 - P(shortfall)) + goal_w x goal_progress - 0.25 x (freed_up / S)",
                      "weights": req["weights"], "disruption_weight": DISRUPTION_WEIGHT,
                      "flag_penalty": {"high": 0.05, "medium": 0.02, "low": 0.0}},
        "grid_size": sum(1 for c in candidates if c["source"] == "grid"),
        "ranked": ranked,
        "recommended": best["label"] if best else None,
        "why": why,
        "stay_the_course": stay,
        "strategist": strategist_out,
        "challenger": challenger_out,
        "unmatched_flags": unmatched_flags,
        "validation_notes": validation_notes,
        "tool_calls": tool_calls,
        "timing_seconds": {"fan_out": round(t_grid, 2), "total": round(time.perf_counter() - t0, 2)},
        "disclaimer": "Model outputs for the chosen shock on anonymized data; the agents propose and flag, the engine computes every number.",
    }
