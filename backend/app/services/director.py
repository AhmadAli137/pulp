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
import math
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
from .life_actions import life_actions
from .intake import (classify_reply, get_pending_twist, is_cold, pending_proposals, pick_question, restate,
                     set_pending_twist, wants_skip)
from .financial_profiles import get_metrics
from .narrator import narrative_for
from .tangerine_metrics import compute_shock, horizon_verdict

# ----------------------------------------------------------------------------- personas (what the backstage shows)
PERSONAS: list[dict] = [
    {"key": "companion", "name": "Companion", "kind": "memory", "runs_on": "offline extractor (Gemini when configured)",
     "role": "Listens to what you say and turns it into things PULP may remember: goals, worries, constraints. Nothing is saved until you confirm.",
     "reads": ["your message", "what you already confirmed"], "writes": ["a proposal you can confirm or reject"], "guardrail": "cannot write memory; only proposes"},
    {"key": "narrator", "name": "Profile Narrator", "kind": "ai", "runs_on": "Gemini on Google ADK",
     "role": "Reads the flags the engine raised on your account and writes the three or four sentences worth hearing.",
     "reads": ["official numbers", "flags with evidence", "archetype"], "writes": ["headline", "one sentence per flag"], "guardrail": "may only talk about the flags it was given; every sentence names its flag"},
    {"key": "director", "name": "Director", "kind": "ai", "runs_on": "Gemini on Google ADK",
     "role": "Decides what the stage shows for each turn and writes what Pulp says. Calls the engine when it needs numbers.",
     "reads": ["your message", "confirmed context", "engine tools"], "writes": ["beats: a visual, a source, a caption"], "guardrail": "numbers come from tools; captions are checked against the data behind each visual"},
    {"key": "engine", "name": "Engine", "kind": "code", "runs_on": "Python (pandas, numpy)",
     "role": "The sponsor formula, the Monte Carlo simulator and the lever grid. The only source of numbers.",
     "reads": ["monthly_summary.csv and the other files", "the shock", "levers"], "writes": ["frozen request", "scored candidates", "runway, shortfall probability"], "guardrail": "deterministic; tested against the judges' definitions"},
    {"key": "strategist", "name": "Strategist", "kind": "ai", "runs_on": "Gemini on Google ADK",
     "role": "Invents levers the grid cannot: pause a transfer you mentioned, a side income, deferring a goal. Asks the engine to score each.",
     "reads": ["frozen request", "best grid candidates", "confirmed context"], "writes": ["levers with a why"], "guardrail": "every lever is clamped and re-scored by code; its own numbers are ignored"},
    {"key": "challenger", "name": "Challenger", "kind": "ai", "runs_on": "Gemini on Google ADK",
     "role": "Asks whether you would actually do each plan, against what you said about your life.",
     "reads": ["frozen request", "candidates", "confirmed context"], "writes": ["flags with a severity", "questions the companion should ask next"], "guardrail": "cannot touch memory or scores; flags only demote"},
    {"key": "validator", "name": "Validator and Ranker", "kind": "code", "runs_on": "Python",
     "role": "Clamps every proposed lever into the admissible box, re-scores it, attaches flags and ranks all plans by one objective.",
     "reads": ["levers", "flags", "candidates"], "writes": ["ranked plans with the objective shown"], "guardrail": "deterministic; the objective is printed with every result"},
]

# ----------------------------------------------------------------------------- the shock deck (Canadian, realistic)
# Sources: EI regular, sickness and parental benefits replace 55% of insurable earnings (canada.ca). The rent, bills,
# repair, dental, vet and reduced-hours amounts are illustrative round figures, not values from a published table.
# one_off_months means a multiple of typical spending S.
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

# v2: stage, symbol and analogy for every agent, plus the Stage 1 pipeline and the three new agents.
_AGENT_META = {
    "companion": (2, "ear", "a note-taker"), "narrator": (1, "quill", "a storyteller"), "director": (2, "compass", "a show director"),
    "engine": (0, "gear", "a calculator"), "strategist": (3, "knight", "a chess player"), "challenger": (3, "shield", "a sceptic"),
    "validator": (3, "scales", "a referee"),
}
for _p in PERSONAS:
    _p["stage"], _p["symbol"], _p["analogy"] = _AGENT_META[_p["key"]]
PERSONAS[:0] = [
    {"key": "schema_scout", "name": "Schema Scout", "kind": "code", "runs_on": "Python", "stage": 1, "symbol": "map", "analogy": "a surveyor",
     "role": "Maps the bank's columns to roles (money in, money out, bills, balance) so the rest works on any bank's export.",
     "reads": ["the CSV headers"], "writes": ["a role map"], "guardrail": "deterministic; unknown columns are left out, never guessed"},
    {"key": "feature_forge", "name": "Feature Forge", "kind": "code", "runs_on": "Python (pandas)", "stage": 1, "symbol": "anvil", "analogy": "a lab",
     "role": "Turns months of records into about 78 signals per account: regularity, timing, habits, past income drops, loans, place.",
     "reads": ["monthly summaries", "transactions", "loans", "clients and districts"], "writes": ["the feature table"], "guardrail": "every signal is documented and recomputable"},
    {"key": "pattern_hunter", "name": "Pattern Hunter", "kind": "ai", "runs_on": "Gemini on Google ADK", "stage": 1, "symbol": "magnifier", "analogy": "a detective",
     "role": "Searches across all 4,500 accounts for patterns worth knowing, testing each one with statistical tools.",
     "reads": ["the feature table through tools"], "writes": ["findings with strength and caveats"], "guardrail": "can only cite numbers its tools returned"},
    {"key": "archetype_namer", "name": "Archetype Namer", "kind": "ai", "runs_on": "Gemini on Google ADK", "stage": 1, "symbol": "tags", "analogy": "a librarian",
     "role": "Names the six behavioural groups the clustering found and guesses a life stage and occupation for each, with confidence.",
     "reads": ["cluster statistics"], "writes": ["names, descriptions, guesses"], "guardrail": "clusters and sizes come from code"},
    {"key": "persona_builder", "name": "Persona Builder", "kind": "ai", "runs_on": "code template, refined by Gemini on Google ADK", "stage": 1, "symbol": "id-card", "analogy": "a biographer",
     "role": "Builds a realistic but fictional person for the account: occupation guess, household, goals weighted by importance and time, worries, the first questions to ask.",
     "reads": ["signals", "flags", "archetype"], "writes": ["the persona", "starting goals and worries in the profile"], "guardrail": "amounts come from code; marked fictional; every change is logged and undoable"},
]
PERSONAS += [
    {"key": "shock_dealer", "name": "Shock Dealer", "kind": "ai", "runs_on": "Gemini on Google ADK, with a local draw as fallback", "stage": 3, "symbol": "cards", "analogy": "a card dealer",
     "role": "Decides who brings the next twist card and, for the open slot, which scenario is dealt, with a one-line reason.",
     "reads": ["allowed character and scenario IDs", "the previous pick", "a few account facts"], "writes": ["a character, a scenario id, a reason"], "guardrail": "chooses IDs only, never amounts; anything outside the allowed IDs falls back to a local draw"},
    {"key": "shock_generator", "name": "Shock Generator", "kind": "code", "runs_on": "Python rules from Stage 1 signals", "stage": 3, "symbol": "storm", "analogy": "a risk officer",
     "role": "Chooses the shocks that fit this life: a lost client for a cash earner, a payment reset for a borrower, parental leave for a young family.",
     "reads": ["signals", "the persona", "district unemployment"], "writes": ["a personal deck with likelihood and why"], "guardrail": "numbers set by code from the account"},
    {"key": "life_fit", "name": "Life Fit Assessor", "kind": "code", "runs_on": "Python rules over the persona and records", "stage": 3, "symbol": "heart", "analogy": "a life coach",
     "role": "Checks every decision against the person: age and physical capacity, time a shared household leaves, whether a lodger or a move is realistic, whether gig work exists where they live. Adds options that suit their stage of life.",
     "reads": ["the persona", "age, household and district", "what you told Pulp about health and time"], "writes": ["a fit score and reason per decision"], "guardrail": "poor fits are screened out with the reason shown; fit is part of the stated objective"},
    {"key": "life_planner", "name": "Life Planner", "kind": "code", "runs_on": "Python search, phrased by Gemini when available", "stage": 3, "symbol": "route", "analogy": "a route planner",
     "role": "Builds hundreds of multi-step plans from real decisions (a second job, a move, delaying a goal, refinancing, investing), simulates each month by month and keeps four distinct finalists.",
     "reads": ["the shock", "goals with weights", "signals"], "writes": ["finalists with step-by-step reasons", "plans that fall short"], "guardrail": "one stated objective; every step's effect is measured by rerunning without it"},
]


def deal_card(key: str = "random", seed: int | None = None, account_id: int | None = None) -> dict:
    if key in DECK_BY_KEY:
        return dict(DECK_BY_KEY[key])
    if account_id is not None:
        try:
            from .shocks import find_card
            card = find_card(account_id, key, seed)
            if card:
                return card
        except Exception:
            pass
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
                            "buffer_path": _downsample(c["buffer_median_path"]), "best": c["label"] == best, "flags": len(c["flags"]), "action": c.get("action")} for c in cands],
            "objective": plan["objective"]["formula"], "weights": plan["objective"]["weights"]}


def podium_params(plan: dict) -> dict:
    top = (plan.get("ranked") or [])[:3]
    return {"top": [{"rank": i + 1, "label": c["label"], "source": c["source"], "score": round(c["adjusted_score"], 2),
                     "prob_shortfall": round(c["prob_shortfall_under_stress"], 3), "goal_progress": round(c["goal_progress_at_deadline"], 3),
                     "levers": c["levers"], "flags": c["flags"][:2], "why": c.get("why", ""),
                     "action": c.get("action"), "means": c.get("means"), "horizon": c.get("horizon"), "how": c.get("how")} for i, c in enumerate(top)],
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
    short_months = tl["runs_out_month"]
    if short_months is not None and off["monthly_gap"] <= 0:
        # The one-off cost alone is bigger than the cushion; month to month, money in still covers spending.
        cap = (f"Here is the hard part. The {_m(shock['one_off'])} cost is more than your cushion, so it would leave you short straight away, "
               f"even though what comes in still covers what goes out each month.")
    elif short_months is not None:
        cap = (f"Here is the hard part. You would be about {_m(off['monthly_gap'])} short every month, and your savings would run out "
               f"after roughly {short_months:g} months. The shock lasts {shock['duration']}.")
    elif off["monthly_gap"] <= 0:
        cap = "Good news first. Even with this hit, what comes in still covers what goes out, so your savings stay untouched."
    else:
        cap = f"You would be about {_m(off['monthly_gap'])} short each month, but your savings carry you through the whole {shock['duration']} months."
    beats.append(_beat("timeline", "timeline", cap, tl, 10, emphasis="runs_out" if short_months is not None else None))
    sw = swarm_params(plan)
    n_strat = len(sw["candidates"]) - plan["grid_size"]
    beats.append(_beat("swarm", "swarm", f"So I tried {len(sw['candidates'])} different ways through it" + (f", including {n_strat} the Strategist came up with from what you told me" if n_strat else "")
                       + ". Each one gets a score for keeping you solvent, getting you to your goal, and not turning your life upside down.", sw, 10))
    pod = podium_params(plan)
    if pod["top"]:
        t = pod["top"][0]
        lead = t.get("action") or t["label"]
        cap = f"The one that comes out on top: {lead[0].lower() + lead[1:]}."
        if pod["stay"]:
            cap += f" It takes your chance of running dry from {pod['stay']['prob_shortfall']:.0%} down to {t['prob_shortfall']:.0%}."
        beats.append(_beat("podium", "podium", cap, pod, 9))
    try:
        row = get_features().loc[account_id]
        flags = flags_for(row)
        acts = life_actions(plan, m, row, flags)
        if acts["actions"]:
            first = acts["actions"][0]
            beats.append(_beat("actions", "actions", f"In plain terms, here is what you could actually do. Start with this: {first['title'][0].lower() + first['title'][1:]}.", acts, 12))
    except Exception:
        pass
    lv = lever_scene(plan)
    if lv:
        beats.append(_beat("dial", "dial", lv["narration"], lv["params"], 9))
    tf = two_futures_scene(plan)
    if tf:
        beats.append(_beat("fork", "fork", tf["narration"], tf["params"], 10))
    beats.append(_beat("math", "math", "If you want the arithmetic, this is the same runway formula the judges use.", math_params(m, shock), 8))
    best = (plan.get("ranked") or [{}])[0]
    next_question = (best.get("needs_context") or ["Which option fits your life, and what would you want to keep unchanged?"])[0]
    beats.append(_beat("ask2", "none", next_question, {}, 5))
    # A short story: reveal (for a random draw), impact, alternatives, next action.
    # Preserve scene order and the final question without replaying every diagnostic.
    keep = {"timeline", "fork", "actions", "none"}
    if dealt_randomly:
        keep.add("shuffle")
    return [b for b in beats if b["visual"] in keep]


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
DIRECTOR_INSTRUCTION = """You are PULP's Director. You decide what the stage SHOWS for one bank customer's turn, and you write what Pulp SAYS.
You get the customer's message, their confirmed context, and tools over the engine. Call the tools you need (never guess
numbers), then reply with ONLY a JSON object:
{"beats": [{"visual": one of {visuals}, "source": the tool name whose latest result this visual should draw, or null,
            "caption": one or two spoken sentences, second person, under 220 characters}]}
Voice: talk like a friend who is good with money, not a report. Short sentences. At most ONE number per sentence, and only
when it changes what they would do. Name the decision, not the metric ("you could pause that transfer", not "reduce
outflow by 1.1%"). End the last beat with what they can decide or try next.
Rules: normally ONE concise conversational beat with visual="none". Use 2 to 3 beats only for
shock mitigation or life-decision comparisons that need explanation. At most 3 tool calls (get_profile is cheap; run_council is fast by default, pass with_agents=true only
when the person asks what they should do). Every number in a caption must come from a tool result. Conversation is the default. Use a visual only when explicitly requested or when a shock timeline or
comparison makes a financial decision materially easier to understand. Never decorate a routine answer, greeting,
clarification or acknowledgement with charts. For a meaningful scenario or comparison, keep a short animated sequence of 2 to 4 connected visuals alongside the conversation. Do not reduce an explicitly requested walkthrough to text alone. Ordinary replies remain text-only.
Use none for ordinary conversation, timeline for a shock, fork or podium for comparisons, actions for mitigation,
and math only when explicitly asked. Ask at most one question only when needed to proceed; do not prolong a completed answer.
For a life decision, first read get_profile and its decision_profile. Its life_profile explains account patterns, confirmed motivations and loan context. Loan-purpose hypotheses are tentative alternatives, never established intent. Ask what borrowing was for; do not infer a car, house, business, occupation or character from loan size or timing. A confirmed purpose replaces hypotheses. Original principal is not the current outstanding balance. Translate an observation into what it
changes in daily life, name the uncertainty, then ask the ONE missing question that changes the choice.
Never treat card or cash totals as optional purchases, unlabelled transfers as savings, or a pension as employment.
Use the confirmed goal and protected costs. Do not guess a trip budget, rent, deadline, willingness to work,
or permission to cut a category. Ask if any are missing. Ask whether historical income and essential costs still fit
before describing an option as affordable. Comparisons must name concrete alternatives (keep the date with a smaller
trip versus wait for the same trip; add a monthly service versus keep that amount for a goal), their dollar effects,
and what each choice gives up. Use compare_purchase for a cost the user supplied, and explain its limitations.
Only call deal_or_set_shock and run_council when a shock or mitigation comparison is relevant and the inputs are known.
A personal goal is not automatically an immediate financial shock. Use the active scenario for follow-ups; do not replace it with default numbers. Never claim anything has been saved or applied."""

VISUALS = ["picture", "cup", "river", "timeline", "fork", "calendar", "dial", "crowd", "ribbon", "cards", "shuffle", "swarm", "podium", "actions", "math", "none"]


class _Tools:
    def __init__(self, account_id: int, m):
        self.account_id, self.m = account_id, m
        self.results: dict[str, Any] = {}
        self.user_message = ""
        self.shock: dict | None = None
        self.card: dict | None = None
        self.plan: dict | None = cm.load_context(account_id).get("active_plan")
        if self.plan:
            sh = self.plan["request"]["shock"]
            self.shock = {"r": sh["r"], "h": sh["h"], "one_off": sh["one_off"], "duration": sh["duration_months"]}
            self.results["run_council"] = self.plan
            self.results["deal_or_set_shock"] = timeline_params(m, self.shock, None)

    def get_profile(self) -> dict:
        """Official numbers (I, S, H, B, runway), the account's flags with evidence, and its archetype."""
        ins = narrative_for(self.account_id, use_ai=False)
        out = {"I": self.m.typical_inflow, "S": self.m.typical_spending, "H": self.m.household_bills, "B": self.m.buffer,
               "baseline_runway": self.m.baseline_runway_label, "flags": [{k: f[k] for k in ("key", "label", "evidence")} for f in ins["flags"]],
               "archetype": ins["archetype"], "headline": ins["narrative"]["headline"],
               "decision_profile": ins.get("decision_profile", {})}
        from .financial_overview import goal_progress
        from datetime import datetime, timezone
        ctx = cm.load_context(self.account_id)
        out["goal_progress"] = goal_progress(ctx, datetime.now(timezone.utc).date())
        out["reported_position"] = next((i["value"] for i in ctx.get("constraints", []) if i["value"].get("type") == "financial_position"), None)
        out["position_note"] = "Reported balances are user entries, not live bank data. Goal savings are allocations, not additional assets. Historical buffer is not current net worth."
        self.results["get_profile"] = out
        return out

    def compare_purchase(self, cost: float, recurring: bool = False) -> dict:
        """Compare an explicitly supplied purchase cost with keeping the money. No affordability recommendation.
        cost must appear in the current user message or a confirmed goal. recurring means a monthly expense.
        """
        summary = cm.summarize(cm.load_context(self.account_id))
        amounts = [g.get("target_amount") for g in summary.get("goals", []) if g.get("target_amount") is not None]
        if not math.isfinite(cost) or cost <= 0:
            return {"needs_context": "What is the total price, or the monthly cost if this repeats?"}
        if not caption_is_grounded(str(cost), {"message": self.user_message, "confirmed_goal_amounts": amounts}):
            return {"needs_context": "What price should I use for this comparison? I need your amount rather than an estimate."}
        if recurring and not re.search(r"monthly|per month|a month|each month|/month", self.user_message, re.I):
            return {"needs_context": "Is that a one-time price or a monthly cost?"}
        room = self.m.typical_inflow - self.m.typical_spending
        result = {"cost": cost, "recurring": recurring, "historical_monthly_room": room,
                  "buy": {"monthly_room_after": room - cost if recurring else room,
                          "recorded_buffer_after": self.m.buffer if recurring else self.m.buffer - cost},
                  "keep_money": {"retained_after_one_year": cost * 12 if recurring else cost},
                  "limits": "Illustrative cash-flow comparison from historical records; not proof of affordability. Confirm current income, essential costs and accessible savings.",
                  "question": "Are your income and essential costs still similar to these records, and what spending must stay protected?"}
        if not recurring:
            result["months_to_set_aside_at_historical_room"] = math.ceil(cost / room) if room > 0 else None
        self.results["compare_purchase"] = result
        return result

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
            self.card = deal_card(card_key, account_id=self.account_id)
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
        summary = cm.summarize(cm.load_context(self.account_id))
        goals = sorted(summary.get("goals", []), key=lambda g: g.get("priority", 1))
        if goals and (not goals[0].get("target_amount") or not goals[0].get("target_months")):
            return {"needs_context": "What budget and target date should we use for your goal?", "reason": "A personal plan must not substitute an assumed budget or deadline."}
        sh = self.shock
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:   # own thread: the council runs its own event loop
            self.plan = ex.submit(run_council, self.account_id, self.m, r=sh["r"], h=sh["h"], one_off=sh["one_off"], duration=sh["duration"],
                                  use_ai=bool(with_agents)).result()
        from .planning_session import publish
        publish(self.account_id, self.plan)
        self.results["run_council"] = self.plan
        return {"recommended": self.plan["recommended"], "why": self.plan["why"], "grid_size": self.plan["grid_size"],
                "top": [{"label": c["label"], "action": c.get("action"), "how": c.get("how"), "needs_context": c.get("needs_context", []), "prob_shortfall": round(c["prob_shortfall_under_stress"], 3), "score": round(c["adjusted_score"], 2)} for c in self.plan["ranked"][:3]],
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
        if visual == "actions" and self.plan:
            row = get_features().loc[self.account_id]
            acts = life_actions(self.plan, m, row, flags_for(row))["actions"]
            return f"Here is what you could actually do. Start with this: {acts[0]['title'][0].lower() + acts[0]['title'][1:]}." if acts else None
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
        if visual == "none":
            return {}
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
        if visual == "actions":
            if not self.plan:
                return None
            return life_actions(self.plan, m, row, flags_for(row))
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
    if tools.shock and "deal_or_set_shock" in tools.results and not tools.plan:
        beats.append(_beat("tl", "timeline", "Here is what that does to your cushion, month by month.", tools.results["deal_or_set_shock"], 10))
    if not beats:
        beats.append(_beat("talk", "none", "I did not catch a money question in that. Tell me about a goal, a worry, or draw a twist card.", {}, 5))
    return beats


async def _twist_turn(account_id: int, m, key: str, t0: float, use_ai: bool):
    """Deal (or pick) a card, run the council with its events streaming, and tell the story."""
    from starlette.concurrency import run_in_threadpool
    character = None
    if "@" in key:  # a card already resolved on the Shocks page, with the character that revealed it
        key, char_id = key.split("@", 1)
        from .shock_dealer import CHAR_BY_ID
        if char_id in CHAR_BY_ID:
            character = {k: CHAR_BY_ID[char_id][k] for k in ("id", "name", "role")}
    if key in ("random", "personal", "dealer"):
        from .shock_dealer import deal
        last = cm.load_context(account_id).get("last_deal") or {}
        d = await run_in_threadpool(lambda: deal(account_id, 4, None, last.get("character"), last.get("scenario"), use_ai))
        cm.set_doc(account_id, "last_deal", {"character": d["character"]["id"], "scenario": d["card"]["key"]})
        card, character = d["card"], d["character"]
        yield "trace", {"t": round(time.perf_counter() - t0, 2), "stage": 3, "agent": "shock_dealer", "kind": "output",
                        "title": f"{d['character']['name']} deals {d['card']['title'].lower()}", "to": "engine",
                        "items": [d["reason"], f"source: {'Gemini' if d['source'] != 'local' else 'local draw (no model)'}", f"{d['ms']} ms"],
                        "data": {"character": d["character"]["id"], "scenario": d["card"]["key"], "source": d["source"]}}
    else:
        card = deal_card(key, account_id=account_id)
    if character:
        card = {**card, "character": character}
    shock = card_shock(card, m.typical_spending)
    if card.get("source") == "shock_generator":
        yield "trace", {"t": 0.0, "stage": 3, "agent": "shock_generator", "kind": "output", "title": f"Dealt from your personal deck: {card['title']}",
                        "items": [card["text"], f"why you: {card.get('why_you', '')}", f"likelihood: {card.get('likelihood', '')}"]}
    yield "agent", {"t": 0.0, "agent": "director", "kind": "tool_call", "tool": "deal_or_set_shock", "args": {"card": card["key"]}}
    shock_bits = f"income x{shock['r']:.2f}" + (f", bills +{shock['h']:.0%}" if shock["h"] else "") + (f", one-off ${shock['one_off']:,.0f}" if shock["one_off"] else "") + f", {shock['duration']} months"
    yield "handoff", {"t": 0.0, "from": "director", "to": "engine", "title": f"Twist: {card['title']}", "items": [card["text"], shock_bits]}
    plan = None
    from .council import run_council_stream
    async for et, data in run_council_stream(account_id, m, r=shock["r"], h=shock["h"], one_off=shock["one_off"], duration=shock["duration"], use_ai=use_ai):
        if et == "plan":
            plan = data
        elif et in ("agent", "handoff"):
            yield et, data
        elif et == "stage":
            yield "agent", {"t": data["seconds"], "agent": "engine", "kind": "text", "summary": data["detail"]}
    if not plan:
        yield "error", {"message": "council did not return a plan"}
        return
    from .planning_session import publish
    publish(account_id, plan)
    beats = twist_storyboard(account_id, m, card, plan, dealt_randomly=(key in ("random", "personal", "dealer")))
    reply, reply_source = await _short_reply(account_id, m, card, shock, plan, use_ai)
    yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "director", "to": "stage", "title": f"{len(beats)} beats",
                      "items": [f"{b['visual']}: {b['caption'][:90]}" for b in beats]}
    async for et, ev in _life_plans(account_id, {"income_fraction": shock["r"], "bills_increase": shock["h"], "one_off_cost": shock["one_off"],
                                                 "shock_duration": shock["duration"], "label": card["title"]}, f"Twist card: {card['title']}", 1):
        yield et, ev
    yield "storyboard", {"opening": False, "source": "deck+council", "beats": beats, "card": card, "reply": reply,
                         "reply_source": reply_source, "council_mode": plan.get("mode")}


REPLY_INSTRUCTION = """You are Pulp, texting one bank customer. In one or two short sentences (at most 45 words), say what
this shock means for their account and the single most useful move. Use only numbers that appear in the facts, written the
same way. No greeting, no question unless essential. Reply with the text only."""


async def _short_reply(account_id: int, m, card: dict, shock: dict, plan: dict, use_ai: bool) -> tuple[str, str]:
    """A short, real reply about this shock for this account: the model when available (grounded), else the template."""
    tl = timeline_params(m, shock, card)
    best = (plan.get("ranked") or [{}])[0]
    action = best.get("action") or plan.get("recommended") or ""
    who = f"{card['character']['name']} brings it: " if card.get("character") else ""
    gap = tl["monthly_gap"]
    if tl["runs_out_month"] is not None and gap <= 0:
        base = f"{who}{card['title']}. The {_m(shock['one_off'])} cost is more than your cushion, so it leaves you short straight away, even though money in still covers spending each month."
    elif tl["runs_out_month"] is not None:
        base = f"{who}{card['title']}. Money in falls to {_m(tl['income_after'])} against {_m(tl['spending_after'])} out, so the cushion runs out after {tl['runs_out_month']} months."
    elif gap > 0:
        base = f"{who}{card['title']}. You would be {_m(gap)} short each month, but the cushion lasts the {shock['duration']} months (runway {tl['runway_label']})."
    else:
        base = f"{who}{card['title']}. Money in still covers spending, so the cushion holds."
    template = (base + (f" Best move: {action[0].lower()}{action[1:]}." if action else "")).replace("..", ".")
    if not (use_ai and adk_available()):
        return template, "template"
    import asyncio
    from starlette.concurrency import run_in_threadpool
    facts = {"card": card.get("title"), "card_text": card.get("text"), "income_after": _m(tl["income_after"]), "spending_after": _m(tl["spending_after"]),
             "monthly_gap": _m(max(0.0, gap)), "runway": tl["runway_label"], "runs_out_month": tl["runs_out_month"], "duration_months": shock["duration"],
             "verdict": tl["verdict"], "best_move": action, "council_mode": plan.get("mode")}
    try:
        from .adk_runtime import run_agent
        agent = LlmAgent(name="pulp_reply", model=config.GEMINI_MODEL, instruction=REPLY_INSTRUCTION)
        out = await asyncio.wait_for(run_in_threadpool(run_agent, agent, json.dumps(facts, default=str), user_id=f"reply-{account_id}"), timeout=8)
        text = " ".join(out.get("texts", {}).get("pulp_reply", [])).strip()
        if 10 < len(text) < 400 and caption_is_grounded(text, tl, json.dumps(facts, default=str)):
            return text, f"google-adk/{config.GEMINI_MODEL}"
    except Exception:
        pass
    return template, "template"


async def _life_plans(account_id: int, shock_in: dict | None, trigger: str, starts_in: int | None, mode: str = "shock",
                     use_ai: bool = False) -> AsyncIterator[tuple[str, dict]]:
    """Run the Life Planner search and stream its trace, then the result. Never raises."""
    from starlette.concurrency import run_in_threadpool
    try:
        from .life_planner import run as plan_run
        result = await run_in_threadpool(lambda: plan_run(account_id, shock_in, mode=mode, shock_starts_in=starts_in,
                                                          trigger=trigger, use_ai=use_ai))
    except Exception as exc:
        yield "agent", {"t": 0.0, "agent": "life_planner", "kind": "text", "summary": f"planner unavailable: {type(exc).__name__}"}
        return
    for e in result.get("trace", []):
        yield "trace", e
    yield "lifeplans", result


def _profile_event(changes: list[dict], spoken: str, account_id: int) -> dict:
    ctx = cm.load_context(account_id)
    return {"changes": [{k: v for k, v in c.items() if k != "item_id"} for c in changes], "context": cm.summarize(ctx),
            "version": ctx.get("context_version", 1), "spoken": spoken}


def _auto_apply(account_id: int, proposal: dict) -> list[dict]:
    """Apply a companion proposal immediately (v2: agents update the profile directly; 'no' undoes)."""
    res = cm.apply_now(account_id, [{**c, "reason": proposal.get("rationale") or "You said so in conversation"} for c in proposal.get("changes", [])],
                       agent="companion", reason=proposal.get("rationale") or "Heard in conversation")
    with cm._LOCK:
        ctx = cm.load_context(account_id)
        for p in ctx.get("proposals", []):
            if p["id"] == proposal["id"]:
                p["status"], p["resolved_at"] = "applied", cm._now()
        cm.save_context(ctx)
    return res["changes"]


def _ask_beat(account_id: int, summary: dict, pending: list[dict], insights: dict | None, prefix: str = "") -> dict | None:
    q = pick_question(summary, pending, insights)
    if not q:
        return None
    cm.record_question(account_id, q["key"])
    text = (prefix + " " if prefix else "") + q["text"]
    return _beat("ask", "none", text, {"question_key": q["key"]}, 7)


def _goal_follow_up(account_id: int, summary: dict, prefix: str = "") -> dict | None:
    """Keep a confirmed goal moving before switching to general intake."""
    goals = summary.get("goals") or []
    if not goals:
        return None
    goal = sorted(goals, key=lambda g: g.get("priority", 1))[0]
    if not goal.get("target_months"):
        key = "goal_timing"
        question = "When would you like to take that vacation?" if goal.get("type") == "travel" else "When would you ideally like to reach that goal?"
    elif not goal.get("target_amount"):
        key = "goal_amount"
        question = "What total budget would feel comfortable for that vacation?" if goal.get("type") == "travel" else "Roughly how much would you like to set aside for that goal?"
    elif goal.get("saved_amount") is None:
        key = "goal_saved"
        question = "How much have you already set aside specifically for this goal? It is fine if you are starting from zero."
    else:
        return None
    cm.record_question(account_id, key)
    return _beat("ask", "none", f"{prefix} {question}".strip(), {"question_key": key}, 5)


async def _stage_stream(account_id: int, message: str, *, use_ai: bool = True) -> AsyncIterator[tuple[str, dict]]:
    """Yields ("agent", ev), ("handoff", ev), ("memory", ...), ("storyboard", {...}) for one stage turn.

    Explicit twists run immediately, including for fresh profiles. Missing personal details are asked after
    the calculation when relevant; new context still requires spoken, typed or button confirmation.
    """
    from starlette.concurrency import run_in_threadpool

    t0 = time.perf_counter()
    m = get_metrics(account_id)
    msg = (message or "").strip()
    tools = _Tools(account_id, m)
    tools.user_message = msg
    ctx = cm.load_context(account_id)
    summary = cm.summarize(ctx)
    pending = pending_proposals(ctx)
    insights_cache: dict = {}

    def insights_fast() -> dict:
        if "v" not in insights_cache:
            insights_cache["v"] = narrative_for(account_id, use_ai=False)
        return insights_cache["v"]

    # 1. opening (only when asked for)
    if msg == "__intro__":
        try:
            from .persona import get_persona
            had = bool(ctx.get("persona"))
            persona = await run_in_threadpool(get_persona, account_id)
            fresh = cm.load_context(account_id)
            for e in fresh.get("persona_trace", []):
                yield "trace", e
            if not had and persona:
                seeded = [e for e in fresh.get("profile_log", []) if e["agent"] == "persona_builder"]
                yield "profile", _profile_event(seeded, f"I sketched a starting picture of {persona['display_name'].split()[0]}, a fictional person "
                                                       f"who fits these records, with {len(persona['goals'])} goals to check.", account_id)
        except Exception:
            pass
        insights = await run_in_threadpool(narrative_for, account_id, use_ai)
        yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "engine", "to": "narrator", "title": f"{len(insights['flags'])} flag(s) and the archetype",
                          "items": [f"{f['label']}: {f['evidence']}" for f in insights["flags"][:5]]
                                   + ([f"archetype: {insights['archetype']['name']} ({insights['archetype']['share']:.0%} of accounts)"] if insights.get("archetype") else [])}
        yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "narrator", "to": "director", "title": insights["narrative"]["headline"],
                          "items": [f"[{i['flag']}] {i['text']}" for i in insights["narrative"]["insights"]] + [f"written by {insights['narrative']['source']}"]}
        profile = insights.get("decision_profile", {})
        observations = profile.get("observations", [])
        try:
            from .discovery import discovery as _disc
            top = (await run_in_threadpool(_disc, account_id)).get("discovery")
        except Exception:
            top = None
        if top:
            yield "trace", {"t": round(time.perf_counter() - t0, 2), "stage": 1, "agent": "narrator", "kind": "output", "to": "director",
                            "title": f"Biggest discovery: {top['title'].lower()}", "items": [top["evidence"], top["rarity"], top["action"]]}
        if observations:
            observation = max(observations, key=lambda o: o["priority"])
            intro = observation["evidence"] + " " + observation["life_effect"]
            if top:
                intro = f"The biggest thing I found: {top['plain'][0].lower()}{top['plain'][1:]} {top['action']}"
            beats = [_beat("intro", "none", intro, {}, 5)]
            q = next((q for q in profile.get("questions", []) if q["key"] == observation["key"]), None)
            if q:
                cm.record_question(account_id, q["key"])
                beats.append(_beat("ask", "none", q["text"], {"question_key": q["key"]}, 5))
        else:
            beats = opening_storyboard(account_id, m, insights)
            beats = [_beat("intro", "none", " ".join(b["caption"] for b in beats[:2]), {}, 5)]
            if top:
                beats = [_beat("intro", "none", f"The biggest thing I found: {top['plain'][0].lower()}{top['plain'][1:]} {top['action']}", {}, 5)]
        if not observations and is_cold(summary):
            ask = _ask_beat(account_id, summary, pending, insights, prefix="That is what the numbers say. Now I'd like to know you a little, so anything we plan fits your life.")
            if ask:
                beats = [b for b in beats if b["id"] != "ask"] + [ask]
        yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "director", "to": "stage", "title": f"{len(beats)} beats",
                          "items": [f"{b['visual']}: {b['caption'][:90]}" for b in beats]}
        yield "storyboard", {"opening": True, "source": insights["narrative"]["source"], "beats": beats}
        return

    # "Pulp, explain this": a section of the app in the simplest, most relatable words, with this account's numbers.
    # Voice sends the same token inside a sentence, so look for it anywhere in the message.
    if "explain:" in msg:
        from .explain import explain
        token = msg[msg.index("explain:"):]
        out = await run_in_threadpool(explain, account_id, m, token, use_ai)
        yield "trace", {"t": round(time.perf_counter() - t0, 2), "stage": 2, "agent": "director", "kind": "output",
                        "title": f"Explained: {out['title']}", "items": [out["text"][:300], f"source: {out['source']}"]}
        yield "storyboard", {"opening": False, "source": f"explain:{out['source']}", "reply": out["text"],
                             "beats": [_beat("explain", "none", out["text"], {"topic": out["topic"]}, 6)]}
        return

    if msg in ("decision:small", "decision:big"):
        scale = msg.split(":")[1]
        profile = insights_fast().get("decision_profile", {})
        choices = profile.get("decisions", {}).get(scale, [])
        if choices:
            choice = choices[0]
            caption = f"We can compare: {choice['label'].lower()}. {choice['question']}"
        else:
            caption = "What decision are you weighing up, and what would change in your daily life?"
        yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "narrator", "to": "director",
                          "title": "Decision grounded in your profile", "items": [c["label"] for c in choices]}
        yield "storyboard", {"opening": False, "source": "decision_profile", "beats": [_beat("decision", "none", caption, {}, 5)]}
        return

    # 2. Explicit scenario requests run immediately; personalize after showing the result.
    if msg.startswith("twist:"):
        key = msg.split(":", 1)[1].strip() or "random"
        if key == "cards":
            yield "storyboard", {"opening": False, "source": "deck", "beats": [_beat("cards", "cards", "Pick a card, or let the deck choose.", cards_params(), 6)]}
            return
        async for et, ev in _twist_turn(account_id, m, key, t0, use_ai):
            yield et, ev
        set_pending_twist(account_id, None)
        return

    # 3. a spoken or typed yes / no answers what PULP said back last turn
    kind, rest = classify_reply(msg)
    if kind == "affirm" and pending:
        applied = 0
        for prop in pending:
            try:
                applied += len(cm.confirm(account_id, prop["id"], accept=True)["applied"])
            except Exception:
                pass
        if applied:
            from .planning_session import rerun
            updated_plan = await run_in_threadpool(rerun, account_id, use_ai)
        else:
            updated_plan = None
        ctx = cm.load_context(account_id)
        summary = cm.summarize(ctx)
        yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "companion", "to": "profile", "title": "Confirmed out loud, saved",
                          "items": [restate(prop).replace(" Did I get that right?", "") for prop in pending] + [f"profile version {ctx.get('context_version')}"]}
        yield "memory", {"proposal": None, "context": summary, "confirmed": applied, "next_question": None, "reply": None}
        pt = get_pending_twist(ctx)
        if pt and not rest:
            yield "agent", {"t": round(time.perf_counter() - t0, 2), "agent": "director", "kind": "text", "summary": "Thanks. Now the twist you asked for."}
            async for et, ev in _twist_turn(account_id, m, pt, t0, use_ai):
                yield et, ev
            set_pending_twist(account_id, None)
            return
        if not rest and (follow_up := _goal_follow_up(account_id, summary, "Saved.")):
            yield "storyboard", {"opening": False, "source": "intake", "beats": [follow_up]}
            return
        if not rest and updated_plan:
            best = (updated_plan.get("ranked") or [{}])[0]
            question = (best.get("needs_context") or [None])[0]
            explanation = f"Saved. One option to discuss is: {best.get('action') or updated_plan['recommended']}."
            if question:
                explanation += " " + question
            yield "storyboard", {"opening": False, "source": "council", "beats": [
                _beat("replanned", "none", explanation, {}, 5)]}
            return
        if not rest:
            ask = _ask_beat(account_id, summary, [], insights_fast(), prefix="Got it, that's part of how I see you now.")
            beats = [ask] if ask else [_beat("ask", "none", "Got it, that's part of how I see you now. What else is on your mind?", {}, 6)]
            yield "storyboard", {"opening": False, "source": "intake", "beats": beats}
            return
        msg = rest
        pending = []
    elif kind == "negate" and pending:
        for prop in pending:
            try:
                cm.confirm(account_id, prop["id"], accept=False)
            except Exception:
                pass
        ctx = cm.load_context(account_id)
        summary = cm.summarize(ctx)
        yield "memory", {"proposal": None, "context": summary, "rejected": len(pending), "next_question": None, "reply": None}
        if not rest:
            yield "storyboard", {"opening": False, "source": "intake", "beats": [_beat("ask", "none", "Okay, scrap that. Tell me what I got wrong, in your own words.", {}, 6)]}
            return
        msg = rest
        pending = []
    elif kind == "negate" and not pending and _last_turn_updated(ctx):
        undone = []
        for cid in cm.last_change_ids(ctx):
            try:
                r = cm.undo(account_id, cid, agent="companion")
                if r.get("change"):
                    undone.append(r["change"])
            except Exception:
                pass
        if undone:
            yield "profile", _profile_event(undone, "Okay, I've taken that back out.", account_id)
            if not rest:
                yield "storyboard", {"opening": False, "source": "intake", "beats": [_beat("ask", "none", "Okay, I've taken that back out. What did I get wrong?", {}, 6)]}
                return
            msg = rest
    elif wants_skip(msg) and get_pending_twist(ctx):
        pt = get_pending_twist(ctx)
        async for et, ev in _twist_turn(account_id, m, pt, t0, use_ai):
            yield et, ev
        set_pending_twist(account_id, None)
        return

    # A repeated yes (including after a button confirmation) still advances the conversation.
    if kind == "affirm" and not pending and not rest:
        ask = _goal_follow_up(account_id, summary, "Let's work out the next detail.")
        if not ask:
            ask = _ask_beat(account_id, summary, [], insights_fast(), prefix="Let's keep going.")
        yield "storyboard", {"opening": False, "source": "intake", "beats": [ask] if ask else [
            _beat("ask", "none", "What would you like to work through next?", {}, 5)]}
        return

    # 4. free text: memory (offline extraction, instant) + the Director agent with tools
    proposal = None
    try:
        from .gemini_agent import chat as companion_chat
        mem = await run_in_threadpool(companion_chat, account_id, msg, not use_ai, False)
        ex = mem.get("extraction") or {}
        changes = ex.get("proposed_changes") or []
        proposal = mem.get("proposal")
        yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "companion", "to": "director", "title": f"heard: {ex.get('intent', 'message')}",
                          "items": [f"proposes to remember {c.get('field')}: {json.dumps(c.get('value'), default=str)[:100]}" for c in changes[:3]]
                                   + ([f"follow-up: {ex['follow_up_question']}"] if ex.get("follow_up_question") else []) or ["nothing to remember from this"]}
        yield "memory", {"proposal": proposal, "context": mem.get("context"), "next_question": mem.get("next_question"), "reply": mem.get("reply")}
    except Exception as exc:  # memory is optional for the stage
        mem = {"reply": None}
        yield "memory", {"proposal": None, "context": None, "next_question": None, "error": f"{type(exc).__name__}"[:80]}

    applied_changes: list[dict] = []
    if proposal:
        try:
            applied_changes = _auto_apply(account_id, proposal)
        except Exception:
            applied_changes = []
        if applied_changes:
            yield "profile", _profile_event(applied_changes, _noted(proposal), account_id)
            yield "trace", {"t": round(time.perf_counter() - t0, 2), "stage": 2, "agent": "companion", "kind": "output",
                            "title": f"Updated your profile ({len(applied_changes)} change{'s' if len(applied_changes) != 1 else ''})",
                            "items": [f"{c['kind']} {c['field']}: {c['label']}" for c in applied_changes]}

    beats: list[dict] = []
    source = "template"
    from .stage3 import detect, shock_inputs, summary_line
    detected = detect(msg)
    if detected:
        yield "trace", {"t": round(time.perf_counter() - t0, 2), "stage": 3, "agent": "director", "kind": "handoff",
                        "title": f"Heard a {'shock' if detected['kind'] == 'shock' else 'decision'}: {detected['title'].lower()}",
                        "items": [f"timing: {detected['timing']}"], "to": "life_planner"}
        result = None
        if detected["kind"] == "shock":
            si = shock_inputs(detected, m)
            if si.get("note"):
                yield "trace", {"t": round(time.perf_counter() - t0, 2), "stage": 3, "agent": "engine", "kind": "note", "title": si["note"]}
            try:
                tools.deal_or_set_shock("custom", si["income_fraction"], si["bills_increase"], si["one_off_cost"], si["shock_duration"])
            except Exception:
                pass
            async for et, ev in _life_plans(account_id, si, f"You said: {msg[:120]}", 1 if detected["timing"] == "now" else 3):
                if et == "lifeplans":
                    result = ev
                yield et, ev
            if result:
                # The Shocks tab already shows the cushion month by month; the chat gives the short answer and the plans.
                cap = tools.template_caption("timeline") if tools.params_for("timeline", "deal_or_set_shock") else None
                beats.append(_beat("plans", "none", ((cap + " ") if cap else "") + summary_line(result, detected), {}, 6))
        else:
            async for et, ev in _life_plans(account_id, None, f"You asked about: {detected['title'].lower()}", None, mode="long_term"):
                if et == "lifeplans":
                    result = ev
                yield et, ev
            if result:
                line = summary_line(result, detected)
                fam = detected["key"].split("_")[0]
                fin = [p for p in result.get("plans", []) if any(fam in st["decision"] for st in p["steps"])]
                if fin:
                    line += f" {detected['title']} is part of the plan that is {fin[0]['role_label'].lower()}."
                beats.append(_beat("plans", "none", line, {}, 6))
        if beats:
            source = "stage3"
    if use_ai and adk_available() and not beats:
        ctx_summary = cm.summarize(cm.load_context(account_id))
        payload = json.dumps({"message": msg, "confirmed_context": {k: ctx_summary.get(k, []) for k in ("goals", "concerns", "constraints", "preferences", "upcoming_events")},
                              "active_scenario": tools.shock, "current_recommendation": (tools.plan or {}).get("recommended"),
                              "recent_conversation": cm.load_context(account_id).get("conversation", [])[-10:],
                              "official": {"I": m.typical_inflow, "S": m.typical_spending, "B": m.buffer, "baseline_runway": m.baseline_runway_label},
                              "note": "Answer directly. Ask one question only if needed; ordinary replies need no visual."}, default=float)
        agent = LlmAgent(name="director", model=config.GEMINI_MODEL, description="Chooses what the stage shows and writes Pulp's lines.",
                         instruction=DIRECTOR_INSTRUCTION.replace("{visuals}", ", ".join(VISUALS)),
                         tools=[tools.get_profile, tools.get_cohort, tools.compare_purchase, tools.deal_or_set_shock, tools.run_council, tools.show_math], output_key="director")
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
            evidence = {"visual": params, "tools": tools.results,
                        "official": {"inflow": m.typical_inflow, "spending": m.typical_spending, "buffer": m.buffer},
                        "confirmed_context": ctx_summary}
            if not caption_is_grounded(caption, evidence):
                caption = tools.template_caption(b["visual"])
                if not caption:
                    continue
            beats.append(_beat(f"d{i}", b["visual"], caption, params, 9 if b["visual"] != "none" else 5))
        if beats:
            source = f"google-adk/{config.GEMINI_MODEL}"
    # A new proposal gets a clear restatement below, without fallback filler.
    if not beats and not proposal:
        beats = _fallback_beats(tools, msg)
        if mem.get("reply") and beats and beats[0]["visual"] == "none":
            beats[0]["caption"] = str(mem["reply"])[:260]
        elif beats and beats[0]["visual"] == "none":
            current_summary = cm.summarize(cm.load_context(account_id))
            follow_up = _goal_follow_up(account_id, current_summary)
            if follow_up:
                beats = [follow_up]

    # 5. close the turn: say back what was learned (a yes confirms it), or ask the next sharpest question
    ctx = cm.load_context(account_id)
    summary = cm.summarize(ctx)
    pt = get_pending_twist(ctx)
    if proposal and applied_changes:
        beats.append(_beat("noted", "none", _noted(proposal), {"profile_changes": [c["id"] for c in applied_changes]}, 6))
        if pt:
            async for et, ev in _twist_turn(account_id, m, pt, t0, use_ai):
                yield et, ev
            set_pending_twist(account_id, None)
            pt = None
    elif proposal:
        text = restate(proposal)
        if pt:
            text = text.replace(" Did I get that right?", f" Say yes and I will run the {DECK_BY_KEY.get(pt, {}).get('title', 'twist').lower()} card right after.")
        beats.append(_beat("confirm", "none", text, {"confirm_proposal": proposal["id"], "pending_twist": pt}, 7))
    elif not beats:
        ask = _ask_beat(account_id, summary, pending_proposals(ctx), insights_fast())
        if ask:
            beats.append(ask)
    yield "handoff", {"t": round(time.perf_counter() - t0, 2), "from": "director", "to": "stage", "title": f"{len(beats)} beats ({'from the model' if source != 'template' else 'template'})",
                      "items": [f"{b['visual']}: {b['caption'][:90]}" for b in beats]}
    yield "storyboard", {"opening": False, "source": source, "beats": beats, "seconds": round(time.perf_counter() - t0, 2),
                         "pending_proposal": proposal["id"] if (proposal and not applied_changes) else None, "pending_twist": pt}


def _noted(proposal: dict) -> str:
    said = restate(proposal).replace(" Did I get that right?", "").strip()
    return f"{said} I've added that to your profile. Say no if I got it wrong."


def _last_turn_updated(ctx: dict) -> bool:
    last = next((t for t in reversed(ctx.get("conversation", [])[:-1]) if t.get("role") == "assistant"), None)
    return bool(last and "Say no if I got it wrong" in last.get("text", ""))


def _turn_title(message: str) -> str:
    if message == "__intro__":
        return "Opening: what should I know about my money?"
    if message.startswith("twist:"):
        key = message[6:].split("@")[0]
        return "Shuffle a twist" if key in ("random", "personal", "dealer") else f"Twist card: {key.removeprefix('p_').replace('_', ' ')}"
    if message.startswith("decision:"):
        return "A decision to weigh up"
    if "explain:" in message:
        key = message[message.index("explain:") + 8:].split("?")[0].split()[0]
        return f"Explain: {key.replace('_', ' ')}"
    return message[:120]


async def stage_stream(account_id: int, message: str, *, use_ai: bool = True):
    """The shared conversation boundary for typed and spoken turns. Every turn is recorded as a replayable agent run."""
    from .agent_runs import normalize, record
    cm.record_turn(account_id, "user", message)
    t0 = time.perf_counter()
    events: list[dict] = [{"t": 0, "stage": 2, "agent": "you", "kind": "handoff", "to": "director", "title": _turn_title(message)}]
    reply = ""
    try:
        async for event, data in _stage_stream(account_id, message, use_ai=use_ai):
            if event == "storyboard":
                cm.record_turn(account_id, "assistant", " ".join(b["caption"] for b in data.get("beats", [])),
                               {"stage": [b["visual"] for b in data.get("beats", [])]})
                reply = data.get("reply") or " ".join(b.get("caption", "") for b in data.get("beats", []))
            elif event in ("agent", "handoff", "trace", "profile", "lifeplans"):
                try:
                    e = normalize(event, data if isinstance(data, dict) else {}, t0)
                    if e:
                        events.append(e)
                except Exception:
                    pass
            yield event, data
    finally:
        if reply:
            events.append({"t": round(time.perf_counter() - t0, 2), "stage": 2, "agent": "director", "kind": "output", "title": "Pulp's reply",
                           "items": [reply[:400]]})
        try:
            stage = 3 if any(e.get("stage") == 3 for e in events) else 2
            record(account_id, stage=stage, title=_turn_title(message), trigger="Conversation turn", events=events,
                   source="google-adk" if use_ai and adk_available() else "offline", duration_s=time.perf_counter() - t0)
        except Exception:
            pass
