"""The persona's own voice: one sentence, first person, on why a goal matters to them or why a worry keeps them up.

Code writes a grounded first draft from the persona (age, work, household, place) and the evidence behind each goal or
worry. When a model is available, the Persona Builder rewrites the set in character, once, in the background; a rewrite
that introduces a number not in the draft is rejected. Quotes are fictional, like the persona, and labelled as such.
"""
from __future__ import annotations

import json
import logging
import re
import threading
from typing import Any

from . import context_manager as cm

_RUNNING: set[int] = set()
_TRIED: dict[int, set[str]] = {}  # keys already sent to the model this process, so polling never re-sends them
_LOCK = threading.Lock()


def _work_word(persona: dict) -> str:
    occ = ((persona.get("occupation") or {}).get("label") or "").lower()
    if "pension" in occ or "retired" in occ:
        return "the pension"
    if "self-employed" in occ or "small business" in occ or "contract" in occ:
        return "the work"
    if "retail" in occ or "service" in occ or "hospitality" in occ or "trade" in occ:
        return "the shop"
    if "salaried" in occ or "office" in occ or "professional" in occ:
        return "the job"
    return "work"


def _we(persona: dict) -> str:
    return "we" if "partner" in (persona.get("household") or "").lower() or "shares" in (persona.get("household") or "").lower() else "I"


def _num(text: str, pattern: str) -> str | None:
    m = re.search(pattern, text or "")
    return m.group(1) if m else None


GOAL_TEMPLATES = {
    "emergency_fund": lambda p, g: f"If {_work_word(p)} dried up tomorrow, {_we(p)} need to know the bills still get paid while {_we(p)} figure things out.",
    "loan_early": lambda p, g: "I'd sleep better knowing that loan is gone early, so the money stops going out the door every month.",
    "debt": lambda p, g: "I'd sleep better knowing that loan is gone early, so the money stops going out the door every month.",
    "vehicle": lambda p, g: "When the lease is up I want to choose the next car myself, not take whatever deal they put in front of me.",
    "retirement": lambda p, g: f"I don't have that many working years left, and I don't want the first year without {_work_word(p)} to be the scary one.",
    "income_smoothing": lambda p, g: "Some months are good and some are thin; I'd like to stop holding my breath every time a slow one comes.",
    "tax": lambda p, g: "I never want a tax bill in the spring to wipe out everything I put aside.",
    "habit": lambda p, g: ("It drives me mad paying the bank just because a bill landed a couple of days before my pay."
                           if "overdraft" in (g.get("id") or "") or "interest" in (g.get("evidence") or "").lower()
                           else "If I put a little aside first, before anything else goes out, it actually stays put."),
    "holidays": lambda p, g: "I love the holidays, but January always hurts, and I'd rather it didn't.",
    "home": lambda p, g: "Every month the rent goes to someone else's mortgage; I'd like some of it to start building something of ours.",
    "housing_move": lambda p, g: "I'm ready for a place of my own, and I don't want the deposit to be the thing that stops me.",
    "investing": lambda p, g: "The money is just sitting there; I'd like it to be doing something for the future.",
    "career": lambda p, g: "I know I could earn more with the right qualification; I just need the money set aside to do it.",
    "family": lambda p, g: "People count on what I send them, and I don't want that to stop if things get tight for me.",
    "cushion": lambda p, g: "The balance keeps creeping down even when nothing bad happens, and that worries me more than I let on.",
    "spending": lambda p, g: "Little things have crept up over the year, and I'd like to get back to where I was.",
    "travel": lambda p, g: "Seeing family matters more to me now than it ever did, and I want the trip paid for before I book it.",
    "care": lambda p, g: "Repairs and health costs only go one way at my age; I'd rather be ready than surprised.",
    "education": lambda p, g: "I want the kids to have choices about school that don't depend on what kind of year we're having.",
}

WORRY_TEMPLATES = {
    "thin_margin": lambda p, w: "Almost everything that comes in goes straight back out, so there's never much left if something goes wrong.",
    "fragile_but_clean": lambda p, w: "I've never once been overdrawn, but I know a few bad months would empty the account faster than people think.",
    "layoff": lambda p, w: f"If {_work_word(p)} let me go, I'm honestly not sure how long the money would last.",
    "loan_stress": lambda p, w: "The loan payment takes such a big bite every month that I feel it before anything else.",
    "timing_dips": lambda p, w: "There's money coming, it just never seems to land before the bills do.",
    "penalty_interest": lambda p, w: "I keep paying the bank interest for being a few days short, and it feels like throwing money away.",
    "income_volatile": lambda p, w: "I never quite know what next month will bring in, so I can't plan the way other people do.",
    "cash_economy": lambda p, w: "Most of what I earn is cash and it's uneven, so I'm always a bit unsure where I stand.",
    "lifestyle_creep": lambda p, w: "Spending keeps creeping up and I can't point to where it's going.",
    "rent_pressure": lambda p, w: "Housing costs keep taking a bigger slice, and my pay isn't keeping up.",
    "balance_sliding": lambda p, w: "The balance has been sliding for a year and I keep telling myself it's fine.",
    "fee_bleed": lambda p, w: "The bank fees add up more than I'd like to admit.",
    "no_adjustment_when_hit": lambda p, w: "Last time money got tight I didn't change much, and the savings took the hit.",
    "slow_recovery": lambda p, w: "It took ages to get back on my feet last time, and I'm not sure I could do it twice.",
}


def draft_quote(kind: str, persona: dict, item: dict) -> str:
    table = GOAL_TEMPLATES if kind == "goal" else WORRY_TEMPLATES
    key = item.get("type") or item.get("key") or ""
    fn = table.get(key)
    if fn is None and kind == "goal":
        return f"{item.get('label', 'This')} matters to me, and I'd like a plan I can actually stick to."
    if fn is None:
        return f"{item.get('label', 'This')} is on my mind more than I'd like."
    return fn(persona, item)


VOICE_INSTRUCTION = """You write one-sentence quotes in the voice of a fictional person, for a financial planning app.
You get the person (age, life stage, occupation guess, household, where they live, their story) and a list of goals and
worries, each with a draft quote and the evidence behind it. Rewrite each quote as this specific person would actually
say it out loud: first person, natural, warm, specific to their life, at most 26 words, no clichés, no exclamation marks.
Do not add any number, amount, date or percentage that is not already in the draft quote. Keep each item's id.
Return JSON only: {"quotes": [{"id": str, "quote": str}]}"""


def _digits(s: str) -> set[str]:
    return set(re.findall(r"\d[\d,.]*", s or ""))


def model_quotes(persona: dict, items: list[dict]) -> dict[str, str]:
    from .adk_runtime import LlmAgent, adk_available, json_block, run_agent
    from .. import config
    if not adk_available() or not items:
        return {}
    agent = LlmAgent(name="persona_builder", model=config.GEMINI_MODEL, instruction=VOICE_INSTRUCTION)
    who = {k: persona.get(k) for k in ("display_name", "age", "life_stage", "household", "home", "story")}
    who["occupation_guess"] = (persona.get("occupation") or {}).get("label")
    payload = json.dumps({"person": who, "items": [{k: i[k] for k in ("id", "kind", "label", "evidence", "draft")} for i in items]}, default=str)
    out = json_block(" ".join(run_agent(agent, payload, user_id=f"voice-{persona.get('account_id')}").get("texts", {}).get("persona_builder", [])))
    drafts = {i["id"]: i["draft"] for i in items}
    result = {}
    for q in (out or {}).get("quotes") or []:
        qid, text = q.get("id"), q.get("quote")
        if qid in drafts and isinstance(text, str) and 10 < len(text) < 220 and _digits(text) <= _digits(drafts[qid]):
            result[qid] = text.strip().strip('"').strip("“”")
    return result


def quote_key(kind: str, item: dict) -> str:
    return f"{kind}:{item.get('type') or item.get('key') or item.get('label')}"


def quotes_for(account_id: int, persona: dict, goals: list[dict], worries: list[dict]) -> dict[str, str]:
    """Stored model quotes where available, else code drafts; kicks off the model rewrite once in the background."""
    stored = (persona or {}).get("quotes") or {}
    out = {}
    pending = []
    for kind, items in (("goal", goals), ("worry", worries)):
        for it in items:
            k = quote_key(kind, it)
            draft = draft_quote(kind, persona or {}, it)
            out[k] = stored.get(k) or draft
            if k not in stored:
                pending.append({"id": k, "kind": kind, "label": it.get("label", ""), "evidence": it.get("evidence", ""), "draft": draft})
    if pending:
        _start_rewrite(account_id, persona or {}, pending)
    return out


def _start_rewrite(account_id: int, persona: dict, pending: list[dict]) -> None:
    from .adk_runtime import adk_available
    if not adk_available():
        return
    with _LOCK:
        tried = _TRIED.setdefault(account_id, set())
        pending = [x for x in pending if x["id"] not in tried]
        if account_id in _RUNNING or not pending:
            return
        _RUNNING.add(account_id)
        tried.update(x["id"] for x in pending)

    def work():
        try:
            got = model_quotes(persona, pending)
            if not got:
                return
            with cm._LOCK:
                ctx = cm.load_context(account_id)
                p = ctx.get("persona")
                if not p:
                    return
                p.setdefault("quotes", {}).update(got)
                ctx["persona"] = p
                cm.save_context(ctx)
        except Exception as e:  # pragma: no cover - network
            logging.getLogger("pulp.persona").warning("voice rewrite failed: %s", e)
        finally:
            with _LOCK:
                _RUNNING.discard(account_id)
    threading.Thread(target=work, daemon=True).start()
