"""Stage 3 planning council on Google ADK.

Flow (see docs/agents/README.md):

  frozen request  ->  deterministic fan-out (grid of levers scored by the Monte Carlo engine)
                  ->  Strategist (Gemini, scoring tool) -> code validation -> Challenger (Gemini, actual scored candidates)
                  ->  deterministic validation: every Strategist lever is clamped and re-scored by the engine,
                      Challenger flags are attached to the candidates they name, everything is ranked once
                  ->  ranked result (numbers from the engine only)

Agents interpret, code calculates: no model output is ever used as a dollar figure or a probability. If the ADK
or the Gemini key is unavailable the fan-out still runs and the result says so (mode = "offline").

Two entry points share the same pieces: `run_council` (synchronous, one result) and `run_council_stream` (async
generator that yields stage and agent events while it works, for the live trace in the UI).
"""
from __future__ import annotations

import itertools
import json
import time
from dataclasses import replace
from typing import Any, AsyncIterator

from .. import config
from . import context_manager as cm
from .adk_runtime import ADK_AVAILABLE, LlmAgent, adk_available, json_block, run_agent, run_agent_events_async
from .scenario_engine import ScenarioSpec, StrategyAdjust, simulate
from .strategy_optimizer import _primary_goal, _weights
from .tangerine_metrics import OfficialMetrics, compute_shock, horizon_verdict
from .life_actions import humanize_candidate, spending_mix

DISRUPTION_WEIGHT = 0.25     # penalty per 100% of typical spending cut; documented in the result
MAX_STRATEGIST_LEVERS = 3
GRID_FREED_SHARES = (0.0, 0.025, 0.05, 0.10)      # share of S freed up per month
GRID_CONTRIB_SHARES = (0.0, 0.5, 1.0)             # share of capacity moved into the goal fund
GRID_FLOOR_SHARES = (0.0, 0.5, 1.0)               # share of the stress need kept as an emergency floor
FLAG_PENALTY = {"high": 0.05, "medium": 0.02, "low": 0.0}


def council_available() -> bool:
    return adk_available()


# ----------------------------------------------------------------------------- request
def freeze_request(m: OfficialMetrics, ctx: dict, *, r: float, h: float, one_off: float, duration: int,
                   horizon: int, n_paths: int, seed: int = 42) -> dict:
    """Immutable inputs for one council run: metrics, shock, goal, weights and the confirmed context."""
    I, S, H, B = m.typical_inflow, m.typical_spending, m.household_bills, m.buffer
    shock = compute_shock(I, S, H, B, r=r, h=h, one_off=one_off)
    verdict = horizon_verdict(shock, duration)
    stress_need = one_off + duration * max(0.0, shock["monthly_gap"])
    goal = _primary_goal(ctx, m, stress_need)
    if goal["source"] == "default":
        goal = {**goal, "label": "Emergency reserve for this scenario",
                "assumption": f"No goal confirmed; reserve covers the modeled gap and upfront cost for {duration} months."}
    horizon = max(horizon, goal["target_months"])
    label = f"Shock: income x{r:.2f}" + (f", bills +{h:.0%}" if h else "") + (f", one-off ${one_off:,.0f}" if one_off else "") + f" for {duration} months"
    spec = ScenarioSpec(scenario_type="stress", income_fraction=r, bills_increase=h, one_off_cost=one_off, shock_start=0,
                        shock_duration=duration, horizon_months=horizon, n_paths=n_paths, seed=seed, label=label)
    summary = cm.summarize(ctx)
    try:
        from .features import get_features
        mix = {k: round(v, 2) for k, v in spending_mix(m, get_features().loc[m.account_id]).items()}
    except Exception:  # synthetic accounts in tests have no feature row
        mix = {}
    decision_profile = {}
    try:
        from .decision_profile import build_decision_profile
        from .data_store import get_store
        decision_profile = build_decision_profile(get_store().monthly_for(m.account_id), get_features().loc[m.account_id], summary, get_store().loan_for(m.account_id))
    except KeyError:  # synthetic metrics may not have source records
        pass
    return {
        "account_id": m.account_id,
        "spending_mix_per_month": mix,
        "decision_profile": decision_profile,
        "context_version": ctx.get("context_version", 0),
        "metrics": {"I": I, "S": S, "H": H, "B": B, "F": m.typical_fixed_costs, "P": m.active_loan_payment,
                    "surplus": I - S, "months_available": m.months_available},
        "shock": {"r": r, "h": h, "one_off": one_off, "duration_months": duration, "label": label,
                  "official": {k: shock[k] for k in ("income_after", "spending_after", "buffer_left", "monthly_gap", "runway", "runway_label", "runway_status")},
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
        limits = [float(c["amount"]) for c in req["confirmed_context"].get("constraints", [])
                  if c.get("type") == "can_free_up_per_month" and c.get("amount") is not None]
        if limits and freed > max(0, min(limits)):
            continue
        capacity = max(0.0, I - S + freed)
        contrib = round(cs * capacity, 2) if target > 0 else 0.0
        floor = round(fl * need, 2)
        if contrib == 0.0 and (cs > 0 or fl > 0):
            continue  # a floor without contributions changes nothing
        key = (freed, contrib, floor)
        if key in seen:
            continue
        seen.add(key)
        parts = ["stay the course" if freed == 0 and contrib == 0 else ""]
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

    limits = [float(c["amount"]) for c in req["confirmed_context"].get("constraints", [])
              if c.get("type") == "can_free_up_per_month" and c.get("amount") is not None]
    freed = num("freed_up_per_month", min([0.30 * S] + [max(0, v) for v in limits]))
    extra = num("extra_income_per_month", 0.50 * I)
    capacity = max(0.0, I - S + freed + extra)
    contrib = num("goal_contribution_per_month", capacity)
    raw_floor = lever.get("emergency_floor", 0.0)
    try:
        raw_floor = float(raw_floor or 0.0)
    except (TypeError, ValueError):
        raw_floor = 0.0
    if 0 < raw_floor < 24:   # a model that answers in months of spending instead of dollars
        notes.append(f"emergency_floor {raw_floor:g} read as months of spending")
        lever = dict(lever, emergency_floor=round(raw_floor * S, 2))
    floor = num("emergency_floor", 2.0 * max(req["stress_need"], 1.0))
    if freed == 0 and extra == 0 and contrib == 0:
        return None, notes + ["lever has no effect after clamping"]
    label = str(lever.get("label") or "Strategist lever").strip()[:80]
    return StrategyAdjust(label=label, freed_up_per_month=freed, goal_contribution_per_month=contrib, goal_target=req["goal"]["target_amount"],
                          emergency_floor=floor, extra_income_per_month=extra), notes


_json_block = json_block   # kept for callers and tests


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

Your job: propose up to {max_levers} levers phrased as DECISIONS a person would recognise from their own life, grounded in
THIS person's numbers and confirmed context. Do not treat card/cash totals as discretionary, assume a transfer
is savings, or assume extra work is possible. Never propose pausing an unexplained transfer. If purpose or flexibility
is unknown, label the option as conditional and state the exact question needed. Compare practical choices such as
protecting a stated expense, using a confirmed saving amount, or changing the goal date or size. Describe what the
person gives up as well as the benefit. Use the decision_profile evidence and uncertainties when supplied.
Each lever still has to be expressed in the four monthly dollar dials so the engine can score it:
  freed_up_per_month (spending reduced), goal_contribution_per_month, emergency_floor, extra_income_per_month.
Never invent facts that are not in the request. Never suggest cutting bills, insurance or loan payments. If the context is empty, do not present a cut as feasible; ask what spending the person can change.

For every lever you propose, call score_strategy once with those exact dials so the engine scores it.
Then reply with ONLY a JSON object, no prose:
{{"levers": [{{"label": str, "freed_up_per_month": number, "goal_contribution_per_month": number,
  "emergency_floor": number, "extra_income_per_month": number, "why": str, "evidence": str}}]}}
All four dials are DOLLAR amounts (monthly for the first three, a balance level for emergency_floor), never months. Do not report scores yourself; the engine already has them."""

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


class _Run:
    """Everything one council run carries between its stages."""

    def __init__(self, account_id: int, m: OfficialMetrics, *, r: float, h: float, one_off: float, duration: int, horizon: int,
                 n_paths: int, use_ai: bool, top_n: int):
        self.t0 = time.perf_counter()
        self.account_id, self.m, self.top_n = account_id, m, top_n
        self.ctx = cm.load_context(account_id)
        self.req = freeze_request(m, self.ctx, r=r, h=h, one_off=one_off, duration=duration, horizon=horizon, n_paths=n_paths)
        self.candidates: list[dict] = []
        self.t_grid = 0.0
        self.use_ai = use_ai and council_available()
        self.scored_by_tool: list[dict] = []
        self.strategist_out: dict | None = None
        self.challenger_out: dict | None = None
        self.validation_notes: list[str] = []
        self.tool_calls: list[dict] = []
        self.unmatched_flags: list[dict] = []
        self.mode = "offline"
        self.error: str | None = None

    def fan_out(self) -> None:
        t = time.perf_counter()
        self.candidates = fan_out(self.m, self.req)
        self.candidates.sort(key=lambda c: -c["score"])
        self.t_grid = time.perf_counter() - t

    def _score_tool(self):
        m, req, scored = self.m, self.req, self.scored_by_tool

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
            scored.append(c)
            return {"label": c["label"], "prob_shortfall_under_stress": round(c["prob_shortfall_under_stress"], 3),
                    "goal_progress_at_deadline": round(c["goal_progress_at_deadline"], 3), "disruption": round(c["disruption"], 3),
                    "score": round(c["score"], 3), "clamped": notes}

        return score_strategy

    def build_root(self) -> Any:
        strategist = LlmAgent(
            name="strategist", model=config.GEMINI_MODEL, description="Proposes person-specific levers and has the engine score them.",
            instruction=STRATEGIST_INSTRUCTION.format(max_levers=MAX_STRATEGIST_LEVERS), tools=[self._score_tool()], output_key="strategist",
        )
        return strategist

    def review_root(self):
        return LlmAgent(name="challenger", model=config.GEMINI_MODEL,
            description="Reviews the actual validated candidates, including the Strategist's proposals.",
            instruction=CHALLENGER_INSTRUCTION, output_key="challenger")

    def review_payload(self):
        brief = json.loads(self.payload())
        brief["grid_top"] = [{"label": c["label"], "levers": c["levers"],
            "prob_shortfall_under_stress": c["prob_shortfall_under_stress"], "score": c["score"]}
            for c in self.candidates]
        return json.dumps(brief, default=float)

    def absorb_review(self, res):
        self.challenger_out = json_block(res["state"].get("challenger") or
            "\n".join(res["texts"].get("challenger", []))) or {"flags": [], "questions": []}
        self.tool_calls.extend(res.get("tool_calls", []))
        self.unmatched_flags = _attach_flags(self.candidates,
            [f for f in self.challenger_out.get("flags", []) if isinstance(f, dict)])

    def payload(self) -> str:
        brief = dict(self.req)
        brief["grid_top"] = [{"label": c["label"], "levers": c["levers"], "prob_shortfall_under_stress": round(c["prob_shortfall_under_stress"], 3),
                              "goal_progress_at_deadline": round(c["goal_progress_at_deadline"], 3), "score": round(c["score"], 3)} for c in self.candidates[:5]]
        brief.pop("spec", None)
        return json.dumps(brief, default=float)

    def absorb(self, res: dict) -> None:
        self.mode = "adk"
        self.tool_calls = res["tool_calls"]
        state = res["state"]
        s_text = state.get("strategist") or "\n".join(res["texts"].get("strategist", []))
        c_text = state.get("challenger") or "\n".join(res["texts"].get("challenger", []))
        self.strategist_out = json_block(s_text) or {"levers": [], "raw": (s_text or "")[:2000]}
        self.challenger_out = json_block(c_text) or {"flags": [], "questions": [], "raw": (c_text or "")[:2000]}

    def validate(self) -> None:
        """Re-score every proposed lever ourselves and attach flags; the model's own numbers are ignored."""
        if self.strategist_out:
            for lever in (self.strategist_out.get("levers") or [])[:MAX_STRATEGIST_LEVERS]:
                if not isinstance(lever, dict):
                    continue
                strat, notes = _clamp_lever(self.m, self.req, lever)
                if strat is None:
                    self.validation_notes.append(f"dropped '{lever.get('label', '?')}': {'; '.join(notes)}")
                    continue
                c = score_candidate(self.m, self.req, strat, source="strategist")
                c["why"] = str(lever.get("why", ""))[:400]
                c["evidence"] = str(lever.get("evidence", ""))[:400]
                if notes:
                    c["validation"] = notes
                self.candidates.append(c)
        if self.challenger_out:
            flags = [f for f in (self.challenger_out.get("flags") or []) if isinstance(f, dict)]
            self.unmatched_flags = _attach_flags(self.candidates, flags)

    def rank(self) -> dict:
        for c in self.candidates:
            penalty = sum(FLAG_PENALTY.get(f.get("severity"), 0.0) for f in c["flags"])
            c["adjusted_score"] = c["score"] - penalty
        self.candidates.sort(key=lambda c: -c["adjusted_score"])
        ranked = self.candidates[: self.top_n]
        stay = next((c for c in self.candidates if c["levers"]["freed_up_per_month"] == 0 and c["levers"]["goal_contribution_per_month"] == 0
                     and c["levers"]["extra_income_per_month"] == 0), None)
        try:  # life language on every candidate (needs the account's feature row; synthetic test accounts skip it)
            from .features import get_features
            row = get_features().loc[self.account_id]
            for c in self.candidates:
                humanize_candidate(c, self.m, row, self.req, stay)
        except Exception:
            pass
        best = ranked[0] if ranked else None
        why = None
        if best:
            w = self.req["weights"]
            why = (f"'{best['label']}' scores {best['score']:.2f} = {w['resilience']:.0%} x (1 - {best['prob_shortfall_under_stress']:.0%} shortfall risk) "
                   f"+ {w['goal']:.0%} x {best['goal_progress_at_deadline']:.0%} goal progress - {DISRUPTION_WEIGHT} x {best['disruption']:.1%} of spending cut"
                   + (f"; {len(best['flags'])} Challenger flag(s) applied" if best["flags"] else "") + ".")
        return {
            "account_id": self.account_id,
            "mode": self.mode,
            "framework": {"name": "google-adk", "available": ADK_AVAILABLE, "model": config.GEMINI_MODEL if self.mode == "adk" else None,
                          "agents": ["strategist", "challenger"] if self.mode == "adk" else []},
            "error": self.error,
            "request": {k: v for k, v in self.req.items() if k != "spec"},
            "objective": {"formula": "resilience_w x (1 - P(shortfall)) + goal_w x goal_progress - 0.25 x (freed_up / S)",
                          "weights": self.req["weights"], "disruption_weight": DISRUPTION_WEIGHT, "flag_penalty": FLAG_PENALTY},
            "grid_size": sum(1 for c in self.candidates if c["source"] == "grid"),
            "ranked": ranked,
            "recommended": best["label"] if best else None,
            "why": why,
            "stay_the_course": stay,
            "strategist": self.strategist_out,
            "challenger": self.challenger_out,
            "unmatched_flags": self.unmatched_flags,
            "validation_notes": self.validation_notes,
            "tool_calls": self.tool_calls,
            "timing_seconds": {"fan_out": round(self.t_grid, 2), "total": round(time.perf_counter() - self.t0, 2)},
            "disclaimer": "Model outputs for the chosen shock on anonymized data; the agents propose and flag, the engine computes every number.",
        }


# ----------------------------------------------------------------------------- entry points
def run_council(account_id: int, m: OfficialMetrics, *, r: float, h: float, one_off: float, duration: int = 6,
                horizon: int = 24, n_paths: int = 200, use_ai: bool = True, top_n: int = 8) -> dict:
    run = _Run(account_id, m, r=r, h=h, one_off=one_off, duration=duration, horizon=horizon, n_paths=n_paths, use_ai=use_ai, top_n=top_n)
    run.fan_out()
    if run.use_ai:
        try:
            run.absorb(run_agent(run.build_root(), run.payload(), user_id=f"acct-{account_id}"))
        except Exception as exc:  # the council never breaks the deterministic answer
            run.error = f"{type(exc).__name__}: {exc}"[:500]
            run.mode = "offline"
        run.validate()
        if run.mode == "adk":
            try:
                run.absorb_review(run_agent(run.review_root(), run.review_payload(), user_id=f"acct-{account_id}"))
            except Exception as exc:
                run.error = f"Challenger unavailable: {type(exc).__name__}"
    return run.rank()


async def run_council_stream(account_id: int, m: OfficialMetrics, *, r: float, h: float, one_off: float, duration: int = 6,
                             horizon: int = 24, n_paths: int = 200, use_ai: bool = True, top_n: int = 8) -> AsyncIterator[tuple[str, dict]]:
    """Yields ("stage", {...}), ("agent", {...}) and finally ("plan", result) for a live trace."""
    from starlette.concurrency import run_in_threadpool

    t0 = time.perf_counter()

    def stage(name: str, status: str, detail: str, **data: Any) -> tuple[str, dict]:
        out = {"name": name, "status": status, "detail": detail, "seconds": round(time.perf_counter() - t0, 2)}
        if data:
            out["data"] = data
        return "stage", out

    yield stage("freeze", "start", "Freezing the request: official numbers, shock, goal, weights, confirmed context")
    run = await run_in_threadpool(lambda: _Run(account_id, m, r=r, h=h, one_off=one_off, duration=duration, horizon=horizon, n_paths=n_paths, use_ai=use_ai, top_n=top_n))
    yield stage("freeze", "done", f"Request frozen: {run.req['shock']['label']}; goal {run.req['goal']['label']}", goal=run.req["goal"]["label"],
                verdict=run.req["shock"]["verdict"].get("verdict") if isinstance(run.req["shock"]["verdict"], dict) else None)
    yield stage("fan_out", "start", "Scoring the lever grid with the Monte Carlo engine")
    await run_in_threadpool(run.fan_out)
    yield stage("fan_out", "done", f"Scored {len(run.candidates)} candidates in {run.t_grid:.1f} s", candidates=len(run.candidates),
                best_grid=run.candidates[0]["label"] if run.candidates else None)
    req = run.req
    ctx_bits = ", ".join(f"{k} {len(v)}" for k, v in req["confirmed_context"].items() if v)
    frozen_items = [f"I {req['metrics']['I']:,.0f} / S {req['metrics']['S']:,.0f} / B {req['metrics']['B']:,.0f}", req["shock"]["label"],
                                f"goal: {req['goal']['label']} ({req['goal']['target_months']} months)",
                                f"weights: safety {req['weights']['resilience']:.0%} / goal {req['weights']['goal']:.0%}",
                                ("confirmed context: " + ctx_bits) if ctx_bits else "confirmed context: none yet",
                                (f"grid: {len(run.candidates)} candidates, best '{run.candidates[0]['label']}'" if run.candidates else "grid: empty")]
    if run.use_ai:
        yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "engine", "to": "strategist", "title": "Frozen request",
                          "items": frozen_items, "mode": "adk"}
    else:
        # Offline: no Strategist or Challenger runs, so the grid goes straight to the Ranker. Say so plainly.
        yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "engine", "to": "ranker", "title": "Offline run: engine grid only",
                          "items": frozen_items + ["no model available: the Strategist and Challenger did not run"], "mode": "offline"}
    if run.use_ai:
        yield stage("council", "start", "Strategist proposes levers; Challenger then reviews scored candidates")
        try:
            async for ev in run_agent_events_async(run.build_root(), run.payload(), user_id=f"acct-{account_id}"):
                if ev["type"] == "agent":
                    yield "agent", {k: v for k, v in ev.items() if k != "type"}
                else:
                    run.absorb(ev)
        except Exception as exc:
            run.error = f"{type(exc).__name__}: {exc}"[:500]
            run.mode = "offline"
            yield stage("council", "done", f"Agents unavailable ({type(exc).__name__}); continuing with the grid")
            yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "strategist", "to": "ranker", "title": "Agents unavailable: engine grid only",
                              "items": [f"{type(exc).__name__}: the Strategist did not return levers"], "mode": "offline"}
        else:
            levers = [l for l in ((run.strategist_out or {}).get("levers") or []) if isinstance(l, dict)]
            flags = [f for f in ((run.challenger_out or {}).get("flags") or []) if isinstance(f, dict)]
            questions = [q for q in ((run.challenger_out or {}).get("questions") or []) if isinstance(q, str)]
            n_lev, n_fl = len(levers), len(flags)
            yield stage("council", "done", f"Strategist proposed {n_lev} lever(s); ready for validation", levers=n_lev, flags=n_fl)

            def _dials(l: dict) -> str:
                parts = []
                for k, lab in (("freed_up_per_month", "free up"), ("goal_contribution_per_month", "save"), ("emergency_floor", "floor"), ("extra_income_per_month", "extra income")):
                    try:
                        v = float(l.get(k) or 0)
                    except (TypeError, ValueError):
                        v = 0.0
                    if v:
                        parts.append(f"{lab} ${v:,.0f}")
                return ", ".join(parts) or "no dials"

            yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "strategist", "to": "validator", "title": f"{n_lev} lever(s) proposed",
                              "items": [f"{l.get('label', 'lever')}: {_dials(l)}" + (f" / why: {str(l.get('why', ''))[:140]}" if l.get("why") else "") for l in levers] or ["no lever this time"]}
        yield stage("validate", "start", "Clamping and re-scoring every proposed lever; attaching flags")
        await run_in_threadpool(run.validate)
        if run.mode == "adk":
            yield stage("review", "start", "Challenger checks the scored proposals against your constraints")
            try:
                async for ev in run_agent_events_async(run.review_root(), run.review_payload(), user_id=f"acct-{account_id}"):
                    if ev["type"] == "agent":
                        yield "agent", {k: v for k, v in ev.items() if k != "type"}
                    else:
                        run.absorb_review(ev)
            except Exception as exc:
                run.error = f"Challenger unavailable: {type(exc).__name__}"
            flags = (run.challenger_out or {}).get("flags", [])
            yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "challenger", "to": "ranker",
                "title": f"Reviewed candidates: {len(flags)} flag(s)",
                "items": [str(f.get("risk", "")) for f in flags if isinstance(f, dict)] or [run.error or "No feasibility flags"]}
            yield stage("review", "done", "Candidate review complete" if not run.error else run.error)
        yield stage("validate", "done", f"{len(run.validation_notes)} lever(s) dropped; {len(run.unmatched_flags)} flag(s) unmatched")
    else:
        yield stage("council", "done", "No model available: grid only")
    yield stage("rank", "start", "Ranking by the objective with flag penalties")
    result = run.rank()
    yield stage("rank", "done", f"Recommended: {result['recommended']}", recommended=result["recommended"])
    top = result["ranked"][:3]
    yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "ranker", "to": "director", "mode": run.mode,
                      "title": f"Ranked {len(result['ranked'])} plans" + (" (offline)" if run.mode != "adk" else ""),
                      "items": [f"#{i + 1} {c['label']} / P(shortfall) {c['prob_shortfall_under_stress']:.0%} / score {c['adjusted_score']:.2f}"
                                + (f" / {len(c['flags'])} flag" if c["flags"] else "") for i, c in enumerate(top)]
                               + ([f"dropped: {n}" for n in run.validation_notes[:2]] if run.validation_notes else [])}
    yield "plan", result
