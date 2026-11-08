"""Pulp explains a section of the app: the simplest, most relatable version, with this account's real numbers.

A page sends `explain:<topic>` (optionally `?r=&h=&o=&d=` for the shock on screen). Code gathers the facts for that topic
and writes a plain template with one everyday comparison. When a model is available, Pulp rewrites it warmly in two or
three short sentences; the rewrite is checked so it can only use numbers that are in the facts.
"""
from __future__ import annotations

import json
from typing import Any, Callable
from urllib.parse import parse_qs


def _m(x: float) -> str:
    return f"${abs(float(x)):,.0f}"


def _mo(x: float) -> str:
    x = float(x)
    return f"{x:.0f}" if abs(x - round(x)) < 0.05 else f"{x:.1f}"


def parse(message: str) -> tuple[str, dict]:
    body = message.split(":", 1)[1].split(" ", 1)[0].strip() if ":" in message else ""
    key, _, q = body.partition("?")
    params = {k: v[0] for k, v in parse_qs(q).items()}
    return key, params


def _shock(params: dict) -> dict:
    def f(k, d):
        try:
            return float(params.get(k, d))
        except ValueError:
            return d
    return {"r": f("r", 0.55), "h": f("h", 0.0), "one_off": f("o", 0.0), "duration": int(f("d", 6))}


def _report(m: Any, sh: dict) -> dict:
    from .tangerine_metrics import full_shock_report
    return full_shock_report(m, r=sh["r"], h=sh["h"], one_off=sh["one_off"], horizon_months=sh["duration"])


# ----------------------------------------------------------------------------- topics: (title, facts, template)
def t_month(a, m, p):
    I, S = m.typical_inflow, m.typical_spending
    f = {"in": _m(I), "out": _m(S), "left": _m(I - S)}
    if I >= S:
        t = (f"Think of your account like a bathtub. About {f['in']} pours in each month and {f['out']} drains out, "
             f"so roughly {f['left']} stays in the tub. Not much, but it's filling, not emptying.")
    else:
        t = (f"Think of your account like a bathtub with the drain open a bit wider than the tap: {f['in']} pours in, "
             f"{f['out']} drains out, so it loses about {f['left']} a month.")
    return "Your typical month", f, t


def t_cushion(a, m, p):
    B, S = m.buffer, m.typical_spending
    months = B / S if S else 0
    f = {"cushion": _m(B), "spending": _m(S), "months": _mo(months)}
    t = (f"Your cushion is the money already sitting in the account: {f['cushion']}. At your usual spending of {f['spending']} a month, "
         f"that's about {f['months']} months of life already paid for, like groceries stocked in the cupboard.")
    return "Your cushion", f, t


def t_runway(a, m, p):
    r = m.baseline_runway
    if r is None:
        return "Your runway", {}, ("Runway means how long your savings would last if more went out than came in. Right now more comes in than goes out, "
                                   "so there's no countdown at all.")
    f = {"runway": _mo(r)}
    return "Your runway", f, (f"Runway is how long the savings last when more goes out than comes in, like a phone battery. "
                              f"Yours would last about {f['runway']} months as things are.")


def t_discovery(a, m, p):
    from .discovery import discovery
    d = discovery(a).get("discovery") or {}
    f = {"finding": d.get("title", ""), "plain": d.get("plain", ""), "action": d.get("action", "")}
    return "The biggest discovery", f, f"{d.get('plain', '')} In plain terms: {d.get('action', '')}"


def t_shock(a, m, p):
    sh = _shock(p)
    rep = _report(m, sh)
    s = rep.get("shocked") or {}
    gap = float(s.get("monthly_gap") or 0)
    rw = s.get("runway")
    f = {"in_after": _m(s.get("income_after", 0)), "out_after": _m(s.get("spending_after", 0)), "gap": _m(gap), "cushion": _m(m.buffer),
         "months": sh["duration"], "runway": _mo(rw) if rw is not None and rw < 120 else "more than 120"}
    if gap <= 0:
        t = (f"Even with this shock, {f['in_after']} still comes in against {f['out_after']} going out, so your cushion isn't touched. "
             "It's like a smaller paycheque that still covers the rent.")
    elif rw is not None and rw < sh["duration"]:
        t = (f"With this shock you'd spend {f['gap']} more than comes in each month. Your {f['cushion']} cushion fills that hole for about "
             f"{f['runway']} months, but the shock lasts {f['months']}, like a battery that dies before the end of the day.")
    else:
        t = (f"With this shock you'd spend {f['gap']} more than comes in each month, and your {f['cushion']} cushion covers that for the whole "
             f"{f['months']} months. It gets lower, but it doesn't run dry.")
    return "What this shock does", f, t


def t_prepare(a, m, p):
    sh = _shock(p)
    g = _report(m, sh).get("goal_plan") or {}
    f = {"target": _m(g.get("cash_needed", 0)), "have": _m(g.get("current_buffer", 0)), "more": _m(g.get("additional_buffer_needed", 0)),
         "per_month": _m(g.get("capacity_to_save_per_month", 0)), "months": _mo(g.get("months_to_target") or 0)}
    if not g.get("additional_buffer_needed"):
        return "Prepare now", f, f"You already have the {f['target']} this shock would need set aside, so the plan is simply to keep it there."
    return "Prepare now", f, (f"To get through this shock you'd want {f['target']} set aside; you have {f['have']}, so {f['more']} more. "
                              f"Saving what's left over each month, about {f['per_month']}, that takes around {f['months']} months: slow, which is "
                              f"why the plans look for other ways to close it.")


def t_happens(a, m, p):
    sh = _shock(p)
    b = _report(m, sh).get("backup_plan") or {}
    f = {"free_up": _m(b.get("monthly_improvement_needed", 0)), "gap": _m(b.get("recurring_gap", 0)), "now": _m(b.get("immediate_need", 0))}
    t = (f"If it happens, the job is to shrink the monthly hole. You'd be {f['gap']} short a month; freeing up about {f['free_up']} a month "
         f"(spending less or earning a bit more) lets the cushion cover the rest, like bailing water fast enough that the boat stays afloat.")
    if b.get("immediate_need"):
        t = f"First, {f['now']} is needed straight away. " + t
    return "If it happens", f, t


def t_plan(a, m, p):
    from . import context_manager as cm
    lp = cm.load_context(a).get("life_plans") or {}
    best = next((x for x in lp.get("plans", []) if x.get("role") == "best_tradeoff"), None)
    if not best:
        return "Your plan", {}, "Run a shock first and Pulp will search for the plans that fit your life; then I can walk you through the best one."
    steps = [s["title"] for s in best.get("steps", [])]
    f = {"plan": best.get("name", ""), "steps": steps, "searched": (lp.get("search") or {}).get("generated", 0)}
    t = (f"Out of {f['searched']} possible plans, this is the best balance for you: {', then '.join(s.lower() for s in steps)}. "
         + ("It gets you through without running out." if best.get("survives") else "It helps a lot, though money still runs short at the end.")
         + " Think of it as a route: a few turns, in order, each one doing part of the work.")
    return "Your plan", f, t


def t_finalists(a, m, p):
    return "The four plans", {}, ("The agents tried hundreds of plans and kept four that are each best at something different: covering the gap, "
                                  "keeping the biggest cushion, getting furthest toward your goals, and the best mix of all three. "
                                  "Like four routes on a map: fastest, safest, most scenic and the best all-rounder.")


def t_goals(a, m, p):
    from .persona import profile_doc
    goals = sorted(profile_doc(a, build=False).get("goals", []), key=lambda g: -g["weight"])[:3]
    f = {"goals": [f"{g['label']} ({round(g['weight'] * 100)}%)" for g in goals]}
    top = goals[0] if goals else None
    t = ("Each goal gets a weight: how important it is, times how soon you want it. "
         + (f"Right now '{top['label']}' counts most, at {round(top['weight'] * 100)}%. " if top else "")
         + "The planners use those weights like a shopping list in order of priority.")
    return "How your goals count", f, t


def t_persona(a, m, p):
    from .persona import get_persona
    ps = get_persona(a, build=False) or {}
    f = {"name": ps.get("display_name", ""), "age": ps.get("age")}
    return "The person behind the account", f, (f"The bank records don't tell us who you are, so Pulp imagined a realistic person who fits them: "
                                                f"{ps.get('display_name', 'someone')}, {ps.get('age', '')}. It's a starting sketch, like a first draft "
                                                "of a portrait; everything you tell Pulp corrects it.")


def t_quartiles(a, m, p):
    return "Spending versus savings", {"buffer": "70%, 57%, 58%, 73%", "spending": "99% to 25%"}, (
        "We tested all 4,500 accounts against the same job loss. How much cash people had barely changed who made it (70%, 57%, 58%, 73%). "
        "How much of their income they spent changed everything (from 99% down to 25%). It's less about the size of the bucket "
        "and more about the size of the leak.")


def t_loans(a, m, p):
    return "Checked against real loans", {"fail": "14.3%", "pass": "4.8%"}, (
        "To check our test is real, we looked at what actually happened to people's loans. Accounts our test said would not last a layoff "
        "later had their loan go bad 14.3% of the time, against 4.8% for the rest, about three times as often. Like a weather forecast that "
        "turned out to be right.")


def t_demo(a, m, p):
    from .demographics import demographics
    ins = (demographics(a).get("insights") or [{}])[0]
    return "Where you live and who you are", {"plain": ins.get("plain", "")}, ins.get("plain", "") + " These are patterns across many people, not a verdict on you."


def t_agents(a, m, p):
    return "How the agents work", {}, ("Think of a small team in a kitchen. One reads the records, one spots patterns, one imagines the person, "
                                       "one deals possible shocks, one plans routes and checks they suit you, and a calculator does every sum. "
                                       "Nobody but the calculator is allowed to make up a number.")


def t_stage(n):
    texts = {1: "Stage 1 turns raw bank records into a picture of a person: what comes in, what goes out, habits, and a realistic life that fits.",
             2: "Stage 2 is the conversation: everything you tell Pulp updates your profile straight away, and you can undo any of it.",
             3: "Stage 3 is when life happens: a shock is dealt, hundreds of plans are tried, the ones that don't fit your life are dropped, and four are kept."}
    return lambda a, m, p: (f"Stage {n}", {}, texts[n])


def t_search(a, m, p):
    from . import context_manager as cm
    s = (cm.load_context(a).get("life_plans") or {}).get("search") or {}
    f = {"generated": s.get("generated", 0), "screened": s.get("screened_out", 0), "pareto": s.get("pareto", 0)}
    return "How the four were chosen", f, (f"The agents built {f['generated']} plans, threw out {f['screened']} that don't fit your life, "
                                           f"kept the {f['pareto']} that no other plan beats on everything, and picked four very different ones. "
                                           "Like a talent show: many auditions, a few finalists, each with a different strength.")


TOPICS: dict[str, Callable] = {
    "typical_month": t_month, "cushion": t_cushion, "runway": t_runway, "discovery": t_discovery,
    "shock": t_shock, "cushion_chart": t_shock, "prepare_now": t_prepare, "if_it_happens": t_happens,
    "plan": t_plan, "finalists": t_finalists, "plan_search": t_search, "goals": t_goals, "persona": t_persona,
    "quartiles": t_quartiles, "loan_check": t_loans, "demographics": t_demo, "agents": t_agents,
    "stage1": t_stage(1), "stage2": t_stage(2), "stage3": t_stage(3),
}

EXPLAIN_INSTRUCTION = """You are Pulp, explaining one part of a money app to a person who is not good with money. You get a
draft explanation and the facts behind it. Rewrite it as the simplest, most relatable version: two or three short sentences,
at most 60 words, one everyday comparison, second person, warm and calm. Use only numbers that appear in the draft, written
the same way. No jargon, no lists, no questions. Reply with the text only."""


def explain(account_id: int, m: Any, message: str, use_ai: bool = True) -> dict:
    key, params = parse(message)
    fn = TOPICS.get(key)
    if fn is None:
        return {"topic": key, "title": "This section", "text": "Ask me anything about this page and I'll explain it in plain words.", "source": "template"}
    title, facts, text = fn(account_id, m, params)
    source = "template"
    if use_ai:
        try:
            from .adk_runtime import LlmAgent, adk_available, run_agent
            from .director import caption_is_grounded
            from .. import config
            if adk_available():
                agent = LlmAgent(name="pulp_explainer", model=config.GEMINI_MODEL, instruction=EXPLAIN_INSTRUCTION)
                out = run_agent(agent, json.dumps({"topic": title, "draft": text, "facts": facts}, default=str), user_id=f"explain-{account_id}")
                new = " ".join(out.get("texts", {}).get("pulp_explainer", [])).strip()
                if 20 < len(new) < 500 and caption_is_grounded(new, {}, text):
                    text, source = new, f"google-adk/{config.GEMINI_MODEL}"
        except Exception:
            pass
    return {"topic": key, "title": title, "text": text, "source": source}
