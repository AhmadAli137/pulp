"""Every real agent run, kept per account so it can be replayed step by step with its log.

A run is one unit of agent work: a conversation turn (typed or spoken), a persona build or its model refinement, a
personal deck, a plan search. Each keeps its events in order (agent, kind, title, handoff target, items, data, time)
in the same TraceEvent shape the Agents page draws. The Stage 1 distillation of the records is listed as a run too,
built from the stored Stage 1 artefacts. Runs are capped per account and trimmed so the context document stays small.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any

from . import context_manager as cm

MAX_RUNS = 40
MAX_EVENTS = 120
STAGE_OF = {"schema_scout": 1, "feature_forge": 1, "pattern_hunter": 1, "archetype_namer": 1, "narrator": 1, "persona_builder": 1,
            "companion": 2, "director": 2, "user": 2, "you": 2, "profile": 2, "stage": 2,
            "engine": 3, "strategist": 3, "challenger": 3, "validator": 3, "ranker": 3, "life_planner": 3, "life_fit": 3,
            "shock_generator": 3, "shock_dealer": 3}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _short(v: Any, n: int = 220) -> Any:
    if isinstance(v, str):
        return v[:n]
    if isinstance(v, list):
        return [_short(x, n) for x in v[:12]]
    if isinstance(v, dict):
        return {str(k): _short(x, n) for k, x in list(v.items())[:16]}
    return v


def normalize(kind: str, data: dict, t0: float | None = None) -> dict | None:
    """Turn a stream event (agent, handoff, trace, profile, lifeplans) into one TraceEvent."""
    t = data.get("t")
    if t is None and t0 is not None:
        t = round(time.perf_counter() - t0, 2)
    if kind == "trace":
        e = {k: data.get(k) for k in ("t", "stage", "agent", "kind", "title", "to", "items", "data") if data.get(k) is not None}
        e.setdefault("t", t or 0)
        return _short(e)
    if kind == "agent":
        agent = data.get("agent") or "director"
        if data.get("tool"):
            return _short({"t": t or 0, "stage": STAGE_OF.get(agent, 2), "agent": agent, "kind": "tool_call", "title": f"calls {data['tool']}",
                           "data": data.get("args") or {}})
        return _short({"t": t or 0, "stage": STAGE_OF.get(agent, 2), "agent": agent, "kind": "output",
                       "title": str(data.get("summary") or data.get("text") or "")[:200] or "spoke"})
    if kind == "handoff":
        src = data.get("from") or "director"
        return _short({"t": t or 0, "stage": STAGE_OF.get(src, STAGE_OF.get(data.get("to"), 2)), "agent": src, "kind": "handoff",
                       "to": data.get("to"), "title": data.get("title") or "", "items": data.get("items") or [],
                       **({"data": {"mode": data["mode"]}} if data.get("mode") else {})})
    if kind == "profile":
        changes = data.get("changes") or []
        return _short({"t": t or 0, "stage": 2, "agent": (changes[0].get("agent") if changes else "companion") or "companion", "kind": "output",
                       "title": f"profile updated ({len(changes)} change{'s' if len(changes) != 1 else ''})",
                       "items": [f"{c.get('kind')} {c.get('field')}: {c.get('label')}" for c in changes]})
    if kind == "lifeplans":
        s = data.get("search") or {}
        return _short({"t": t or 0, "stage": 3, "agent": "director", "kind": "output",
                       "title": f"{s.get('generated', '?')} plans searched, {len(data.get('plans') or [])} finalists",
                       "items": [f"{p.get('role_label')}: {p.get('name')}" for p in data.get("plans") or []]})
    return None


def record(account_id: int, *, stage: int, title: str, trigger: str, events: list[dict], source: str = "",
           duration_s: float | None = None) -> dict | None:
    events = [e for e in events if e][:MAX_EVENTS]
    if not events:
        return None
    run = {"id": uuid.uuid4().hex[:10], "at": _now(), "stage": stage, "title": title[:140], "trigger": trigger[:160], "source": source,
           "n_events": len(events), "duration_s": round(duration_s if duration_s is not None else max(float(e.get("t") or 0) for e in events), 2),
           "agents": sorted({e.get("agent") for e in events if e.get("agent")} | {e.get("to") for e in events if e.get("to")} - {None}),
           "events": events}
    try:
        with cm._LOCK:
            ctx = cm.load_context(account_id)
            runs = ctx.setdefault("agent_runs", [])
            runs.append(run)
            ctx["agent_runs"] = runs[-MAX_RUNS:]
            cm.save_context(ctx)
    except Exception:
        return None
    return run


def _stage1_run(account_id: int) -> dict | None:
    try:
        from .agent_trace import build_trace
        tr = build_trace(account_id)
        st = next((s for s in tr.get("stages", []) if s.get("stage") == 1), None)
        if not st or not st.get("events"):
            return None
        evs = st["events"]
        return {"id": "stage1", "at": None, "stage": 1, "title": "Distilling the records into a person", "trigger": "Built from the bank's records",
                "source": "stage1 artefacts", "n_events": len(evs), "duration_s": max(float(e.get("t") or 0) for e in evs),
                "agents": sorted({e.get("agent") for e in evs if e.get("agent")}), "events": evs}
    except Exception:
        return None


def list_runs(account_id: int) -> list[dict]:
    ctx = cm.load_context(account_id)
    runs = [{k: v for k, v in r.items() if k != "events"} for r in reversed(ctx.get("agent_runs", []))]
    s1 = _stage1_run(account_id)
    if s1:
        runs.append({k: v for k, v in s1.items() if k != "events"})
    return runs


def get_run(account_id: int, run_id: str) -> dict | None:
    if run_id == "stage1":
        return _stage1_run(account_id)
    ctx = cm.load_context(account_id)
    return next((r for r in ctx.get("agent_runs", []) if r["id"] == run_id), None)
