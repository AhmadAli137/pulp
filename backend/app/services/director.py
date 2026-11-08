"""Director: the agent that owns the stage. For every user turn it decides what to SHOW.

Deterministic storyboards exist for the two moments that must never fail in a demo (the opening, and a twist card),
and a Director LlmAgent (Gemini on ADK) handles free-text turns with tools over the engine. In every case the beats'
numbers (params) are attached by code from tool results; the model chooses visuals and writes captions only, and
every number that appears in a caption must also appear in that beat's params or the caption is replaced.

Visual vocabulary the stage can draw: picture, cup, river, timeline, fork, calendar, dial, crowd, ribbon, cards,
shuffle, swarm, podium, math, none.
"""
from __future__ import annotations

import concurrent.futures
import json
import random
import re
import time
from typing import Any, AsyncIterator

from .. import config
from . import context_manager as cm
from .adk_runtime import LlmAgent, adk_available, json_block, run_agent_events_async
from .archetypes import archetype_for, get_archetypes
from .cohort_analysis import cohort_for
from .council import run_council
from .explainer import lever_scene, two_futures_scene
from .features import flags_for, get_features
from .financial_profiles import get_metrics
from .narrator import narrative_for
from .tangerine_metrics import compute_shock, horizon_verdict

# ----------------------------------------------------------------------------- the shock deck (Canadian, realistic)
# Sources: EI regular benefits replace 55% of insurable earnings (canada.ca); CMHC rent growth; StatCan CPI shelter;
# repair costs are typical ranges, deliberately conservative. one_off_months means a multiple of typical spending S.
SHOCK_DECK: list[dict] = [
    {"key": "layoff", "title": "Laid off", "text": "You lose your job. EI pays 55% of your usual income for 6 months.", "r": 0.55, "h": 0.0, "one_off": 0.0, "duration": 6},
    {"key": "furnace", "title": "The furnace dies", "text": "The furnace dies in January. The repair costs a full month of your typical spending.", "r": 1.0, "h": 0.0, "one_off_months": 1.0, "duration": 6},
    {"key": "combined", "title": "Layoff and rent", "text": "You lose your job (EI at 55%) and your household bills go up 15% in the same month.", "r": 0.55, "h": 0.15, "one_off": 0.0, "duration": 6},
    {"key": "hours_cut", "title": "Hours cut", "text": "Your employer cuts you to 70% of your hours for 4 months.", "r": 0.70, "h": 0.0, "one_off": 0.0, "duration": 4},
    {"key": "rent_up", "title": "Rent renewal", "text": "Your lease renews and rent plus utilities go up 15%.", "r": 1.0, "h": 0.15, "one_off": 0.0, "duration": 12},
    {"key": "bills_inflation", "title": "Bills creep up", "text": "Energy and shelter costs rise 8% over the year.", "r": 1.0, "h": 0.08, "one_off": 0.0, "duration": 12},
    {"key": "car_repair", "title": "Car repair", "text": "The transmission goes. The shop wants $1,800 this week.", "r": 1.0, "h": 0.0, "one_off": 1800.0, "duration": 6},
    {"key": "dental", "title": "Dental bill", "text": "A root canal and crown, $900 not covered by the plan.", "r": 1.0, "h": 0.0, "one_off": 900.0, "duration": 6},
    {"key": "vet", "title": "Vet emergency", "text": "The dog needs surgery. $1,200, today.", "r": 1.0, "h": 0.0, "one_off": 1200.0, "duration": 6},
    {"key": "sick_leave", "title": "Sick leave", "text": "You are off work for 4 months on EI sickness benefits at 55%.", "r": 0.55, "h": 0.0, "one_off": 0.0, "duration": 4},
    {"key": "parental", "title": "Parental leave", "text": "A new baby. Parental benefits pay 55% for 12 months, and bills go up 10%.", "r": 0.55, "h": 0.10, "one_off": 0.0, "duration": 12},
    {"key": "moving", "title": "Forced move", "text": "The landlord sells. First and last month at a new place, and rent is 15% higher.", "r": 1.0, "h": 0.15, "one_off_months": 0.5, "duration": 12},
]
DECK_BY_KEY = {c["key"]: c for c in SHOCK_DECK}


def deal_card(key: str = "random", seed: int | None = None) -> dict:
    if key in DECK_BY_KEY:
        return dict(DECK_BY_KEY[key])
    rng = random.Random(seed if seed is not None else time.time_ns())
    return dict(rng.choice(SHOCK_DECK))


def card_shock(card: dict, S: float) -> dict:
    one_off = float(card.get("one_off", 0.0) or 0.0)
    if card.get("one_off_months"):
        one_off = float(card["one_off_months"]) * S
    return {"r": float(card["r"]), "h": float(card["h"]), "one_off": one_off, "duration": int(card["duration"])}


# ----------------------------------------------------------------------------- param mappers (code)
def _m(x: float) -> str:
    return f"${x:,.0f}"


def picture_params(m, headline: str | None = None) -> dict:
    S = m.typical_spending
    return {"inflow": m.typical_inflow, "outflow": S, "buffer": m.buffer, "months_of_spending": (m.buffer / S) if S > 0 else 0.0,
            "runway_label": m.baseline_runway_label, "headline": headline}


def river_params(m, row) -> dict:
    parts_in = {"cash deposits": float(row.cash_deposit_share), "transfers in": float(row.transfer_in_share), "pension": float(row.pension_share)}
    parts_in["interest"] = max(0.0, 1.0 - sum(parts_in.values()))
    parts_out = {"household bills": float(row.bills_share), "insurance": float(row.insurance_share), "loan": float(row.loan_share),
                 "fees": float(row.fee_share), "cash out": float(row.cash_wd_share), "card": float(row.card_wd_share), "transfers out": float(row.transfer_out_share)}
    return {"inflow": m.typical_inflow, "outflow": m.typical_spending, "surplus": m.typical_inflow - m.typical_spending,
            "parts_in": parts_in, "parts_out": parts_out}


def crowd_params(account_id: int, row) -> dict:
    arch = archetype_for(account_id) or {}
    rl = float(row.runway_layoff)
    return {"n_total": int(get_archetypes().get("n_accounts", 4500)),
            "archetype": {"name": arch.get("name", "your group"), "size": int(arch.get("size", 0)), "share": float(arch.get("share", 0.0)),
                          "survive6_layoff_pct": float(arch.get("survive6_layoff_pct", 0.0))},
            "you": {"survives6_layoff": bool(row.survives6_layoff), "runway_layoff": None if rl == float("inf") else round(rl, 1)}}


def timeline_params(m, shock: dict, card: dict | None) -> dict:
    off = compute_shock(m.typical_inflow, m.typical_spending, m.household_bills, m.buffer, r=shock["r"], h=shock["h"], one_off=shock["one_off"])
    verdict = horizon_verdict(off, shock["duration"])
    rw = off["runway"]
    runs_out = None if rw is None or rw >= shock["duration"] else round(float(rw), 1)
    events = [{"month": 0, "label": (card or {}).get("title", "the shock lands")}]
    if shock["r"] < 1.0:
        events.append({"month": 0, "label": f"income at {shock['r']:.0%}"})
    if shock["h"]:
        events.append({"month": 0, "label": f"bills +{shock['h']:.0%}"})
    if shock["one_off"]:
        events.append({"month": 0, "label": f"one-off {_m(shock['one_off'])}"})
    if runs_out is not None:
        events.append({"month": runs_out, "label": "cushion empty"})
    else:
        events.append({"month": shock["duration"], "label": "still standing"})
    vtext = verdict.get("verdict") or verdict.get("headline") or "" if isinstance(verdict, dict) else str(verdict)
    return {"duration_months": shock["duration"], "income_before": m.typical_inflow, "income_after": off["income_after"], "spending_after": off["spending_after"],
            "monthly_gap": off["monthly_gap"], "buffer_start": off["buffer_left"], "runs_out_month": runs_out, "runway_label": off["runway_label"],
            "verdict": vtext, "events": events, "official": {k: off[k] for k in ("income_after", "spending_after", "buffer_left", "monthly_gap", "runway_label")}}


def _downsample(path: list[float], n: int = 25) -> list[float]:
    if len(path) <= n:
        return [float(x) for x in path]
    step = (len(path) - 1) / (n - 1)
    return [float(path[round(i * step)]) for i in range(n)]


def swarm_params(plan: dict) -> dict:
    cands = plan.get("ranked") or []
    best = cands[0]["label"] if cands else None
    return {"horizon_months": plan["request"]["horizon_months"], "grid_size": plan.get("grid_size", 0),
            "candidates": [{"label": c["label"], "source": c["source"], "score": round(c["adjusted_score"], 3), "prob_shortfall": round(c["prob_shortfall_under_stress"], 3),
                            "buffer_path": _downsample(c["buffer_median_path"]), "best": c["label"] == best, "flags": len(c["flags"])} for c in cands],
            "objective": plan["objective"]["formula"], "weights": plan["objective"]["weights"]}


def podium_params(plan: dict) -> dict:
    top = (plan.get("ranked") or [])[:3]
    return {"top": [{"rank": i + 1, "label": c["label"], "source": c["source"], "score": round(c["adjusted_score"], 2),
                     "prob_shortfall": round(c["prob_shortfall_under_stress"], 3), "goal_progress": round(c["goal_progress_at_deadline"], 3),
                     "levers": c["levers"], "flags": c["flags"][:2], "why": c.get("why", "")} for i, c in enumerate(top)],
            "objective": plan["objective"]["formula"], "weights": plan["objective"]["weights"], "stay": _stay(plan)}


def _stay(plan: dict) -> dict | None:
    s = plan.get("stay_the_course")
    return None if not s else {"label": s["label"], "prob_shortfall": round(s["prob_shortfall_under_stress"], 3), "score": round(s["adjusted_score"], 2)}


def math_params(m, shock: dict) -> dict:
    off = compute_shock(m.typical_inflow, m.typical_spending, m.household_bills, m.buffer, r=shock["r"], h=shock["h"], one_off=shock["one_off"])
    lines = [f"income after = {shock['r']:.2f} × I = {shock['r']:.2f} × {_m(m.typical_inflow)} = {_m(off['income_after'])}",
             f"spending after = S + {shock['h']:.2f} × H = {_m(m.typical_spending)} + {shock['h']:.2f} × {_m(m.household_bills)} = {_m(off['spending_after'])}",
             f"buffer left = B − C = {_m(m.buffer)} − {_m(shock['one_off'])} = {_m(off['buffer_left'])}",
             f"gap = spending after − income after = {_m(off['monthly_gap'])} per month",
             (f"runway = buffer left ÷ gap = {off['runway_label']} months" if off["monthly_gap"] > 0 else "gap ≤ 0 → no shortfall (120+)")]
    return {"lines": lines}


def cards_params() -> dict:
    return {"cards": [{"key": c["key"], "title": c["title"], "text": c["text"]} for c in SHOCK_DECK[:3]] + [{"key": "random", "title": "Shuffle", "text": "Deal a random but realistic shock from the deck."}]}


def shuffle_params(card: dict) -> dict:
    return {"deck": [c["title"] for c in SHOCK_DECK], "dealt": {"key": card["key"], "title": card["title"], "text": card["text"]}}


def calendar_params(row) -> dict:
    return {"neg_months": int(round(float(row.neg_months_share) * float(row.months))), "timing_share": float(row.timing_dip_share), "months": int(row.months)}


def ribbon_params(m, row) -> dict:
    return {"months": int(min(24, row.months)), "spending_drift_pm": float(row.spending_drift_pm), "income_drift_pm": float(row.income_drift_pm),
            "inflow": m.typical_inflow, "outflow": m.typical_spending}


# ----------------------------------------------------------------------------- storyboards (code)
def _beat(id_: str, visual: str, caption: str, params: dict, duration: float = 8.0, emphasis: str | None = None) -> dict:
    b = {"id": id_, "visual": visual, "caption": caption, "duration_s": duration, "params": params}
    if emphasis:
        b["emphasis"] = emphasis
    return b


def opening_storyboard(account_id: int, m, insights: dict) -> list[dict]:
    f = get_features()
    row = f.loc[account_id]
    nar = insights["narrative"]
    flags = insights["flags"]
    beats = [_beat("open", "picture", nar["headline"], picture_params(m, nar["headline"]), 7)]
    sentences = [i for i in nar["insights"] if i["flag"] not in ("archetype", "none")]
    keys = {fl["key"]: fl for fl in flags}
    used = 0
    for s in sentences[:3]:
        k = s["flag"]
        if k == "timing_dips":
            beats.append(_beat(f"b{used}", "calendar", s["text"], calendar_params(row)))
        elif k == "lifestyle_creep" or k == "rent_pressure":
            beats.append(_beat(f"b{used}", "ribbon", s["text"], ribbon_params(m, row)))
        elif k in ("thin_margin", "savings_elsewhere", "cash_economy", "pension_dependent", "income_volatile"):
            beats.append(_beat(f"b{used}", "river", s["text"], river_params(m, row)))
        elif k in ("fragile_but_clean", "deep_buffer", "balance_sliding", "loan_stress"):
            beats.append(_beat(f"b{used}", "cup", s["text"], {"buffer": m.buffer, "outflow": m.typical_spending,
                                                              "months_of_spending": (m.buffer / m.typical_spending) if m.typical_spending > 0 else 0.0,
                                                              "label": keys.get(k, {}).get("label", "")}))
        else:
            beats.append(_beat(f"b{used}", "none", s["text"], {}))
        used += 1
    arch = archetype_for(account_id)
    if arch:
        beats.append(_beat("crowd", "crowd", f"Among {get_archetypes().get('n_accounts', 4500):,} accounts you sit with the '{arch['name']}' group, "
                           f"{arch['share']:.0%} of them, of whom {arch['survive6_layoff_pct']:.0f}% would last six months on 55% income.", crowd_params(account_id, row), 9))
    beats.append(_beat("ask", "none", "Tell me what life is throwing your way, or draw a twist card and we will see how you hold up.", {}, 5))
    return beats


def twist_storyboard(account_id: int, m, card: dict, plan: dict, *, dealt_randomly: bool) -> list[dict]:
    shock = card_shock(card, m.typical_spending)
    tl = timeline_params(m, shock, card)
    beats = []
    if dealt_randomly:
        beats.append(_beat("shuffle", "shuffle", f"The deck shuffles and deals: {card['title']}. {card['text']}", shuffle_params(card), 7))
    else:
        beats.append(_beat("card", "cards", f"{card['title']}. {card['text']}", {"cards": [{"key": card["key"], "title": card["title"], "text": card["text"]}]}, 5))
    off = tl["official"]
    if tl["runs_out_month"] is not None:
        cap = (f"Month by month: {_m(off['income_after'])} comes in, {_m(off['spending_after'])} goes out, {_m(off['monthly_gap'])} short each month. "
               f"The {_m(off['buffer_left'])} cushion is empty after {tl['runs_out_month']} of {shock['duration']} months.")
    elif off["monthly_gap"] <= 0:
        cap = f"Even now {_m(off['income_after'])} covers {_m(off['spending_after'])} of spending. No monthly shortfall, the cushion is untouched."
    else:
        cap = f"{_m(off['monthly_gap'])} short each month, but the {_m(off['buffer_left'])} cushion carries you through all {shock['duration']} months."
    beats.append(_beat("timeline", "timeline", cap, tl, 10, emphasis="runs_out" if tl["runs_out_month"] is not None else None))
    sw = swarm_params(plan)
    beats.append(_beat("swarm", "swarm", f"I tried {len(sw['candidates'])} ways through this: {plan['grid_size']} from the grid and "
                       f"{len(sw['candidates']) - plan['grid_size']} the Strategist invented from your context. Each one is scored on staying solvent, reaching your goal, and how much it disrupts your life.", sw, 10))
    pod = podium_params(plan)
    if pod["top"]:
        t = pod["top"][0]
        beats.append(_beat("podium", "podium", f"Top of the board: '{t['label']}', a {t['prob_shortfall']:.0%} chance of running dry"
                           + (f" versus {pod['stay']['prob_shortfall']:.0%} if nothing changes" if pod["stay"] else "") + ".", pod, 9))
    lv = lever_scene(plan)
    if lv:
        beats.append(_beat("dial", "dial", lv["narration"], lv["params"], 9))
    tf = two_futures_scene(plan)
    if tf:
        beats.append(_beat("fork", "fork", tf["narration"], tf["params"], 10))
    beats.append(_beat("math", "math", "And the arithmetic behind the runway, the same formula the judges use.", math_params(m, shock), 8))
    beats.append(_beat("ask2", "none", "Push back on any of this. Tell me what you could or could not do, and I will rerun it.", {}, 5))
    return beats


# ----------------------------------------------------------------------------- caption safety
_NUM = re.compile(r"\$?\d[\d,]*(?:\.\d+)?%?")


def _numbers_in(text: str) -> set[str]:
    return {t.replace(",", "").rstrip("%").lstrip("$") for t in _NUM.findall(text)}


def _params_numbers(obj: Any, acc: set[str]) -> set[str]:
    if isinstance(obj, bool):
        return acc
    if isinstance(obj, (int, float)):
        for s in (f"{obj:,.0f}", f"{obj:.0f}", f"{obj:.1f}", f"{obj:.2f}", f"{obj * 100:.0f}", f"{obj:.3f}"):
            acc.add(s.replace(",", ""))
    elif isinstance(obj, dict):
        for v in obj.values():
            _params_numbers(v, acc)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _params_numbers(v, acc)
    elif isinstance(obj, str):
        acc |= _numbers_in(obj)
    return acc


def caption_is_grounded(caption: str, params: dict, extra_text: str = "") -> bool:
    allowed = _params_numbers(params, set()) | _numbers_in(extra_text)
    for n in _numbers_in(caption):
        if n and n not in allowed and n.rstrip("0").rstrip(".") not in allowed:
            return False
    return True


# ----------------------------------------------------------------------------- the Director agent (free-text turns)
DIRECTOR_INSTRUCTION = """You are PULP's Director. You decide what the stage SHOWS for one bank customer's turn, and you write what Pip SAYS.
You get the customer's message, their confirmed context, and tools over the engine. Call the tools you need (never guess
numbers), then reply with ONLY a JSON object:
{"beats": [{"visual": one of {visuals}, "source": the tool name whose latest result this visual should draw, or null,
            "caption": one or two spoken sentences, second person, under 220 characters}]}
Rules: 2 to 5 beats and at most 3 tool calls (get_profile is cheap; run_council is fast by default, pass with_agents=true only
when the person asks what they should do). Every number in a caption must come from a tool result. Prefer showing over telling: a cup for the buffer,
a river for where money comes from and goes, a timeline for a shock, a swarm for the scenarios tried, a podium for the
ranked strategies, a dial for one lever, a fork for two futures, a crowd for how they compare to 4,500 others, a calendar
for timing habits, a ribbon for drift, math only if they ask for the formula, none when Pip should just talk or ask one
question. If the person describes a life event with money consequences, call deal_or_set_shock with the numbers you can
justify from their words and then run_council on it. Never claim anything has been saved or applied."""

VISUALS = ["picture", "cup", "river", "timeline", "fork", "calendar", "dial", "crowd", "ribbon", "cards", "shuffle", "swarm", "podium", "math", "none"]


class _Tools:
    def __init__(self, account_id: int, m):
        self.account_id, self.m = account_id, m
        self.results: dict[str, Any] = {}
        self.shock: dict | None = None
        self.card: dict | None = None
        self.plan: dict | None = None

    def get_profile(self) -> dict:
        """Official numbers (I, S, H, B, runway), the account's flags with evidence, and its archetype."""
        ins = narrative_for(self.account_id, use_ai=False)
        out = {"I": self.m.typical_inflow, "S": self.m.typical_spending, "H": self.m.household_bills, "B": self.m.buffer,
               "baseline_runway": self.m.baseline_runway_label, "flags": [{k: f[k] for k in ("key", "label", "evidence")} for f in ins["flags"]],
               "archetype": ins["archetype"], "headline": ins["narrative"]["headline"]}
        self.results["get_profile"] = out
        return out

    def get_cohort(self) -> dict:
        """How this account compares with peers of similar inflow (survival rates, medians)."""
        co = cohort_for(self.account_id)
        out = {k: co.get(k) for k in ("n_peers", "me", "peers")}
        self.results["get_cohort"] = out
        return out

    def deal_or_set_shock(self, card_key: str = "custom", income_fraction: float = 1.0, bills_increase: float = 0.0,
                          one_off_cost: float = 0.0, duration_months: int = 6) -> dict:
        """Set the shock to study. card_key: a deck card (layoff, furnace, combined, hours_cut, rent_up, bills_inflation, car_repair, dental, vet, sick_leave, parental, moving, random) or 'custom' with explicit numbers: income_fraction (0.55 = 55% of income kept), bills_increase (0.15 = bills up 15%; a dollar amount per month is also accepted), one_off_cost in dollars, duration_months. Returns the official shock result."""
        if card_key != "custom":
            self.card = deal_card(card_key)
            self.shock = card_shock(self.card, self.m.typical_spending)
        else:
            r, h, note = float(income_fraction), float(bills_increase), None
            if r > 5:          # dollars of income per month instead of a fraction
                r = max(0.0, r / self.m.typical_inflow) if self.m.typical_inflow > 0 else 1.0
                note = f"income given in dollars, read as {r:.2f} of typical inflow"
            if h > 3:          # dollars of extra bills per month instead of a fraction of H
                if self.m.household_bills > 0:
                    note = f"bills increase of ${h:,.0f}/month read as {h / self.m.household_bills:.2f} of household bills"
                    h = h / self.m.household_bills
                else:          # no labelled bills: the same monthly drain is modelled as lower income
                    note = f"this account has no labelled household bills; ${h:,.0f}/month more cost modelled as income reduced by that amount"
                    r = max(0.0, r - h / self.m.typical_inflow) if self.m.typical_inflow > 0 else r
                    h = 0.0
            self.card = {"key": "custom", "title": "Your scenario", "text": "The scenario you described." + (f" ({note})" if note else "")}
            self.shock = {"r": r, "h": h, "one_off": float(one_off_cost), "duration": int(duration_months)}
        out = timeline_params(self.m, self.shock, self.card)
        if self.card.get("key") == "custom" and "(" in self.card["text"]:
            out["note"] = self.card["text"]
        self.results["deal_or_set_shock"] = out
        return {k: out[k] for k in ("duration_months", "income_after", "spending_after", "monthly_gap", "buffer_start", "runs_out_month", "runway_label", "verdict")}

    def run_council(self, with_agents: bool = False) -> dict:
        """Score strategies for the current shock (set it first). Fast grid in about a second; with_agents=True also runs the
        Strategist and Challenger (about 15 seconds), only when the person asks what they should do."""
        if not self.shock:
            return {"error": "set a shock first with deal_or_set_shock"}
        sh = self.shock
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:   # own thread: the council runs its own event loop
            self.plan = ex.submit(run_council, self.account_id, self.m, r=sh["r"], h=sh["h"], one_off=sh["one_off"], duration=sh["duration"],
                                  use_ai=bool(with_agents)).result()
        self.results["run_council"] = self.plan
        return {"recommended": self.plan["recommended"], "why": self.plan["why"], "grid_size": self.plan["grid_size"],
                "top": [{"label": c["label"], "prob_shortfall": round(c["prob_shortfall_under_stress"], 3), "score": round(c["adjusted_score"], 2)} for c in self.plan["ranked"][:3]],
                "stay": _stay(self.plan)}

    def show_math(self) -> dict:
        """The sponsor runway formula lines for the current shock."""
        if not self.shock:
            return {"error": "set a shock first"}
        out = math_params(self.m, self.shock)
        self.results["show_math"] = out
        return out

    def template_caption(self, visual: str) -> str | None:
        """A grounded line for a visual, used when the model's caption fails the number check."""
        m = self.m
        if visual == "timeline" and self.shock:
            tl = self.results.get("deal_or_set_shock") or timeline_params(m, self.shock, self.card)
            off = tl["official"]
            if tl["runs_out_month"] is not None:
                return f"{_m(off['income_after'])} in, {_m(off['spending_after'])} out, {_m(off['monthly_gap'])} short a month: the cushion is empty after {tl['runs_out_month']} of {tl['duration_months']} months."
            return f"{_m(off['income_after'])} in against {_m(off['spending_after'])} out: the cushion holds for all {tl['duration_months']} months."
        if visual == "fork" and self.plan:
            tf = two_futures_scene(self.plan)
            return tf["narration"] if tf else None
        if visual == "dial" and self.plan:
            lv = lever_scene(self.plan)
            return lv["narration"] if lv else None
        if visual == "podium" and self.plan:
            pod = podium_params(self.plan)
            if pod["top"]:
                t = pod["top"][0]
                return f"Top of the board: '{t['label']}', a {t['prob_shortfall']:.0%} chance of running dry" + (f" versus {pod['stay']['prob_shortfall']:.0%} if nothing changes." if pod["stay"] else ".")
        if visual == "swarm" and self.plan:
            return f"I scored {len(self.plan.get('ranked') or [])} ways through this on staying solvent, reaching your goal and how much each disrupts your life."
        if visual == "cup":
            return f"Your cushion is {_m(m.buffer)}, about {(m.buffer / m.typical_spending) if m.typical_spending else 0:.1f} months of typical spending."
        if visual == "river":
            return f"{_m(m.typical_inflow)} comes in a typical month and {_m(m.typical_spending)} goes out."
        if visual == "crowd":
            arch = archetype_for(self.account_id) or {}
            return f"You sit with the '{arch.get('name', 'your')}' group, {arch.get('share', 0):.0%} of accounts, of whom {arch.get('survive6_layoff_pct', 0):.0f}% would last six months on 55% income." if arch else None
        return None

    # mapping (visual, source) -> params, in code
    def params_for(self, visual: str, source: str | None) -> dict | None:
        f = get_features()
        row = f.loc[self.account_id]
        m = self.m
        if visual == "picture":
            return picture_params(m, (self.results.get("get_profile") or {}).get("headline"))
        if visual == "cup":
            return {"buffer": m.buffer, "outflow": m.typical_spending, "months_of_spending": (m.buffer / m.typical_spending) if m.typical_spending > 0 else 0.0, "label": "cash buffer"}
        if visual == "river":
            return river_params(m, row)
        if visual == "crowd":
            return crowd_params(self.account_id, row)
        if visual == "calendar":
            return calendar_params(row)
        if visual == "ribbon":
            return ribbon_params(m, row)
        if visual == "cards":
            return cards_params()
        if visual == "shuffle":
            return shuffle_params(self.card) if self.card else None
        if visual == "timeline":
            return self.results.get("deal_or_set_shock")
        if visual == "math":
            return math_params(m, self.shock) if self.shock else None
        if visual in ("swarm", "podium", "dial", "fork"):
            if not self.plan:
                return None
            if visual == "swarm":
                return swarm_params(self.plan)
            if visual == "podium":
                return podium_params(self.plan)
            if visual == "dial":
                lv = lever_scene(self.plan)
                return lv["params"] if lv else None
            tf = two_futures_scene(self.plan)
            return tf["params"] if tf else None
        return {}


def _fallback_beats(tools: _Tools, message: str) -> list[dict]:
    """When the model gives nothing usable: show what the tools produced, in a sensible order."""
    beats = []
    if tools.plan and tools.card:
        return twist_storyboard(tools.account_id, tools.m, tools.card, tools.plan, dealt_randomly=tools.card.get("key") == "random")
    if tools.shock:
        beats.append(_beat("tl", "timeline", "Here is what that does to your cushion, month by month.", tools.results["deal_or_set_shock"], 10))
    if not beats:
        beats.append(_beat("talk", "none", "I did not catch a money question in that. Tell me about a goal, a worry, or draw a twist card.", {}, 5))
    return beats


async def stage_stream(account_id: int, message: str, *, use_ai: bool = True) -> AsyncIterator[tuple[str, dict]]:
    """Yields ("agent", ev), ("memory", ...), ("storyboard", {...}) for one stage turn."""
    from starlette.concurrency import run_in_threadpool

    t0 = time.perf_counter()
    m = get_metrics(account_id)
    msg = (message or "").strip()
    tools = _Tools(account_id, m)

    # 1. opening
    if msg == "__intro__":
        insights = await run_in_threadpool(narrative_for, account_id, use_ai)
        beats = opening_storyboard(account_id, m, insights)
        yield "storyboard", {"opening": True, "source": insights["narrative"]["source"], "beats": beats}
        return

    # 2. twist cards (deterministic: must never fail in the demo)
    if msg.startswith("twist:"):
        key = msg.split(":", 1)[1].strip() or "random"
        if key == "cards":
            yield "storyboard", {"opening": False, "source": "deck", "beats": [_beat("cards", "cards", "Pick a card, or let the deck choose.", cards_params(), 6)]}
            return
        card = deal_card(key)
        shock = card_shock(card, m.typical_spending)
        yield "agent", {"t": 0.0, "agent": "director", "kind": "tool_call", "tool": "deal_or_set_shock", "args": {"card": card["key"]}}
        plan_holder: dict = {}

        async def council():
            # stream the council's own agent events while it runs
            from .council import run_council_stream
            async for et, data in run_council_stream(account_id, m, r=shock["r"], h=shock["h"], one_off=shock["one_off"], duration=shock["duration"], use_ai=use_ai):
                if et == "plan":
                    plan_holder["plan"] = data
                elif et == "agent":
                    yield data
                elif et == "stage":
                    yield {"t": data["seconds"], "agent": "engine", "kind": "text", "summary": data["detail"]}

        async for ev in council():
            yield "agent", ev
        plan = plan_holder.get("plan")
        if not plan:
            yield "error", {"message": "council did not return a plan"}
            return
        beats = twist_storyboard(account_id, m, card, plan, dealt_randomly=(key == "random"))
        cm.record_turn(account_id, "user", f"Twist card: {card['title']}", {"shock": shock})
        yield "storyboard", {"opening": False, "source": "deck+council", "beats": beats, "card": card}
        return

    # 3. free text: memory (offline extraction, instant) + the Director agent with tools
    try:
        from .gemini_agent import chat as companion_chat
        mem = await run_in_threadpool(companion_chat, account_id, msg, True)
        yield "memory", {"proposal": mem.get("proposal"), "context": mem.get("context"), "next_question": mem.get("next_question"), "reply": mem.get("reply")}
    except Exception as exc:  # memory is optional for the stage
        mem = {"reply": None}
        yield "memory", {"proposal": None, "context": None, "next_question": None, "error": f"{type(exc).__name__}"[:80]}

    beats: list[dict] = []
    source = "template"
    if use_ai and adk_available():
        ctx_summary = cm.summarize(cm.load_context(account_id))
        payload = json.dumps({"message": msg, "confirmed_context": {k: ctx_summary.get(k, []) for k in ("goals", "concerns", "constraints", "preferences", "upcoming_events")},
                              "official": {"I": m.typical_inflow, "S": m.typical_spending, "B": m.buffer, "baseline_runway": m.baseline_runway_label}}, default=float)
        agent = LlmAgent(name="director", model=config.GEMINI_MODEL, description="Chooses what the stage shows and writes Pip's lines.",
                         instruction=DIRECTOR_INSTRUCTION.replace("{visuals}", ", ".join(VISUALS)),
                         tools=[tools.get_profile, tools.get_cohort, tools.deal_or_set_shock, tools.run_council, tools.show_math], output_key="director")
        result = None
        try:
            async for ev in run_agent_events_async(agent, payload, user_id=f"acct-{account_id}"):
                if ev["type"] == "agent":
                    yield "agent", {k: v for k, v in ev.items() if k != "type"}
                else:
                    result = ev
        except Exception as exc:
            yield "agent", {"t": round(time.perf_counter() - t0, 2), "agent": "director", "kind": "text", "summary": f"unavailable: {type(exc).__name__}"}
        parsed = None
        if result:
            parsed = json_block(result["state"].get("director")) or json_block("\n".join(result["texts"].get("director", [])))
        for i, b in enumerate((parsed or {}).get("beats") or []):
            if not isinstance(b, dict) or b.get("visual") not in VISUALS:
                continue
            params = tools.params_for(b["visual"], b.get("source"))
            if params is None:
                continue
            caption = str(b.get("caption") or "").strip()[:260]
            if not caption:
                continue
            if b["visual"] != "none" and not caption_is_grounded(caption, params, json.dumps(tools.results, default=float)):
                caption = tools.template_caption(b["visual"]) or "Here is how that looks in your numbers."
            beats.append(_beat(f"d{i}", b["visual"], caption, params, 9 if b["visual"] != "none" else 5))
        if beats:
            source = f"google-adk/{config.GEMINI_MODEL}"
    if not beats:
        beats = _fallback_beats(tools, msg)
        if mem.get("reply") and beats and beats[0]["visual"] == "none":
            beats[0]["caption"] = str(mem["reply"])[:260]
    cm.record_turn(account_id, "assistant", " ".join(b["caption"] for b in beats)[:1000], {"stage": [b["visual"] for b in beats]})
    yield "storyboard", {"opening": False, "source": source, "beats": beats, "seconds": round(time.perf_counter() - t0, 2)}
