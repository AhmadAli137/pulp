"""Profile Narrator: three or four grounded sentences about one account, from its flags and archetype.

Two implementations with the same output shape:
  template : deterministic sentences built from the flag evidence (always available)
  gemini   : an ADK LlmAgent that may only talk about the flags it is given; every sentence must name the flag it
             rests on, or it is dropped and the template sentence takes its place.
Narratives are cached per account and invalidated when the flag set changes.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pydantic import BaseModel, Field

from .. import config
from .adk_runtime import LlmAgent, adk_available, agent_output, run_agent
from .archetypes import archetype_for
from .features import account_feature_summary, flags_for, get_features


class Insight(BaseModel):
    text: str = Field(description="One sentence, second person, plain words")
    flag: str = Field(description="The flag key this sentence rests on")


class Narrative(BaseModel):
    headline: str = Field(description="At most 12 words, the single most useful thing to know")
    insights: list[Insight]


NARRATOR_INSTRUCTION = """You are PULP's Profile Narrator. You write for the account holder, in the second person, in plain words.
You receive JSON: the account's official numbers, its flags (each with a key, a label, the evidence in numbers and a
plain-language insight), and the behavioural archetype it belongs to with a confidence.

Write a headline of at most 12 words and three or four sentences, the way a friend who is good with money would say them
out loud. Each sentence must rest on exactly one flag and name that flag's key in the "flag" field. At most one number per
sentence, taken from the evidence strings; prefer the habit or the decision over the metric. Prefer the non-obvious: a
timing habit over "you spend a lot", a transfer to another bank over the balance, a trend over a level. Do not give
advice beyond what the flag's own insight says. Never mention the archetype's occupation guess as a fact; if you use it,
say it is a guess. If there are no flags, write one sentence saying the account shows no notable pattern."""


def template_narrative(flags: list[dict], archetype: dict | None) -> dict:
    insights = [{"text": f"{fl['insight'][0].upper()}{fl['insight'][1:]}: {fl['evidence']}.", "flag": fl["key"]} for fl in flags[:4]]
    if not insights:
        insights = [{"text": "Nothing in the record stands out: inflow, spending and balance all sit in the typical range.", "flag": "none"}]
    headline = flags[0]["label"] if flags else "A typical account with no notable pattern"
    if archetype and archetype.get("name"):
        insights.append({"text": f"Your money behaves like the '{archetype['name']}' group ({archetype['share']:.0%} of accounts), "
                                 f"{archetype['survive6_layoff_pct']:.0f}% of whom would last six months on 55% income.", "flag": "archetype"})
    return {"headline": headline, "insights": insights, "source": "template"}


def _cache_path(account_id: int) -> Path:
    return config.DERIVED_WRITE_DIR / "narratives" / f"{int(account_id)}.json"


def _signature(flags: list[dict], archetype: dict | None) -> str:
    raw = json.dumps({"f": [{"key": fl["key"], "evidence": fl["evidence"]} for fl in flags], "a": (archetype or {}).get("name"), "m": config.GEMINI_MODEL}, sort_keys=True)
    return hashlib.sha1(raw.encode()).hexdigest()[:12]


def gemini_narrative(account_id: int, facts: dict, flags: list[dict], archetype: dict | None) -> dict | None:
    payload = json.dumps({"account": facts, "flags": flags, "archetype": archetype}, default=float)
    agent = LlmAgent(name="profile_narrator", model=config.GEMINI_MODEL, description="Writes grounded insight sentences for one account.",
                     instruction=NARRATOR_INSTRUCTION, output_schema=Narrative, output_key="profile_narrator")
    res = run_agent(agent, payload, user_id=f"acct-{account_id}")
    parsed = agent_output(res, "profile_narrator")
    nar = Narrative.model_validate(parsed)
    allowed = {fl["key"] for fl in flags} | {"none", "archetype"}
    kept = [i.model_dump() for i in nar.insights if i.flag in allowed][:4]
    if not kept:
        return None
    return {"headline": nar.headline[:120], "insights": kept, "source": f"google-adk/{config.GEMINI_MODEL}"}


def narrative_for(account_id: int, use_ai: bool = True) -> dict:
    f = get_features()
    row = f.loc[int(account_id)]
    flags = flags_for(row)
    archetype = archetype_for(account_id)
    facts = {"I": float(row.I), "S": float(row.S), "B": float(row.B), "months": int(row.months),
             "runway_layoff_months": None if not (row.runway_layoff < float("inf")) else round(float(row.runway_layoff), 1)}
    sig = _signature(flags, archetype)
    out: dict = {"account_id": int(account_id), "flags": flags, "archetype": archetype, "features": account_feature_summary(f, int(account_id))}

    narrative = None
    if use_ai and adk_available():
        p = _cache_path(account_id)
        if p.exists():
            try:
                cached = json.loads(p.read_text(encoding="utf-8"))
                if cached.get("signature") == sig:
                    narrative = cached["narrative"]
            except Exception:
                narrative = None
        if narrative is None:
            try:
                narrative = gemini_narrative(account_id, facts, flags, archetype)
                if narrative:
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text(json.dumps({"signature": sig, "narrative": narrative}), encoding="utf-8")
            except Exception as exc:
                out["narrator_error"] = f"{type(exc).__name__}: {exc}"[:300]
                narrative = None
    out["narrative"] = narrative or template_narrative(flags, archetype)
    from .decision_profile import build_decision_profile
    from .data_store import get_store
    from . import context_manager as cm
    out["decision_profile"] = build_decision_profile(get_store().monthly_for(account_id), row, cm.summarize(cm.load_context(account_id)))
    return out
