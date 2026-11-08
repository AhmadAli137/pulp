"""Stage 1 Persona Builder: a realistic but fictional life for an anonymized account, consistent with its records.

The demo cannot show a long voice intake, so PULP starts every account with a plausible person: an occupation guess,
a household, a home, goals (small or large, short to long term, weighted by importance and urgency), worries and the
questions Pulp should ask first. The person is clearly marked fictional. Every amount comes from code (multiples of the
account's own spending S and income I); a model, when available, only rewrites the words and may adjust importance.

The persona seeds the profile directly (goals and concerns) through context_manager.apply_now, so every item shows
in the profile log as written by the Persona Builder and can be undone.
"""
from __future__ import annotations

import json
import logging
import math
import threading
import time
from datetime import datetime, timezone
from typing import Any

from . import context_manager as cm

URGENCY = {"short": 1.0, "medium": 0.75, "long": 0.5}
NAMES_F = ["Maya Chen", "Priya Sharma", "Élise Tremblay", "Amara Okafor", "Sofia Rossi", "Hannah Kowalski", "Leila Haddad",
           "Grace MacLeod", "Nadia Petrov", "Aisha Rahman", "Claire Gagnon", "Mei Lin", "Rosa Alvarez", "Jasmine Singh"]
NAMES_M = ["Daniel Okoye", "Arjun Patel", "Marc Bouchard", "Liam O'Connor", "Omar Farouk", "Tomasz Nowak", "Kenji Sato",
           "Ethan Campbell", "Mateo Silva", "Samuel Mensah", "Luc Pelletier", "Ravi Gill", "Noah Fraser", "Hassan Ali"]
_BUILDING: set[int] = set()
_LOCK = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _f(row: Any, key: str, default: float = 0.0) -> float:
    try:
        v = float(row.get(key, default))
        return v if math.isfinite(v) else default
    except (TypeError, ValueError):
        return default


def _m(x: float) -> str:
    return f"${x:,.0f}"


def _round_amount(x: float) -> float:
    step = 500 if x < 20000 else 1000 if x < 100000 else 5000
    return float(max(step, round(x / step) * step))


# ----------------------------------------------------------------------------- the template persona (code)
def _life_stage(age: float | None, pension: bool) -> str:
    if pension or (age and age >= 65):
        return "Retired"
    if age is None:
        return "Working age"
    if age < 25:
        return "Starting out"
    if age < 35:
        return "Building a career"
    if age < 50:
        return "Mid-career, running a household"
    return "Late career, planning for retirement"


def _occupation(row: Any, arch: dict | None) -> dict:
    pension = _f(row, "pension_share")
    cash = _f(row, "cash_deposit_share")
    transfers = _f(row, "transfer_in_share")
    cv = _f(row, "income_cv")
    regular = _f(row, "inflow_regular_share")
    rel = _f(row, "inflow_vs_district_salary")
    if pension >= 0.5:
        return {"label": "Retired, living mainly on a pension", "confidence": 0.85,
                "evidence": f"{pension:.0%} of money in is labelled pension"}
    if cash >= 0.8 and cv >= 0.5:
        return {"label": "Self-employed or paid in cash for irregular work (trades, hospitality, a small business)", "confidence": 0.6,
                "evidence": f"{cash:.0%} of money in is cash deposits and it swings month to month (volatility {cv:.2f})"}
    if cash >= 0.8:
        return {"label": "Paid a steady wage in cash, likely a trade, retail or service job", "confidence": 0.55,
                "evidence": f"{cash:.0%} of money in is cash deposits, regular in {regular:.0%} of months"}
    if transfers >= 0.5 and regular >= 0.7:
        label = "Salaried employee, likely a professional or office role" if rel >= 1.2 else "Salaried employee"
        return {"label": label, "confidence": 0.7,
                "evidence": f"{transfers:.0%} of money in arrives by transfer, within 20% of the usual amount in {regular:.0%} of months"}
    occ = (arch or {}).get("likely_occupation") or "Working, with mixed sources of income"
    return {"label": occ, "confidence": round(0.5 * float((arch or {}).get("confidence") or 0.6), 2),
            "evidence": f"Taken from the '{(arch or {}).get('name', 'similar accounts')}' group this account belongs to"}


def _goal(gid: str, label: str, gtype: str, size: str, horizon: str, target: float, months: int, importance: int, why: str,
          evidence: str) -> dict:
    return {"id": gid, "type": gtype, "label": label, "size": size, "horizon": horizon, "target_amount": _round_amount(target),
            "target_months": int(months), "importance": int(importance), "why": why, "evidence": evidence, "source": "persona"}


def _goals(row: Any, age: float | None, pension: bool, joint: bool) -> list[dict]:
    S, I, B, P = (_f(row, k) for k in ("S", "I", "B", "P"))
    S = max(S, 1.0)
    months_of_cushion = B / S
    surplus = I - S
    goals: list[dict] = []
    cushion_imp = 5 if months_of_cushion < 3 else 4 if months_of_cushion < 6 else 2
    goals.append(_goal("emergency_fund", "Three more months of spending put aside", "emergency_fund", "large" if S * 3 > 15000 else "small",
                       "medium", 3 * S, 18, cushion_imp, "A cushion that lasts through a job loss is the base every other goal sits on.",
                       f"Today's cushion is {_m(B)}, {months_of_cushion:.1f} months of spending"))
    a = age or 40
    if pension or a >= 65:
        goals.append(_goal("travel", "A trip to see family", "travel", "small", "short", 1.5 * S, 10, 3,
                           "Retirement is when there is time for it, if the money is set aside first.", "Recorded income is mainly a pension"))
        goals.append(_goal("care_fund", "A fund for home repairs and care", "care", "large", "long", 6 * S, 48, 4,
                           "Health and home costs rise later in life and are hard to cut.", f"Age about {a:.0f}"))
    else:
        if a < 30:
            goals.append(_goal("move_out", "Deposit and first month for a place of my own" if not joint else "Deposit on a bigger rental",
                               "housing_move", "small", "short", 2 * S, 9, 4, "Moving out or up is the next step at this age.",
                               f"Age about {a:.0f}"))
        if a < 45:
            goals.append(_goal("home_down_payment", "Down payment on a first home", "home", "large", "long", min(24 * S, 120000), 60,
                               4 if surplus > 0 else 3, "Owning a home is the largest goal most people this age have.",
                               f"Age about {a:.0f}; money left over in a typical month: {_m(surplus)}"))
        if joint and 27 <= a <= 48:
            goals.append(_goal("education_fund", "An education fund for the kids (RESP)", "education", "large", "long", 10 * S, 72, 3,
                               "A joint account at this age often means a family to plan for.", "Two people can use this account"))
        if a >= 45:
            goals.append(_goal("retirement", "Top up retirement savings", "retirement", "large", "long", 18 * S, 84, 4,
                               "The years before retirement are when saving counts most.", f"Age about {a:.0f}"))
    dec = _f(row, "december_spend_ratio")
    if dec >= 1.3:
        goals.append(_goal("holidays", "Get through December without dipping into savings", "holidays", "small", "short",
                           max(0.0, dec - 1.0) * S, 12, 2, "December costs reliably more than other months.",
                           f"December spending is {dec:.1f}x a normal month"))
    if P > 0:
        goals.append(_goal("loan_payoff", "Pay down the loan faster", "debt", "large", "medium", 6 * P, 30, 3,
                           "Every month the loan is gone frees its payment for something else.", f"Loan payment {_m(P)} a month"))
    if _f(row, "lifestyle_creep") >= 0.005:
        goals.append(_goal("spending_reset", "Bring spending back to last year's level", "spending", "small", "short", 1 * S, 6, 3,
                           "Spending has been creeping up faster than income.", "Spending drift above income drift over 24 months"))
    return with_weights(_personalize(goals, row))


GENERAL_LONG = ("home", "retirement", "education", "care")


def _personalize(general: list[dict], row: Any) -> list[dict]:
    """Mix general goals with goals tied to this account's own records (goal_ideas): a personal cushion goal replaces the
    generic emergency fund, up to three personal ideas follow, and one general long-term goal is kept if there is room."""
    try:
        from .goal_ideas import ranked
        personal = ranked(int(row.name), "balanced")
    except Exception:
        personal = []
    for g in general:
        g["personal"] = False
    cushion = next((p for p in personal if p["type"] == "emergency_fund"), None)
    out = [cushion] if cushion else [g for g in general if g["type"] == "emergency_fund"][:1]
    taken = {g["type"] for g in out}
    for p in personal:
        if len(out) >= 4:
            break
        if p["type"] not in taken:
            out.append(p)
            taken.add(p["type"])
    # the fifth slot: a personal long-range goal (life or growth) if there is one, else a general long-term goal
    extra = next((p for p in personal if p["type"] not in taken and p.get("family") in ("life", "growth")), None)
    if extra and len(out) < 5:
        out.append(extra)
        taken.add(extra["type"])
    for g in general:
        if len(out) >= 5:
            break
        if g["type"] in GENERAL_LONG and g["type"] not in taken:
            out.append(g)
            taken.add(g["type"])
    for g in general:
        if len(out) >= 4:
            break
        if g["type"] not in taken:
            out.append(g)
            taken.add(g["type"])
    for g in out:
        for k in ("family", "relevance", "signal", "lens_score", "in_profile", "key"):
            g.pop(k, None)
    return out[:5]


def with_weights(goals: list[dict]) -> list[dict]:
    total = sum(float(g.get("importance") or 3) * URGENCY.get(g.get("horizon") or "medium", 0.75) for g in goals) or 1.0
    for g in goals:
        g["weight"] = round(float(g.get("importance") or 3) * URGENCY.get(g.get("horizon") or "medium", 0.75) / total, 4)
    return goals


def _worries(row: Any, flags: list[dict]) -> list[dict]:
    out = []
    for fl in flags:
        if fl["severity"] in ("risk", "watch"):
            out.append({"label": fl["label"], "type": fl["key"], "evidence": fl["evidence"]})
    un22, un23 = _f(row, "district_unemployment"), None
    if not _f(row, "survives6_layoff", 1.0):
        out.append({"label": "Whether the cushion would last through a layoff", "type": "layoff",
                    "evidence": f"On 55% of income the cushion lasts {_f(row, 'runway_layoff'):.1f} months"})
    return out[:4]


def _questions(row: Any, goals: list[dict], flags: list[dict]) -> list[dict]:
    qs = []
    keys = {f["key"] for f in flags}
    big = next((g for g in goals if g["size"] == "large" and g["type"] != "emergency_fund"), None)
    if big:
        qs.append({"key": f"goal_{big['id']}", "text": f"Would you keep “{big['label']}” as a goal, and by when?",
                   "why": f"It carries {big['weight']:.0%} of the weight in your plans, so getting it right changes the plan most."})
    if "savings_elsewhere" in keys:
        qs.append({"key": "transfer_purpose", "text": f"Where does the steady {_m(max(_f(row, 'recurring_partner_amount'), _f(row, 'regular_transfer_out_amount')))} a month go?",
                   "why": "If it is savings you can reach, your cushion is bigger than the bank sees; if it is support for someone, it cannot be paused."})
    if keys & {"penalty_interest", "timing_dips"}:
        qs.append({"key": "bill_dates", "text": "Can any of your bills be moved to after payday?",
                   "why": "The account goes below zero on timing, not shortage, and pays interest for it."})
    if keys & {"income_volatile", "cash_economy"}:
        qs.append({"key": "income_source", "text": "What does your income depend on month to month?",
                   "why": "Uneven income means the cushion has to do more work."})
    qs.append({"key": "job_security", "text": "How secure does your income feel for the next year?",
               "why": "It decides how heavily the plans weigh a strong cushion against your goals."})
    return qs[:4]


def _traits(account_id: int) -> list[dict]:
    from .features import account_feature_summary, get_features
    f = get_features()
    summ = account_feature_summary(f, account_id)
    labels = {
        "spending_ratio": ("Spends of income", lambda v: f"{v:.0%}"),
        "B": ("Cash cushion", _m), "I": ("Money in a month", _m),
        "income_cv": ("How much income swings", lambda v: f"{v:.2f}"),
        "cash_wd_share": ("Spending taken as cash", lambda v: f"{v:.0%}"),
        "fee_months_share": ("Months with a bank fee", lambda v: f"{v:.0%}"),
        "lifestyle_creep": ("Spending growth over income growth", lambda v: f"{v * 100:+.1f} pts a month"),
        "balance_trend_pm": ("Cushion trend", lambda v: f"{v * 100:+.1f}% a month"),
        "owner_age": ("Age", lambda v: f"{v:.0f}"),
        "account_age_years": ("Years with the bank", lambda v: f"{v:.1f}"),
        "inflow_vs_district_salary": ("Income against the local average salary", lambda v: f"{v:.1f}x"),
        "runway_layoff": ("Months a layoff cushion lasts", lambda v: f"{v:.1f}" if v < 120 else "120+"),
    }
    rows = []
    for k, (label, fmt) in labels.items():
        d = summ.get(k)
        if not d or d.get("value") is None or d.get("percentile") is None:
            continue
        p = d["percentile"]
        note = ("higher than most accounts" if p >= 80 else "lower than most accounts" if p <= 20 else "close to typical")
        rows.append({"label": label, "value": fmt(d["value"]), "percentile": round(p), "note": note, "_extreme": abs(p - 50)})
    rows.sort(key=lambda r: -r["_extreme"])
    for r in rows:
        r.pop("_extreme")
    return rows[:6]


def build_template(account_id: int) -> tuple[dict, list[dict]]:
    """Persona and its Stage 1 trace, from code only."""
    from .archetypes import archetype_for
    from .features import flags_for, get_features
    t0 = time.perf_counter()
    trace: list[dict] = []

    def ev(kind, title, to=None, items=None, data=None, agent="persona_builder"):
        e = {"t": round(time.perf_counter() - t0, 3), "stage": 1, "agent": agent, "kind": kind, "title": title}
        if to:
            e["to"] = to
        if items:
            e["items"] = [str(i)[:160] for i in items][:10]
        if data:
            e["data"] = data
        trace.append(e)

    f = get_features()
    if account_id not in f.index:
        raise KeyError(account_id)
    row = f.loc[account_id]
    arch = archetype_for(account_id)
    flags = flags_for(row)
    ev("start", "Reading the account's signals, flags and group", items=[f"{len(f.columns)} signals", f"{len(flags)} flags",
       f"group: {(arch or {}).get('name', 'unknown')}"])
    age = _f(row, "owner_age") or None
    pension = _f(row, "pension_share") >= 0.5
    joint = _f(row, "n_authorized_users") > 0
    gender = str(row.get("owner_gender") or "")
    pool = NAMES_F if gender == "F" else NAMES_M if gender == "M" else NAMES_F + NAMES_M
    name = pool[account_id % len(pool)]
    occ = _occupation(row, arch)
    ev("tool_call", "Guessing the occupation from how money arrives", items=[occ["label"], occ["evidence"]],
       data={"confidence": occ["confidence"]})
    district = str(row.get("district_name") or row.get("owner_home_district_name") or "their district")
    from .data_store import get_store
    region = ""
    try:
        d = get_store().districts.set_index("district_id")
        region = str(d.loc[int(row.get("district_id")), "region"])
        urban = float(d.loc[int(row.get("district_id")), "urban_ratio_pct"])
    except Exception:
        urban = float("nan")
    place = "a city district" if urban >= 70 else "a mostly rural district" if urban == urban else "their district"
    home = f"Lives in {district}" + (f" ({region})" if region else "") + f", {place}"
    household = ("Shares the account with a partner or family member" if joint else "Manages money alone") + \
                (", with a credit card" if _f(row, "card_rank") >= 2 else "")
    goals = _goals(row, age, pension, joint)
    ev("tool_call", f"Proposed {len(goals)} goals sized from the account's own spending",
       items=[f"{g['label']}: {_m(g['target_amount'])} in {g['target_months']} months, importance {g['importance']}, weight {g['weight']:.0%}" for g in goals])
    worries = _worries(row, flags)
    questions = _questions(row, goals, flags)
    traits = _traits(account_id)
    like = {"archetype": (arch or {}).get("name", "Typical accounts"), "share": float((arch or {}).get("share") or 0),
            "survive6_layoff_pct": float((arch or {}).get("survive6_layoff_pct") or 0), "peers_n": int((arch or {}).get("size") or 0),
            "note": (arch or {}).get("description") or ""}
    stage = _life_stage(age, pension)
    first = name.split()[0]
    occ_l = occ["label"][0].lower() + occ["label"][1:]
    story = (f"{first} is {f'{age:.0f}' if age else 'of working age'}, {stage.lower()}. Our best guess from the records: {occ_l}. "
             f"{'They share the account with someone' if joint else 'They manage their money alone'}, and in a typical month "
             f"{_m(_f(row, 'I'))} comes in and {_m(_f(row, 'S'))} goes out, leaving a cushion of {_m(_f(row, 'B'))}. "
             f"What they want most right now: {goals[0]['label'].lower()}" + (f" and {goals[1]['label'].lower()}." if len(goals) > 1 else "."))
    persona = {
        "account_id": int(account_id), "fictional": True, "source": "template", "built_at": _now(),
        "display_name": name, "age": round(age) if age else None, "life_stage": stage, "occupation": occ,
        "household": household, "home": home, "story": story, "goals": goals, "worries": worries, "questions": questions,
        "traits": traits, "like_others": like, "goals_version": GOALS_VERSION,
    }
    ev("output", f"Built a fictional profile: {name}, {stage.lower()}", items=[story])
    ev("handoff", f"{len(goals)} goals, {len(worries)} worries", to="shock_generator",
       data={"goals": len(goals), "worries": len(worries)})
    return persona, trace


# ----------------------------------------------------------------------------- optional model refinement
PERSONA_INSTRUCTION = """You are PULP's Persona Builder, a biographer. You receive the facts about one anonymized bank account
and a draft fictional persona built by code. Make the persona feel like a real, specific person who is consistent with every
fact, without inventing any amounts. You may: rewrite the story (3 sentences, third person, warm and specific, no numbers
other than those in the draft), refine the occupation label (keep it a guess), rewrite goal labels and their "why"
(keep each goal's id, type, size, horizon, target_amount and target_months unchanged), change a goal's importance (1-5)
if the facts justify it, rewrite worries and the first questions Pulp should ask (keep their keys). Return only JSON:
{"story": str, "occupation_label": str, "goals": [{"id": str, "label": str, "why": str, "importance": int}],
 "worries": [{"type": str, "label": str}], "questions": [{"key": str, "text": str, "why": str}]}"""


def refine_with_model(account_id: int, persona: dict) -> tuple[dict, list[dict]] | None:
    from .adk_runtime import LlmAgent, adk_available, json_block, run_agent
    from .. import config
    if not adk_available():
        return None
    from .features import flags_for, get_features
    row = get_features().loc[account_id]
    facts = {k: (round(float(row[k]), 3) if isinstance(row.get(k), (int, float)) and math.isfinite(float(row[k])) else str(row.get(k)))
             for k in ("I", "S", "B", "H", "P", "spending_ratio", "income_cv", "pension_share", "cash_deposit_share", "transfer_in_share",
                       "owner_age", "owner_gender", "n_authorized_users", "card_rank", "district_name", "district_salary",
                       "district_unemployment", "december_spend_ratio", "shock_episodes", "runway_layoff") if k in row.index}
    facts["flags"] = [{"key": f["key"], "evidence": f["evidence"]} for f in flags_for(row)]
    draft = {k: persona[k] for k in ("display_name", "age", "life_stage", "occupation", "household", "home", "story", "goals", "worries", "questions")}
    agent = LlmAgent(name="persona_builder", model=config.GEMINI_MODEL, instruction=PERSONA_INSTRUCTION)
    t0 = time.perf_counter()
    out = json_block(" ".join(run_agent(agent, json.dumps({"facts": facts, "draft": draft}, default=str),
                                        user_id=f"persona-{account_id}").get("texts", {}).get("persona_builder", [])))
    if not out:
        return None
    trace = [{"t": round(time.perf_counter() - t0, 3), "stage": 1, "agent": "persona_builder", "kind": "tool_result",
              "title": f"Gemini refined the persona in {time.perf_counter() - t0:.1f}s", "data": {"model": config.GEMINI_MODEL}}]
    new = json.loads(json.dumps(persona))
    if isinstance(out.get("story"), str) and 40 < len(out["story"]) < 900:
        new["story"] = out["story"].strip()
    if isinstance(out.get("occupation_label"), str) and 3 < len(out["occupation_label"]) < 140:
        new["occupation"] = {**new["occupation"], "label": out["occupation_label"].strip()}
    by_id = {g["id"]: g for g in new["goals"]}
    for g in out.get("goals") or []:
        tgt = by_id.get(g.get("id"))
        if not tgt:
            continue
        if isinstance(g.get("label"), str) and 3 < len(g["label"]) < 90:
            tgt["label"] = g["label"].strip()
        if isinstance(g.get("why"), str) and len(g["why"]) < 300:
            tgt["why"] = g["why"].strip()
        if isinstance(g.get("importance"), int) and 1 <= g["importance"] <= 5:
            tgt["importance"] = g["importance"]
    with_weights(new["goals"])
    wq = {q["key"]: q for q in new["questions"]}
    for q in out.get("questions") or []:
        if q.get("key") in wq and isinstance(q.get("text"), str) and len(q["text"]) < 200:
            wq[q["key"]].update({"text": q["text"].strip(), "why": str(q.get("why") or wq[q["key"]]["why"])[:300]})
    ww = {w["type"]: w for w in new["worries"]}
    for w in out.get("worries") or []:
        if w.get("type") in ww and isinstance(w.get("label"), str) and len(w["label"]) < 140:
            ww[w["type"]]["label"] = w["label"].strip()
    new["source"] = f"google-adk/{config.GEMINI_MODEL}"
    return new, trace


# ----------------------------------------------------------------------------- seeding the profile
def _goal_change(g: dict, op: str = "add") -> dict:
    value = {k: g[k] for k in ("type", "label", "size", "horizon", "target_amount", "target_months", "importance", "why", "evidence", "source", "personal") if k in g}
    value["id"] = g["id"]
    return {"field": "goals", "operation": op, "value": value, "reason": g.get("why", "")}


def seed(account_id: int, persona: dict) -> list[dict]:
    ctx = cm.load_context(account_id)
    have = {x.get("value", {}).get("type") for x in ctx.get("goals", [])}
    changes = [_goal_change(g) for g in persona["goals"] if g["type"] not in have]
    have_c = {x.get("value", {}).get("type") for x in ctx.get("concerns", [])}
    changes += [{"field": "concerns", "operation": "add", "value": {"type": w["type"], "label": w["label"], "evidence": w["evidence"], "source": "persona"},
                 "reason": w["evidence"]} for w in persona["worries"] if w["type"] not in have_c]
    if not changes:
        return []
    res = cm.apply_now(account_id, changes, agent="persona_builder",
                       reason="Starting profile built from the account's records (fictional, editable)", kind="seed")
    return res["changes"]


def _refine_later(account_id: int, persona: dict) -> None:
    try:
        res = refine_with_model(account_id, persona)
        if not res:
            return
        new, trace = res
        ctx = cm.load_context(account_id)
        changes = []
        old = {g["id"]: g for g in persona["goals"]}
        for g in new["goals"]:
            o = old.get(g["id"])
            if o and (o["label"] != g["label"] or o["importance"] != g["importance"]):
                item = next((x for x in ctx.get("goals", []) if x.get("value", {}).get("type") == g["type"]
                             and x.get("value", {}).get("source") == "persona"), None)
                if item:
                    ch = _goal_change(g, "update")
                    ch["target_id"] = item["id"]
                    ch["reason"] = f"Persona Builder refined this goal: {g.get('why', '')}"[:300]
                    changes.append(ch)
        if changes:
            cm.apply_now(account_id, changes, agent="persona_builder", reason="Refined by the Persona Builder model")
        cur = cm.load_context(account_id)
        cur["persona"] = new
        cur["persona_trace"] = (cur.get("persona_trace") or []) + trace
        with cm._LOCK:
            fresh = cm.load_context(account_id)
            fresh["persona"] = new
            fresh["persona_trace"] = cur["persona_trace"]
            cm.save_context(fresh)
    except Exception as e:  # pragma: no cover - network
        logging.getLogger("pulp.persona").warning("persona refinement failed: %s", e)
    finally:
        with _LOCK:
            _BUILDING.discard(account_id)


GOALS_VERSION = 2


def _upgrade_goals(account_id: int, persona: dict) -> dict:
    """Personas built before personal goals existed get up to three, once, logged as Persona Builder additions."""
    from .goal_ideas import ranked
    ctx = cm.load_context(account_id)
    have = {x.get("value", {}).get("type") for x in ctx.get("goals", [])}
    adds = [g for g in ranked(account_id, "balanced") if g["type"] not in have][:3]
    changes = []
    for g in adds:
        ch = _goal_change(g)
        ch["value"]["personal"] = True
        ch["reason"] = f"Personal goal from your records: {g['evidence']}"
        changes.append(ch)
    if changes:
        cm.apply_now(account_id, changes, agent="persona_builder", reason="Personal goals from your records")
    with cm._LOCK:
        fresh = cm.load_context(account_id)
        p = fresh.get("persona") or persona
        p["goals_version"] = GOALS_VERSION
        p["goals"] = (p.get("goals") or []) + [{k: v for k, v in g.items() if k not in ("family", "relevance", "signal", "lens_score", "in_profile", "key")} for g in adds]
        with_weights(p["goals"])
        fresh["persona"] = p
        cm.save_context(fresh)
    return p


def get_persona(account_id: int, build: bool = True, refine: bool = True) -> dict | None:
    """The stored persona; on first call build it from code, seed the profile, and refine it in the background."""
    ctx = cm.load_context(account_id)
    if ctx.get("persona") and ctx["persona"].get("goals_version", 1) < GOALS_VERSION and build:
        try:
            return _upgrade_goals(account_id, ctx["persona"])
        except Exception:
            return ctx["persona"]
    if ctx.get("persona") or not build:
        return ctx.get("persona")
    persona, trace = build_template(account_id)
    with cm._LOCK:
        fresh = cm.load_context(account_id)
        if fresh.get("persona"):
            return fresh["persona"]
        fresh["persona"] = persona
        fresh["persona_trace"] = trace
        cm.save_context(fresh)
    seed(account_id, persona)
    if refine:
        with _LOCK:
            start = account_id not in _BUILDING
            _BUILDING.add(account_id)
        if start:
            threading.Thread(target=_refine_later, args=(account_id, persona), daemon=True).start()
    return persona


def rebuild(account_id: int) -> dict:
    with cm._LOCK:
        ctx = cm.load_context(account_id)
        ctx.pop("persona", None)
        ctx.pop("persona_trace", None)
        cm.save_context(ctx)
    return get_persona(account_id)


# ----------------------------------------------------------------------------- the profile document
GOAL_DEFAULTS = {"emergency_fund": ("large", "medium", 18), "home": ("large", "long", 60), "retirement": ("large", "long", 84),
                 "education": ("large", "long", 72), "debt": ("large", "medium", 30)}


def profile_goals(ctx: dict, S: float) -> list[dict]:
    out = []
    for x in ctx.get("goals", []):
        if not x.get("confirmed", True):
            continue
        v = x.get("value", {})
        size, horizon, months = GOAL_DEFAULTS.get(v.get("type"), ("small", "short", 12))
        months = int(v.get("target_months") or months)
        horizon = v.get("horizon") or ("short" if months <= 12 else "medium" if months <= 36 else "long")
        target = float(v.get("target_amount") or v.get("amount") or (6 * S if v.get("type") == "emergency_fund" else 2 * S))
        out.append({"id": x["id"], "label": str(v.get("label") or v.get("type") or "Goal"), "type": str(v.get("type") or "goal"),
                    "size": v.get("size") or ("large" if target >= 6 * S else "small"), "horizon": horizon,
                    "target_amount": round(target, 2), "target_months": months, "importance": int(v.get("importance") or 3),
                    "why": str(v.get("why") or ""), "evidence": str(v.get("evidence") or ""), "personal": bool(v.get("personal")),
                    "source": v.get("source") if v.get("source") in ("persona", "conversation", "user") else
                    ("user" if x.get("proposed_by") in ("user_direct", "you") else "conversation")})
    return with_weights(out)


def profile_doc(account_id: int, build: bool = True) -> dict:
    from .features import get_features
    persona = get_persona(account_id, build=build)
    ctx = cm.load_context(account_id)
    S = float(get_features().loc[account_id, "S"]) if account_id in get_features().index else 0.0
    log = [{k: v for k, v in e.items() if k != "item_id"} for e in reversed(ctx.get("profile_log", []))]
    goals = profile_goals(ctx, S)
    if persona:
        from .persona_voice import quote_key, quotes_for
        persona = dict(persona)
        worries = [dict(w) for w in persona.get("worries", [])]
        quotes = quotes_for(account_id, persona, goals, worries)
        for g in goals:
            g["quote"] = quotes.get(quote_key("goal", g))
        for w in worries:
            w["quote"] = quotes.get(quote_key("worry", w))
        persona["worries"] = worries
        persona.pop("quotes", None)
    return {"account_id": int(account_id), "persona": persona, "goals": goals, "context": cm.summarize(ctx),
            "log": log, "version": ctx.get("context_version", 1), "refining": account_id in _BUILDING}
