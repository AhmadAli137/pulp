"""Shock Dealer: picks who turns up on a twist card and, for the open slot, which scenario is dealt.

A small Gemini step on Google ADK chooses from allowed IDs only (a character and, when the slot is open, a scenario)
and gives a one-line reason. It never sees or sets an amount: the card's numbers come from the deck and the engine
computes everything after. If the model is unavailable, slow or returns anything outside the allowed IDs, a local draw
(weighted toward characters that fit the scenario, never repeating the previous pick) answers instead.
"""
from __future__ import annotations

import concurrent.futures
import json
import random
import time
from typing import Any

# The people who bring a shock to the table. The frontend draws each by id.
CHARACTERS: list[dict] = [
    {"id": "manager", "name": "The Manager", "role": "brings news about your job and hours", "fits": ["income"]},
    {"id": "client", "name": "The Client", "role": "pays you, until they don't", "fits": ["income"]},
    {"id": "landlord", "name": "The Landlord", "role": "sets the rent and the lease", "fits": ["housing"]},
    {"id": "technician", "name": "The Technician", "role": "fixes what breaks at home", "fits": ["housing", "costs"]},
    {"id": "mechanic", "name": "The Mechanic", "role": "keeps the car on the road", "fits": ["transport"]},
    {"id": "doctor", "name": "The Doctor", "role": "decides when you can work again", "fits": ["health"]},
    {"id": "dentist", "name": "The Dentist", "role": "sends the bill the plan won't cover", "fits": ["health"]},
    {"id": "vet", "name": "The Vet", "role": "looks after the family pet", "fits": ["family", "health"]},
    {"id": "midwife", "name": "The Midwife", "role": "announces a new arrival", "fits": ["family"]},
    {"id": "banker", "name": "The Banker", "role": "resets the loan terms", "fits": ["costs"]},
    {"id": "meter_reader", "name": "The Meter Reader", "role": "watches the bills creep up", "fits": ["costs", "housing"]},
    {"id": "recruiter", "name": "The Recruiter", "role": "brings an offer somewhere else", "fits": ["opportunity"]},
    {"id": "relative", "name": "The Relative", "role": "needs a hand", "fits": ["family"]},
    {"id": "emergency_official", "name": "The Emergency Official", "role": "issues the evacuation order", "fits": ["disaster"]},
    {"id": "economist", "name": "The Economist", "role": "reads the numbers no one wants to hear", "fits": ["economy"]},
    {"id": "reporter", "name": "The Reporter", "role": "brings the news from far away", "fits": ["political"]},
    {"id": "health_officer", "name": "The Health Officer", "role": "decides what stays open", "fits": ["health"]},
]
# Who naturally brings each scenario (deck keys, and personal keys without the p_ prefix).
PREFERRED = {"layoff": "manager", "hours_cut": "manager", "combined": "manager", "client_loss": "client", "slow_season": "client",
             "rent_up": "landlord", "moving": "landlord", "roommate_leaves": "landlord", "furnace": "technician", "home_repair": "technician",
             "car": "mechanic", "car_repair": "mechanic", "health": "doctor", "sick_leave": "doctor", "dental": "dentist", "vet": "vet",
             "parental": "midwife", "rate_reset": "banker", "bills_inflation": "meter_reader", "pension_lag": "meter_reader",
             "holidays": "meter_reader", "job_offer": "recruiter", "family_help": "relative",
             "wildfire": "emergency_official", "flood": "emergency_official", "ice_storm": "emergency_official", "recession": "economist",
             "tariffs": "economist", "inflation_spike": "economist", "market_drop": "economist", "conflict": "reporter", "public_cuts": "reporter",
             "strike": "reporter", "lockdown": "health_officer", "fraud": "banker"}
CHAR_BY_ID = {c["id"]: c for c in CHARACTERS}
TABLE = ("layoff", "furnace", "combined")  # the judges' three cards keep their official scenarios
DECK_CATEGORY = {"layoff": "income", "furnace": "housing", "combined": "income", "hours_cut": "income", "rent_up": "housing",
                 "bills_inflation": "costs", "car_repair": "transport", "dental": "health", "vet": "family",
                 "sick_leave": "health", "parental": "family", "moving": "housing"}
AI_TIMEOUT_S = 9.0  # the page prefetches the next deal, so this wait is hidden; it asks use_ai=false if it cannot wait
_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=8, thread_name_prefix="dealer")

DEALER_INSTRUCTION = """You are PULP's Shock Dealer. You choose who brings the next twist card and, when asked, which
scenario it is. Choose only from the allowed IDs you are given and never the excluded ones. Pick what is most telling for
this account (use the facts), and vary the cast. Do not mention any amount. Reply with JSON only:
{"character": "<id>", "scenario": "<id>", "reason": "<one plain sentence, at most 22 words>"}"""


def _deck_cards(account_id: int | None, pool: str) -> list[dict]:
    from .director import SHOCK_DECK
    if pool == "personal" and account_id is not None:
        try:
            from .shocks import personal_deck
            cards = personal_deck(account_id)["cards"]
            if cards:
                return [dict(c) for c in cards]
        except Exception:
            pass
    return [dict(c, category=DECK_CATEGORY.get(c["key"], "costs")) for c in SHOCK_DECK]


def _facts(account_id: int | None) -> dict:
    if account_id is None:
        return {}
    try:
        from .features import get_features
        r = get_features().loc[account_id]
        keys = ("I", "S", "H", "B", "P", "spending_ratio", "income_cv", "cash_deposit_share", "pension_share", "owner_age",
                "n_authorized_users", "december_spend_ratio", "district_unemployment", "runway_layoff")
        out = {}
        for k in keys:
            try:
                v = float(r[k])
                out[k] = round(v, 3)
            except Exception:
                continue
        return out
    except Exception:
        return {}


def _local(scenarios: list[dict], exclude_char: str | None, rng: random.Random) -> tuple[str, str, str]:
    card = rng.choice(scenarios)
    cat = card.get("category") or DECK_CATEGORY.get(card["key"], "costs")
    pref = PREFERRED.get(card["key"].removeprefix("p_"))
    fitting = [c for c in CHARACTERS if cat in c["fits"] and c["id"] != exclude_char]
    if pref and pref != exclude_char:
        ch = CHAR_BY_ID[pref]
    else:
        ch = rng.choice(fitting or [c for c in CHARACTERS if c["id"] != exclude_char])
    reason = f"{ch['name']} {ch['role']}: {card['title'].lower()}."
    if card.get("why_you"):
        reason = f"{ch['name']} brings it because {card['why_you'][0].lower()}{card['why_you'][1:]}"
    return ch["id"], card["key"], reason[:200]


def _ai(account_id: int | None, scenarios: list[dict], chars: list[dict], exclude_char: str | None, exclude_scn: str | None) -> dict | None:
    from .adk_runtime import LlmAgent, adk_available, json_block, run_agent
    from .. import config
    if not adk_available():
        return None
    agent = LlmAgent(name="shock_dealer", model=config.GEMINI_MODEL, instruction=DEALER_INSTRUCTION)
    payload = json.dumps({"allowed_characters": [{"id": c["id"], "who": f"{c['name']}, {c['role']}"} for c in chars],
                          "allowed_scenarios": [{"id": s["key"], "title": s["title"], "text": s["text"], "why_you": s.get("why_you")} for s in scenarios],
                          "excluded": {"character": exclude_char, "scenario": exclude_scn}, "account_facts": _facts(account_id)}, default=str)
    out = run_agent(agent, payload, user_id=f"dealer-{account_id or 0}")
    return json_block(" ".join(out.get("texts", {}).get("shock_dealer", [])))


def deal(account_id: int | None = None, slot: int = 4, scenario: str | None = None, exclude_character: str | None = None,
         exclude_scenario: str | None = None, use_ai: bool = True, pool: str = "personal", seed: int | None = None) -> dict:
    """Resolve one reveal. Slots 1-3 keep their official scenario; slot 4 (or a chat shuffle) also picks the scenario."""
    t0 = time.perf_counter()
    rng = random.Random(seed if seed is not None else time.time_ns())
    cards = _deck_cards(account_id, pool)
    if slot in (1, 2, 3):
        from .director import DECK_BY_KEY
        key = scenario if scenario in TABLE else TABLE[slot - 1]
        fixed = dict(DECK_BY_KEY[key], category=DECK_CATEGORY[key])
        scenarios = [fixed]
    else:
        scenarios = [c for c in cards if c["key"] not in TABLE and c["key"] != exclude_scenario] or cards
    chars = [c for c in CHARACTERS if c["id"] != exclude_character]
    source, char_id, scn_id, reason = "local", None, None, ""
    if use_ai:
        fut = _POOL.submit(_ai, account_id, scenarios, chars, exclude_character, exclude_scenario)
        try:
            got = fut.result(timeout=AI_TIMEOUT_S) or {}
        except Exception:
            got = {}
        c_id, s_id = str(got.get("character") or ""), str(got.get("scenario") or "")
        if len(scenarios) == 1:
            s_id = scenarios[0]["key"]
        if c_id in CHAR_BY_ID and c_id != exclude_character and any(s["key"] == s_id for s in scenarios) and isinstance(got.get("reason"), str):
            from .adk_runtime import adk_available  # noqa: F401
            from .. import config
            reason = got["reason"].strip()[:200]
            if "$" not in reason and "%" not in reason:  # amounts belong to the engine, not the dealer
                char_id, scn_id, source = c_id, s_id, f"google-adk/{config.GEMINI_MODEL}"
    if char_id is None:
        char_id, scn_id, reason = _local(scenarios, exclude_character, rng)
    card = next(dict(s) for s in scenarios if s["key"] == scn_id)
    ch = CHAR_BY_ID[char_id]
    return {"slot": slot, "character": {"id": ch["id"], "name": ch["name"], "role": ch["role"]},
            "card": {k: card.get(k) for k in ("key", "title", "text", "r", "h", "duration", "one_off", "one_off_months", "category",
                                               "likelihood", "why_you", "source") if k in card},
            "reason": reason, "source": source, "ms": round((time.perf_counter() - t0) * 1000)}


def characters() -> list[dict]:
    return [{k: c[k] for k in ("id", "name", "role", "fits")} for c in CHARACTERS]
