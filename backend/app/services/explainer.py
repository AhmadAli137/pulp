"""Explainer: turns a Stage 1 profile and a council result into a short script of animated scenes.

The scene list, its order and every number in it are built in code from the insights and the plan. The Explainer
agent (Gemini on ADK) may only rewrite the narration line of each scene, using the numbers already present; its
output is validated against the scene ids and falls back to the template narration.

Scene types the frontend knows how to draw: runway, two_futures, habit, lever.
"""
from __future__ import annotations

import json
import math

from pydantic import BaseModel, Field

from .. import config
from .adk_runtime import LlmAgent, adk_available, agent_output, run_agent

HABIT_KIND = {
    "timing_dips": "timing", "fee_bleed": "fee", "lifestyle_creep": "creep", "savings_elsewhere": "transfer",
    "thin_margin": "margin", "income_volatile": "volatile", "loan_stress": "loan",
}


def _money(x: float) -> str:
    return f"${x:,.0f}"


def _pct(x: float) -> str:
    return f"{x:.0%}"


def _fin(x) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


# ----------------------------------------------------------------------------- scenes (code)
def habit_scene(insights: dict) -> dict:
    flags = insights.get("flags") or []
    feats = insights.get("features") or {}

    def fv(key: str) -> float:
        v = feats.get(key, {}).get("value") if isinstance(feats.get(key), dict) else None
        return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else 0.0

    chosen = next((f for f in flags if f["key"] in HABIT_KIND), None)
    if not chosen:
        return {"id": "habit", "type": "habit", "title": "Nothing unusual in the record",
                "narration": "Your inflow, spending and balance all sit in the typical range for this bank. Nothing here is working against you.",
                "params": {"flag": "none", "label": "No notable pattern", "kind": "none", "evidence": "", "numbers": {}}}
    kind = HABIT_KIND[chosen["key"]]
    numbers: dict[str, float] = {}
    if kind == "timing":
        numbers = {"neg_months": round(fv("neg_months_share") * max(1.0, insights.get("months", 0) or 0), 0), "timing_share": fv("timing_dip_share")}
    elif kind == "fee":
        numbers = {"fee_share": fv("fee_share")}
    elif kind == "creep":
        numbers = {"spending_drift_pm": fv("spending_drift_pm"), "income_drift_pm": fv("income_drift_pm"), "lifestyle_creep": fv("lifestyle_creep")}
    elif kind == "transfer":
        numbers = {"amount": fv("regular_transfer_out_amount")}
    elif kind == "margin":
        numbers = {"spending_ratio": fv("spending_ratio"), "I": fv("I"), "S": fv("S")}
    elif kind == "volatile":
        numbers = {"income_cv": fv("income_cv")}
    elif kind == "loan":
        numbers = {"loan_payment_share": fv("loan_payment_share")}
    narration = f"{chosen['insight'][0].upper()}{chosen['insight'][1:]}. In your numbers: {chosen['evidence']}."
    return {"id": "habit", "type": "habit", "title": chosen["label"], "narration": narration,
            "params": {"flag": chosen["key"], "label": chosen["label"], "kind": kind, "evidence": chosen["evidence"], "numbers": numbers}}


def runway_scene(plan: dict) -> dict:
    req = plan["request"]
    off = req["shock"]["official"]
    metrics = req["metrics"]
    duration = int(req["shock"]["duration_months"])
    runway = _fin(off.get("runway"))
    runs_out = None if runway is None or runway >= duration else round(runway, 1)
    verdict = req["shock"]["verdict"]
    verdict_text = verdict.get("verdict") or verdict.get("headline") or "" if isinstance(verdict, dict) else str(verdict)
    gap = float(off["monthly_gap"])
    if runs_out is not None:
        narration = (f"On {_pct(req['shock']['r'])} of your income you take in {_money(off['income_after'])} a month and spend {_money(off['spending_after'])}. "
                     f"That is {_money(gap)} short every month, and the {_money(off['buffer_left'])} cushion runs dry after {runs_out} months, before the {duration} are over.")
    elif gap <= 0:
        narration = (f"Even on {_pct(req['shock']['r'])} of your income, {_money(off['income_after'])} still covers {_money(off['spending_after'])} of spending. "
                     f"There is no monthly shortfall, so the cushion is not touched.")
    else:
        narration = (f"On {_pct(req['shock']['r'])} of your income you are {_money(gap)} short each month, "
                     f"but the {_money(off['buffer_left'])} cushion carries you through all {duration} months with room to spare.")
    return {"id": "runway", "type": "runway", "title": "What the shock does to your cushion", "narration": narration,
            "params": {"duration_months": duration, "buffer_start": float(off["buffer_left"]), "income_before": float(metrics["I"]),
                       "income_after": float(off["income_after"]), "spending_after": float(off["spending_after"]), "monthly_gap": gap,
                       "runs_out_month": runs_out, "runway_label": str(off["runway_label"]), "verdict": verdict_text}}


def _future(c: dict | None) -> dict | None:
    if not c:
        return None
    return {"label": c["label"], "prob_shortfall": float(c["prob_shortfall_under_stress"]), "buffer_path": [float(x) for x in c["buffer_median_path"]],
            "months_to_goal": _fin(c.get("months_to_goal_deterministic"))}


def two_futures_scene(plan: dict) -> dict | None:
    ranked = plan.get("ranked") or []
    if not ranked:
        return None
    best = ranked[0]
    stay = plan.get("stay_the_course") or ranked[-1]
    goal = plan["request"]["goal"]
    s, p = _future(stay), _future(best)
    p["levers"] = best["levers"]
    delta = (s["prob_shortfall"] - p["prob_shortfall"]) if s else 0.0
    if best is stay or best["label"] == stay["label"]:
        narration = f"Staying the course is already the best of the plans we tested: a {_pct(p['prob_shortfall'])} chance of running dry under this shock."
    else:
        narration = (f"Two futures. If nothing changes, there is a {_pct(s['prob_shortfall'])} chance you run dry under this shock. "
                     f"With '{best['label']}' it falls to {_pct(p['prob_shortfall'])}"
                     + (f", and the {goal['label']} arrives around month {p['months_to_goal']:.0f}." if p.get("months_to_goal") else "."))
    return {"id": "two_futures", "type": "two_futures", "title": "Two futures", "narration": narration,
            "params": {"goal": {"label": goal["label"], "target_amount": float(goal["target_amount"]), "target_months": int(goal["target_months"])},
                       "stay": s, "plan": p, "delta_prob": delta}}


def lever_scene(plan: dict) -> dict | None:
    ranked = plan.get("ranked") or []
    stay = plan.get("stay_the_course")
    if not ranked or not stay:
        return None
    best = ranked[0]
    if best["label"] == stay["label"]:
        return None
    levers = best["levers"]
    parts = []
    if levers["freed_up_per_month"]:
        parts.append(f"free up {_money(levers['freed_up_per_month'])} a month")
    if levers["extra_income_per_month"]:
        parts.append(f"add {_money(levers['extra_income_per_month'])} of income")
    if levers["goal_contribution_per_month"]:
        parts.append(f"move {_money(levers['goal_contribution_per_month'])} into the goal fund")
    if levers["emergency_floor"]:
        parts.append(f"keep a {_money(levers['emergency_floor'])} floor")
    narration = (f"The lever: {', '.join(parts) if parts else best['label']}. The chance of running dry goes from {_pct(stay['prob_shortfall_under_stress'])} "
                 f"to {_pct(best['prob_shortfall_under_stress'])}, and the lowest the cushion typically gets moves from {_money(stay['median_min_buffer'])} to {_money(best['median_min_buffer'])}.")
    if best.get("flags"):
        f = best["flags"][0]
        narration += f" The Challenger notes: {f.get('risk', '')}."
    return {"id": "lever", "type": "lever", "title": best["label"], "narration": narration,
            "params": {"lever_label": best["label"], "dial": levers,
                       "before": {"prob_shortfall": float(stay["prob_shortfall_under_stress"]), "median_min_buffer": float(stay["median_min_buffer"])},
                       "after": {"prob_shortfall": float(best["prob_shortfall_under_stress"]), "median_min_buffer": float(best["median_min_buffer"])},
                       "typical_spending": float(plan["request"]["metrics"]["S"])}}


def build_scenes(insights: dict | None, plan: dict | None) -> list[dict]:
    scenes: list[dict] = []
    if insights:
        scenes.append(habit_scene(insights))
    if plan:
        scenes.append(runway_scene(plan))
        tf = two_futures_scene(plan)
        if tf:
            scenes.append(tf)
        lv = lever_scene(plan)
        if lv:
            scenes.append(lv)
    return scenes


# ----------------------------------------------------------------------------- narration (ADK, optional)
class SceneLine(BaseModel):
    id: str
    narration: str = Field(description="One or two spoken sentences, second person, under 220 characters")


class Script(BaseModel):
    scenes: list[SceneLine]


EXPLAINER_INSTRUCTION = """You are PULP's Explainer, the voice that talks a bank customer through a few animated scenes.
You receive the scenes as JSON: each has an id, a title, the numbers it will draw (params) and a draft narration written by
code. Rewrite each narration so it sounds like one calm person speaking: second person, plain words, one or two sentences,
under 220 characters, warm but never salesy. At most one number per sentence, and only numbers that already appear in that
scene's draft or params, formatted the same way. Say what the person could decide, not what the metric did. Keep every scene
id and return them all. Do not add advice the draft does not contain."""


def narrate(scenes: list[dict], use_ai: bool = True) -> tuple[list[dict], str]:
    if not scenes or not (use_ai and adk_available()):
        return scenes, "template"
    agent = LlmAgent(name="explainer", model=config.GEMINI_MODEL, description="Rewrites scene narration in a spoken voice.",
                     instruction=EXPLAINER_INSTRUCTION, output_schema=Script, output_key="explainer")
    try:
        res = run_agent(agent, json.dumps({"scenes": scenes}, default=float), user_id="explainer")
        script = Script.model_validate(agent_output(res, "explainer"))
    except Exception:
        return scenes, "template"
    lines = {l.id: l.narration.strip() for l in script.scenes if 10 <= len(l.narration.strip()) <= 260}
    out = []
    for sc in scenes:
        sc = dict(sc)
        if sc["id"] in lines:
            sc["narration"] = lines[sc["id"]]
            sc["narration_source"] = "explainer"
        else:
            sc["narration_source"] = "template"
        out.append(sc)
    return out, f"google-adk/{config.GEMINI_MODEL}"
