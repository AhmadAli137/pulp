"""Persistent structured memory for the life context the bank data cannot see.

One JSON document per account under app/storage/context/. Every item records its source
(user_confirmed | model_inference | scenario_assumption | observed), timestamps and confirmation status.
Proposals are staged separately and only move into memory when confirmed.

Safety note: the user may be speaking *as* a hypothetical person attached to an anonymized account.
Nothing here implies the bank record truly belongs to that person.
"""
from __future__ import annotations

import json
import logging
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import KV_REST_API_TOKEN, KV_REST_API_URL, STORAGE_DIR

LISTS = ("goals", "concerns", "constraints", "preferences", "upcoming_events", "accepted_actions", "completed_actions")
_LOCK = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _path(account_id: int) -> Path:
    return STORAGE_DIR / f"{int(account_id)}.json"


def empty_context(account_id: int) -> dict:
    return {
        "account_id": int(account_id),
        **{k: [] for k in LISTS},
        "proposals": [],
        "asked_questions": [],
        "conversation": [],
        "strategy_snapshots": [],
        "context_version": 1,
        "created_at": _now(),
        "updated_at": _now(),
        "identity_note": "Context is supplied by whoever is speaking for this anonymized account; it does not identify the real account holder.",
    }


# ----------------------------------------------------------------------------- storage backends
_KV_ENABLED = bool(KV_REST_API_URL and KV_REST_API_TOKEN)


def _kv(command: list) -> Any:
    """Run one Redis command over the Upstash/Vercel KV REST API; raises on transport or auth errors."""
    import httpx
    r = httpx.post(KV_REST_API_URL, json=command, headers={"Authorization": f"Bearer {KV_REST_API_TOKEN}"}, timeout=8.0)
    r.raise_for_status()
    return r.json().get("result")


def _kv_key(account_id: int) -> str:
    return f"pulp:context:{int(account_id)}"


def storage_backend() -> str:
    return "redis" if _KV_ENABLED else "file"


def load_context(account_id: int) -> dict:
    if _KV_ENABLED:
        try:
            raw = _kv(["GET", _kv_key(account_id)])
            return json.loads(raw) if raw else empty_context(account_id)
        except Exception as e:  # pragma: no cover - network
            logging.getLogger("pulp.context").warning("KV read failed, using file storage: %s", e)
    p = _path(account_id)
    if not p.exists():
        return empty_context(account_id)
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save_context(ctx: dict) -> None:
    ctx["updated_at"] = _now()
    if _KV_ENABLED:
        try:
            _kv(["SET", _kv_key(ctx["account_id"]), json.dumps(ctx)])
            return
        except Exception as e:  # pragma: no cover - network
            logging.getLogger("pulp.context").warning("KV write failed, using file storage: %s", e)
    p = _path(ctx["account_id"])
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(ctx, f, indent=2)
    tmp.replace(p)


def reset_context(account_id: int) -> dict:
    with _LOCK:
        if _KV_ENABLED:
            try:
                _kv(["DEL", _kv_key(account_id)])
            except Exception as e:  # pragma: no cover - network
                logging.getLogger("pulp.context").warning("KV delete failed: %s", e)
        p = _path(account_id)
        if p.exists():
            p.unlink()
        return empty_context(account_id)


# ----------------------------------------------------------------------------- proposals
def propose(account_id: int, changes: list[dict], source: str = "model_inference", rationale: str = "") -> dict:
    """Stage proposed changes. Each change: {field, operation: add|update|remove, value: dict, target_id?}."""
    with _LOCK:
        ctx = load_context(account_id)
        proposal = {
            "id": uuid.uuid4().hex[:10],
            "changes": changes,
            "source": source,
            "rationale": rationale,
            "status": "pending",
            "base_version": ctx['context_version'],
            "created_at": _now(),
        }
        ctx["proposals"].append(proposal)
        ctx["proposals"] = ctx["proposals"][-30:]
        save_context(ctx)
        return proposal


def _apply_change(ctx: dict, change: dict, source: str) -> dict:
    field = change["field"]
    if field not in LISTS:
        raise ValueError(f"unknown field {field}")
    op = change.get("operation", "add")
    now = _now()
    if op == "add":
        item = {"id": uuid.uuid4().hex[:8], "value": change.get("value", {}), "source": "user_confirmed",
                "proposed_by": source, "confirmed": True, "created_at": now, "updated_at": now}
        # de-duplicate goals/concerns/preferences of the same type: update in place
        vtype = item["value"].get("type")
        if vtype and field in ("goals", "concerns", "preferences", "constraints"):
            for existing in ctx[field]:
                if existing["value"].get("type") == vtype:
                    existing["value"].update(item["value"])
                    existing["updated_at"] = now
                    existing["confirmed"] = True
                    return existing
        ctx[field].append(item)
        return item
    if op == "update":
        for existing in ctx[field]:
            if existing["id"] == change.get("target_id") or (change.get("value", {}).get("type") and existing["value"].get("type") == change["value"]["type"]):
                existing["value"].update(change.get("value", {}))
                existing["updated_at"] = now
                existing["confirmed"] = True
                return existing
        return _apply_change(ctx, {**change, "operation": "add"}, source)
    if op == "remove":
        before = len(ctx[field])
        ctx[field] = [x for x in ctx[field] if x["id"] != change.get("target_id")
                      and not (change.get("value", {}).get("type") and x["value"].get("type") == change["value"]["type"])]
        return {"removed": before - len(ctx[field])}
    raise ValueError(f"unknown operation {op}")


def confirm(account_id: int, proposal_id: str, accept: bool = True) -> dict:
    with _LOCK:
        ctx = load_context(account_id)
        prop = next((p for p in ctx["proposals"] if p["id"] == proposal_id), None)
        if prop is None:
            raise KeyError(proposal_id)
        if prop["status"] != "pending":
            return {"context": ctx, "proposal": prop, "applied": []}
        if accept and prop.get('base_version',ctx['context_version']) != ctx['context_version']:
            raise ValueError('Context changed after this proposal. Review a new proposal before confirming.')
        applied = []
        if accept:
            for ch in prop["changes"]:
                applied.append(_apply_change(ctx, ch, prop.get("source", "model_inference")))
            prop["status"] = "confirmed"
            ctx["context_version"] += 1
        else:
            prop["status"] = "rejected"
        prop["resolved_at"] = _now()
        save_context(ctx)
        return {"context": ctx, "proposal": prop, "applied": applied}


def direct_edit(account_id: int, change: dict) -> dict:
    """User edits their own context directly (no proposal step). Source = user_confirmed."""
    with _LOCK:
        ctx = load_context(account_id)
        res = _apply_change(ctx, change, "user_direct")
        ctx["context_version"] += 1
        save_context(ctx)
        return {"context": ctx, "applied": res}


def record_turn(account_id: int, role: str, text: str, extra: dict | None = None) -> None:
    with _LOCK:
        ctx = load_context(account_id)
        ctx["conversation"].append({"role": role, "text": text, "at": _now(), **(extra or {})})
        ctx["conversation"] = ctx["conversation"][-40:]
        save_context(ctx)


def record_question(account_id: int, question_key: str) -> None:
    with _LOCK:
        ctx = load_context(account_id)
        ctx["asked_questions"].append({"key": question_key, "at": _now()})
        save_context(ctx)


def add_snapshot(account_id: int, snapshot: dict) -> dict:
    with _LOCK:
        ctx = load_context(account_id)
        snapshot = {"id": uuid.uuid4().hex[:8], "at": _now(), "context_version": ctx["context_version"], **snapshot}
        ctx["strategy_snapshots"].append(snapshot)
        ctx["strategy_snapshots"] = ctx["strategy_snapshots"][-10:]
        save_context(ctx)
        return snapshot


def summarize(ctx: dict) -> dict:
    """Compact view for prompts and the UI."""
    def items(field):
        return [x["value"] for x in ctx.get(field, []) if x.get("confirmed", True)]
    return {
        "account_id": ctx["account_id"],
        "context_version": ctx["context_version"],
        "goals": items("goals"), "concerns": items("concerns"), "constraints": items("constraints"),
        "preferences": items("preferences"), "upcoming_events": items("upcoming_events"),
        "accepted_actions": items("accepted_actions"),
        "pending_proposals": [p for p in ctx.get("proposals", []) if p["status"] == "pending"],
        "asked_questions": [q["key"] for q in ctx.get("asked_questions", [])],
    }
