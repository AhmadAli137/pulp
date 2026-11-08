"""Agent trace: what each agent did for one account, across the three stages.

Built from what is already recorded (committed Stage 1 artefacts, the account's context document, the latest plan),
so it needs no model and never runs an agent. Every optional input (persona, deck, profile log, life plans) may be
missing; the trace then says what would happen instead.

Shape (docs/agents/v2-contracts.md): {account_id, stages: [{stage, title, summary, events: TraceEvent[]}]}.
TraceEvent: {t, stage, agent, kind, title, to?, items?, data?}; t is seconds from the start of that stage.
"""
from __future__ import annotations

import math
from typing import Any

MAX_EVENTS = 60
MAX_STAGE2_ITEMS = 30
_TXT = 160


def _s(x: Any, n: int = _TXT) -> str:
    s = str(x if x is not None else "").strip().replace("\n", " ")
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _num(x: Any, digits: int = 2):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or math.isinf(v):
        return None
    return round(v, digits)


def _money(x: Any) -> str:
    v = _num(x, 0)
    return "n/a" if v is None else f"${v:,.0f}"


def _short(v: Any) -> str:
    """Compact text for a before/after value."""
    if v is None:
        return "nothing"
    if isinstance(v, dict):
        label = v.get("label") or v.get("text") or v.get("type") or v.get("title")
        return _s(label if label else ", ".join(f"{k}: {v[k]}" for k in list(v)[:3]), 90)
    if isinstance(v, list):
        return _s(", ".join(_short(x) for x in v[:4]), 90)
    return _s(v, 90)


class _Stage:
    def __init__(self, stage: int):
        self.stage = stage
        self.events: list[dict] = []
        self.t = 0.0

    def add(self, agent: str, kind: str, title: str, dt: float = 0.4, to: str | None = None,
            items: list | None = None, data: dict | None = None, t: float | None = None) -> None:
        self.t = round(self.t + dt, 2) if t is None else round(t, 2)
        ev: dict = {"t": self.t, "stage": self.stage, "agent": agent, "kind": kind, "title": _s(title, 120)}
        if to:
            ev["to"] = to
        if items:
            ev["items"] = [_s(i) for i in items if i not in (None, "")][:12]
        if data:
            ev["data"] = data
        self.events.append(ev)

    def extend(self, events: list, agent_default: str) -> None:
        """Append recorded TraceEvents (from persona/deck/plan traces), re-timed onto this stage's clock."""
        base = self.t
        last = 0.0
        for e in events or []:
            if not isinstance(e, dict):
                continue
            rt = _num(e.get("t"), 2)
            rel = (rt - last) if rt is not None and rt >= last else 0.4
            last = rt if rt is not None else last
            self.add(e.get("agent") or agent_default, e.get("kind") if e.get("kind") in _KINDS else "note",
                     e.get("title") or "step", dt=max(0.1, min(rel, 5.0)), to=e.get("to"),
                     items=[_s(i) for i in (e.get("items") or [])] or None,
                     data=e.get("data") if isinstance(e.get("data"), dict) else None)
        if not events:
            self.t = base

    def cap(self) -> list[dict]:
        """At most MAX_EVENTS: keep every non-tool event (so no agent disappears) and thin tool calls evenly."""
        if len(self.events) <= MAX_EVENTS:
            return self.events
        fixed = [e for e in self.events if e["kind"] not in ("tool_call", "tool_result")]
        tools = [e for e in self.events if e["kind"] in ("tool_call", "tool_result")]
        room = max(0, MAX_EVENTS - len(fixed))
        if room == 0:
            return fixed[:MAX_EVENTS]
        step = len(tools) / room
        kept = [tools[int(i * step)] for i in range(room)]
        return sorted(fixed + kept, key=lambda e: e["t"])


_KINDS = {"start", "tool_call", "tool_result", "handoff", "output", "note"}

KEY_SIGNALS = [
    ("I", "typical money in", "money"), ("S", "typical spending", "money"), ("B", "cash buffer", "money"),
    ("spending_ratio", "spending / income", "ratio"), ("income_cv", "income variability (CV)", "ratio"),
    ("inflow_regular_share", "months with regular income", "pct"), ("neg_months_share", "months below zero", "pct"),
    ("payday_dom", "usual payday (day of month)", "int"), ("bills_before_pay_share", "bills before payday", "pct"),
    ("penalty_events", "penalty-interest events", "int"), ("shock_episodes", "past income drops", "int"),
    ("runway_layoff", "runway under layoff (months)", "months"),
]


def _fmt_signal(v: Any, kind: str) -> str:
    n = _num(v, 4)
    if n is None:
        return "n/a"
    if kind == "money":
        return _money(n)
    if kind == "pct":
        return f"{n * 100:.0f}%"
    if kind == "int":
        return f"{n:.0f}"
    if kind == "months":
        return "120+" if n >= 120 else f"{n:.1f}"
    return f"{n:.2f}"


# ----------------------------------------------------------------------------- stage 1
def _stage1(account_id: int, ctx: dict) -> dict:
    st = _Stage(1)
    row = None
    n_features = 0
    try:
        from .features import ROLES, get_features
        f = get_features()
        n_features = int(len([c for c in f.columns if c != "account_id"]))
        if int(account_id) in f.index:
            row = f.loc[int(account_id)]
        elif "account_id" in f.columns:
            sel = f[f["account_id"] == int(account_id)]
            row = sel.iloc[0] if len(sel) else None
    except Exception:
        ROLES = {}
        f = None

    # Schema Scout ------------------------------------------------------------
    st.add("schema_scout", "start", "Reading the bank's tables", dt=0)
    try:
        from .stage1_report import data_files
        files = data_files()
    except Exception:
        files = []
    st.add("schema_scout", "tool_call", "list_tables()", dt=0.3)
    st.add("schema_scout", "tool_result", f"{len(files)} tables, {sum(x['rows'] for x in files):,} rows", dt=0.6,
           items=[f"{x['file']}: {x['rows']:,} rows" for x in files], data={x["file"]: x["rows"] for x in files} or None)
    roles = ROLES if isinstance(ROLES, dict) else {}
    role_items = []
    for k, v in list(roles.items())[:12]:
        if isinstance(v, dict):
            role_items.append(f"{k}: {', '.join(list(v)[:7])}")
        else:
            role_items.append(f"{k} → {v}")
    st.add("schema_scout", "output", f"Mapped {len(roles)} column roles", dt=0.3, items=role_items)
    st.add("schema_scout", "handoff", f"{len(roles)} column roles", dt=0.2, to="feature_forge",
           data={"roles": len(roles), "tables": len(files)})

    # Feature Forge -----------------------------------------------------------
    st.add("feature_forge", "start", "Turning monthly records into behaviour signals", dt=0.2)
    st.add("feature_forge", "tool_call", "get_features()", dt=0.3, data={"accounts": int(len(f)) if f is not None else None})
    sig_items = []
    sig_data = {}
    if row is not None:
        for key, label, kind in KEY_SIGNALS:
            if key in row.index:
                sig_items.append(f"{label}: {_fmt_signal(row[key], kind)}")
                sig_data[key] = _num(row[key], 3)
    st.add("feature_forge", "tool_result", f"{n_features} signals for account {account_id}", dt=1.1,
           items=sig_items, data=sig_data or None)
    st.add("feature_forge", "handoff", f"{n_features} signals", dt=0.2, to="pattern_hunter", data={"signals": n_features})

    # Pattern Hunter ----------------------------------------------------------
    hf: dict = {}
    try:
        from .hunter import get_findings
        hf = get_findings() or {}
    except Exception:
        hf = {}
    st.add("pattern_hunter", "start", "Hunting for patterns across all accounts", dt=0.2,
           items=[f"mode: {hf.get('mode', 'n/a')}", f"model: {hf.get('model', 'deterministic battery')}",
                  f"tool calls: {hf.get('tool_calls_made', len(hf.get('tool_log', [])))}"],
           data={"mode": hf.get("mode"), "model": hf.get("model"), "tool_calls_made": hf.get("tool_calls_made")})
    log = hf.get("tool_log") or []
    secs = _num(hf.get("seconds"), 1) or 30.0
    gap = max(0.2, min(2.5, secs / max(1, len(log)) if log else 0.5))
    SHOW_CALLS, SHOW_FINDINGS = 18, 8
    shown = [e for e in log if isinstance(e, dict)][:SHOW_CALLS]
    for entry in shown:
        args = entry.get("args") or {}
        arg_txt = ", ".join(f"{k}={_s(v, 30)}" for k, v in list(args.items())[:3]) if isinstance(args, dict) else _s(args, 60)
        st.add("pattern_hunter", "tool_call", f"{entry.get('tool', 'tool')}({arg_txt})", dt=gap,
               data={"tool": entry.get("tool"), "args": args if isinstance(args, dict) else {"value": _s(args)}})
    rest = [e for e in log if isinstance(e, dict)][SHOW_CALLS:]
    if rest:
        st.add("pattern_hunter", "tool_call", f"…and {len(rest)} more tool calls", dt=gap * len(rest),
               items=[f"{e.get('tool')}({', '.join(f'{k}={_s(v, 20)}' for k, v in list((e.get('args') or {}).items())[:2]) if isinstance(e.get('args'), dict) else ''})" for e in rest],
               data={"collapsed": len(rest)})
    findings = hf.get("findings") or []
    findings = [fd for fd in findings if isinstance(fd, dict)]
    order = {"strong": 0, "moderate": 1, "weak": 2}
    for fd in sorted(findings, key=lambda x: order.get(str(x.get("strength")), 3))[:SHOW_FINDINGS]:
        st.add("pattern_hunter", "output", fd.get("title") or "finding", dt=0.25,
               items=[fd.get("statement"), f"strength: {fd.get('strength', 'n/a')}",
                      f"caveat: {fd.get('caveat')}" if fd.get("caveat") else None],
               data={"strength": fd.get("strength"), "ground_truth": bool(fd.get("ground_truth"))})
    if len(findings) > SHOW_FINDINGS:
        st.add("pattern_hunter", "note", f"{len(findings) - SHOW_FINDINGS} more findings in the Stage 1 report", dt=0.2,
               items=[fd.get("title") for fd in findings[SHOW_FINDINGS:]])
    st.add("pattern_hunter", "handoff", f"{len(findings)} findings", dt=0.2, to="archetype_namer",
           data={"findings": len(findings)})

    # Archetype Namer ---------------------------------------------------------
    arche: dict = {}
    doc: dict = {}
    try:
        from .archetypes import archetype_for, get_archetypes
        doc = get_archetypes() or {}
        arche = archetype_for(int(account_id)) or {}
    except Exception:
        pass
    n_clusters = len(doc.get("clusters") or []) or doc.get("k") or 0
    st.add("archetype_namer", "start", "Grouping accounts into behaviour archetypes", dt=0.2,
           items=[f"method: {doc.get('method', 'n/a')}", f"naming: {doc.get('naming_source', 'n/a')}"])
    st.add("archetype_namer", "tool_call", f"cluster {doc.get('n_accounts', 'all')} accounts into {n_clusters} groups", dt=0.6)
    cl_all = doc.get("clusters") or []
    if cl_all:
        st.add("archetype_namer", "tool_result", f"{len(cl_all)} groups named", dt=0.5,
               items=[f"{c.get('name', 'cluster')}: {int(c.get('size', 0)):,} accounts, {(_num(c.get('survive6_layoff_pct'), 0) or 0):.0f}% last a 6-month layoff" for c in cl_all],
               data={"clusters": [{"name": c.get("name"), "size": c.get("size"), "share": _num(c.get("share"), 3),
                                   "survive6_layoff_pct": _num(c.get("survive6_layoff_pct"), 1)} for c in cl_all]})
    if arche:
        dist = []
        try:
            cl = next((c for c in doc.get("clusters", []) if c.get("id") == arche.get("id")), {})
            dist = [f"{d['feature']}: {_num(d['cluster_median'])} vs {_num(d['population_median'])} overall"
                    for d in (cl.get("distinguishing") or [])[:4]]
        except Exception:
            dist = []
        st.add("archetype_namer", "output", f"This account is a '{arche.get('name')}'", dt=0.4,
               items=[arche.get("description"),
                      f"{int(arche.get('size') or 0):,} accounts ({(_num(arche.get('share'), 3) or 0) * 100:.0f}%)",
                      f"likely: {arche.get('likely_occupation')} · {arche.get('likely_life_stage')}"] + dist,
               data={"archetype_id": arche.get("id"), "confidence": _num(arche.get("confidence"), 2)})
    st.add("archetype_namer", "handoff", f"{n_clusters} archetypes", dt=0.2, to="narrator", data={"archetypes": n_clusters})

    # Narrator ----------------------------------------------------------------
    flags: list = []
    narrative: dict = {}
    try:
        from .narrator import narrative_for
        nd = narrative_for(int(account_id), use_ai=False) or {}
        flags = nd.get("flags") or []
        narrative = nd.get("narrative") or {}
    except Exception as exc:
        st.add("narrator", "note", f"Narrator could not run: {type(exc).__name__}", dt=0.2)
    st.add("narrator", "start", "Writing what is worth hearing", dt=0.2)
    for fl in flags[:8]:
        st.add("narrator", "tool_result", f"flag: {fl.get('label', fl.get('key'))}", dt=0.2,
               items=[fl.get("evidence"), f"severity: {fl.get('severity')}"], data={"flag": fl.get("key")})
    if narrative:
        st.add("narrator", "output", narrative.get("headline") or "Profile written", dt=0.5,
               items=[i.get("text") if isinstance(i, dict) else i for i in (narrative.get("insights") or [])][:6],
               data={"source": narrative.get("source")})
    st.add("narrator", "handoff", f"{len(flags)} flags", dt=0.2, to="persona_builder", data={"flags": len(flags)})

    # Persona Builder ---------------------------------------------------------
    persona = ctx.get("persona") if isinstance(ctx.get("persona"), dict) else None
    ptrace = ctx.get("persona_trace") if isinstance(ctx.get("persona_trace"), list) else []
    st.add("persona_builder", "start", "Imagining a realistic, fictional life for these records", dt=0.2)
    if ptrace:
        st.extend([e for e in ptrace if isinstance(e, dict) and e.get("kind") != "start"], "persona_builder")
    if persona:
        goals = persona.get("goals") or []
        worries = persona.get("worries") or []
        occ = persona.get("occupation") or {}
        st.add("persona_builder", "output", f"{persona.get('display_name', 'Persona')} (fictional), {occ.get('label', 'occupation unknown')}",
               dt=0.4, items=[f"goal: {g.get('label')} ({g.get('size')}, {g.get('horizon')}, weight {_num(g.get('weight'))})" for g in goals[:5]]
               + [f"worry: {w.get('label')}" for w in worries[:3]])
        st.add("persona_builder", "handoff", f"{len(goals)} goals", dt=0.2, to="shock_generator",
               data={"goals": len(goals), "worries": len(worries)})
    else:
        st.add("persona_builder", "note", "Builds on first profile view", dt=0.3,
               items=["Open Profile to build the fictional persona, goals and first questions."])
        st.add("persona_builder", "handoff", "profile signals", dt=0.2, to="shock_generator")

    # Shock Generator ---------------------------------------------------------
    deck = ctx.get("deck") if isinstance(ctx.get("deck"), dict) else None
    st.add("shock_generator", "start", "Choosing shocks that fit this life", dt=0.2)
    if deck and deck.get("trace"):
        st.extend([e for e in deck["trace"] if isinstance(e, dict) and e.get("kind") != "start"], "shock_generator")
    if deck and deck.get("cards"):
        cards = deck["cards"]
        st.add("shock_generator", "output", f"{len(cards)} personal shocks", dt=0.3,
               items=[f"{c.get('title')} ({c.get('likelihood', 'n/a')})" for c in cards[:8] if isinstance(c, dict)],
               data={"source": deck.get("source")})
        st.add("shock_generator", "handoff", f"{len(cards)} shock cards", dt=0.2, to="companion")
    else:
        st.add("shock_generator", "note", "Deals the personal deck when Shocks or Profile opens", dt=0.3)

    summary = (f"{len(files)} tables → {n_features} signals → {len(findings)} findings → {n_clusters} archetypes → "
               f"{len(flags)} flags" + (f" → persona with {len(persona.get('goals') or [])} goals" if persona else ""))
    return {"stage": 1, "title": "From records to a person", "summary": summary, "events": st.cap()}


# ----------------------------------------------------------------------------- stage 2
_FIELD_SINGULAR = {"goals": "goal", "concerns": "concern", "constraints": "constraint", "preferences": "preference",
                   "upcoming_events": "upcoming event", "accepted_actions": "action", "completed_actions": "completed action"}
_VERB = {"add": "added", "update": "updated", "remove": "removed", "undo": "undid", "seed": "seeded"}


def _stage2(account_id: int, ctx: dict) -> dict:
    items: list[tuple[str, str, dict]] = []  # (timestamp, type, payload)
    for ch in ctx.get("profile_log") or []:
        if isinstance(ch, dict):
            items.append((str(ch.get("at") or ""), "change", ch))
    for turn in ctx.get("conversation") or []:
        if isinstance(turn, dict) and turn.get("text"):
            items.append((str(turn.get("at") or ""), "turn", turn))
    items.sort(key=lambda x: x[0])
    items = items[-MAX_STAGE2_ITEMS:]

    st = _Stage(2)
    n_changes = sum(1 for _, k, _p in items if k == "change")
    n_turns = sum(1 for _, k, _p in items if k == "turn")
    st.add("companion", "start", "Listening for what changes the plan", dt=0)
    if not items:
        st.add("companion", "note", "No conversation yet", dt=0.3,
               items=["Say a goal, a worry or an upcoming event to Pulp; agents update the profile directly and log it here."])
    for _, kind, p in items:
        if kind == "change":
            agent = p.get("agent") or "companion"
            verb = _VERB.get(p.get("kind"), p.get("kind") or "changed")
            field = _FIELD_SINGULAR.get(p.get("field"), str(p.get("field") or "profile").replace("_", " "))
            label = p.get("label") or _short(p.get("after") if p.get("after") is not None else p.get("before"))
            title = f"{verb} {field}: {label}"
            if p.get("undone"):
                title += " (undone)"
            st.add(agent, "output", title, dt=0.6,
                   items=[f"before: {_short(p.get('before'))}", f"after: {_short(p.get('after'))}",
                          f"reason: {p.get('reason')}" if p.get("reason") else None],
                   data={"change_id": p.get("id"), "kind": p.get("kind"), "field": p.get("field"),
                         "version": p.get("version"), "at": p.get("at"), "undone": bool(p.get("undone"))})
        else:
            role = p.get("role")
            if role == "user":
                st.add("user", "handoff", "you said", dt=0.8, to="companion", items=[p.get("text")], data={"at": p.get("at")})
                st.add("companion", "handoff", "what to remember", dt=0.3, to="director")
            else:
                st.add("director", "output", "Pulp replied", dt=0.7, items=[p.get("text")], data={"at": p.get("at")})

    summary = (f"{n_changes} profile changes and {n_turns} conversation turns (most recent {MAX_STAGE2_ITEMS})"
               if items else "Waiting for the first conversation; the persona seed appears here once Profile opens.")
    return {"stage": 2, "title": "Getting to know you", "summary": summary, "events": st.cap()}


# ----------------------------------------------------------------------------- stage 3
def _stage3(account_id: int, ctx: dict) -> dict:
    st = _Stage(3)
    lp = ctx.get("life_plans") if isinstance(ctx.get("life_plans"), dict) else None
    if lp and lp.get("trace"):
        st.extend(lp["trace"], "life_planner")
        rec = next((p for p in lp.get("plans") or [] if isinstance(p, dict) and p.get("id") == lp.get("recommended")), None)
        shock = lp.get("shock") or {}
        summary = f"Life Planner ran for '{_s(shock.get('label') or 'a shock', 60)}'" + (f"; recommended: {_s(rec.get('name'), 60)}" if rec else "")
        return {"stage": 3, "title": "When life happens", "summary": summary, "events": st.cap()}

    plan = None
    try:
        from .planning_session import current
        plan = (current(int(account_id)) or {}).get("plan")
    except Exception:
        plan = ctx.get("active_plan")
    if isinstance(plan, dict) and plan:
        shock = ((plan.get("request") or {}).get("shock")) or {}
        label = shock.get("label") or "a shock"
        st.add("engine", "start", f"Shock: {label}", dt=0,
               items=[f"income kept r={shock.get('r')}", f"bills change h={shock.get('h')}",
                      f"one-off {_money(shock.get('one_off'))}", f"{shock.get('duration_months')} months"])
        st.add("engine", "handoff", "official runway", dt=0.3, to="strategist")
        for tc in (plan.get("tool_calls") or [])[:30]:
            if isinstance(tc, dict):
                name = tc.get("tool") or tc.get("name") or "tool"
                args = tc.get("args") or tc.get("arguments") or {}
                st.add(tc.get("agent") or "strategist", "tool_call", f"{name}", dt=0.5,
                       data={"args": args} if isinstance(args, dict) else None)
            else:
                st.add("strategist", "tool_call", _s(tc, 80), dt=0.5)
        st.add("strategist", "handoff", "options to check", dt=0.3, to="challenger")
        st.add("challenger", "handoff", "realism notes", dt=0.4, to="validator")
        rec = plan.get("recommended") or {}
        if isinstance(rec, dict):
            st.add("validator", "output", f"Recommended: {rec.get('name') or rec.get('title') or rec.get('id') or 'option'}", dt=0.5,
                   items=[plan.get("why")] if plan.get("why") else None)
        else:
            st.add("validator", "output", f"Recommended: {_s(rec, 80)}", dt=0.5)
        return {"stage": 3, "title": "When life happens", "summary": f"Planning council ran for '{_s(label, 60)}'", "events": st.cap()}

    st.add("life_planner", "note", "No shock planned yet", dt=0,
           items=["Draw a twist card, or mention a shock or a big decision to Pulp, and the Shock Generator, "
                  "Strategist, Challenger, Validator and Life Planner run here."])
    return {"stage": 3, "title": "When life happens", "summary": "Runs when a shock is drawn or mentioned.", "events": st.events}


# ----------------------------------------------------------------------------- public
def build_trace(account_id: int) -> dict:
    ctx: dict = {}
    try:
        from . import context_manager as cm
        ctx = cm.load_context(int(account_id)) or {}
    except Exception:
        ctx = {}
    stages = []
    for fn in (_stage1, _stage2, _stage3):
        try:
            stages.append(fn(int(account_id), ctx))
        except Exception as exc:  # never fail the whole trace for one stage
            n = len(stages) + 1
            stages.append({"stage": n, "title": ["From records to a person", "Getting to know you", "When life happens"][n - 1],
                           "summary": "This stage could not be traced.",
                           "events": [{"t": 0, "stage": n, "agent": "engine", "kind": "note",
                                       "title": f"Trace unavailable: {type(exc).__name__}"}]})
    return {"account_id": int(account_id), "stages": stages}
