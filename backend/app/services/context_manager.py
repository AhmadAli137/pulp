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
    value = change.get("value", {})
    if change.get("operation") == "update" and field == "constraints":
        existing = next((i for i in ctx[field] if i["id"] == change.get("target_id") or (value.get("type") and i["value"].get("type") == value["type"])), None)
        if existing and existing["value"].get("type") in ("financial_position", "loan_purpose"):
            value = {**existing["value"], **value}
            change = {**change, "value": value}
    if change.get("operation", "add") != "remove" and field == "constraints" and value.get("type") == "financial_position":
        from .financial_overview import FinancialPosition
        change = {**change, "value": FinancialPosition.model_validate(value).model_dump(mode="json")}
    if change.get("operation", "add") != "remove" and field == "constraints" and value.get("type") == "loan_purpose":
        from .life_profile import LoanPurpose
        from .data_store import get_store
        validated = LoanPurpose.model_validate(value).model_dump()
        loan = get_store().loan_for(ctx["account_id"])
        if loan is None or int(loan.loan_id) != validated["loan_id"]:
            raise ValueError("Loan purpose must refer to this account's recorded loan")
        change = {**change, "value": {**validated, "label": f"Loan purpose: {validated['purpose']}"}}
    if change.get("operation", "add") != "remove" and field == "goals" and "saved_amount" in value:
        import math
        amount = value["saved_amount"]
        if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not math.isfinite(amount) or not 0 <= amount <= 1e12:
            raise ValueError("Saved goal amount must be a finite non-negative number")
        from datetime import date
        saved_as_of = value.get("saved_as_of") or _now()[:10]
        if date.fromisoformat(saved_as_of) > date.fromisoformat(_now()[:10]):
            raise ValueError("Savings date cannot be in the future")
        change = {**change, "value": {**value, "saved_as_of": saved_as_of}}
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


# ----------------------------------------------------------------------------- v2: direct updates with a log
# Agents update the profile directly. Every change is logged (agent, reason, before, after) and can be undone.
LOG_LIMIT = 200


def _label(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("label") or value.get("text") or value.get("type") or "")[:120]
    return str(value)[:120] if value is not None else ""


def _find(ctx: dict, field: str, item_id: str | None, vtype: str | None) -> dict | None:
    for x in ctx.get(field, []):
        if (item_id and x.get("id") == item_id) or (vtype and x.get("value", {}).get("type") == vtype):
            return x
    return None


def _log_entry(ctx: dict, agent: str, kind: str, field: str, label: str, before: Any, after: Any, reason: str,
               item_id: str | None = None) -> dict:
    entry = {"id": uuid.uuid4().hex[:10], "at": _now(), "version": ctx["context_version"], "agent": agent,
             "kind": kind, "field": field, "label": label, "before": before, "after": after, "reason": reason,
             "item_id": item_id, "undone": False}
    ctx.setdefault("profile_log", []).append(entry)
    ctx["profile_log"] = ctx["profile_log"][-LOG_LIMIT:]
    return entry


def apply_now(account_id: int, changes: list[dict], agent: str, reason: str = "", kind: str | None = None) -> dict:
    """Apply changes immediately (no confirmation) and log each one. Returns {context, changes}.

    `kind` overrides the log kind (e.g. 'seed' for the persona); otherwise add/update/remove from the operation.
    Invalid changes are skipped and reported in `errors`."""
    with _LOCK:
        ctx = load_context(account_id)
        logged, errors = [], []
        for ch in changes:
            field = ch.get("field")
            value = ch.get("value", {}) or {}
            op = ch.get("operation", "add")
            try:
                prior = _find(ctx, field, ch.get("target_id"), value.get("type")) if field in LISTS else None
                before = dict(prior["value"]) if prior else None
                res = _apply_change(ctx, ch, agent)
                if op == "remove":
                    if not res.get("removed"):
                        continue
                    after, item_id = None, prior["id"] if prior else None
                else:
                    after, item_id = dict(res["value"]), res["id"]
                if before == after:
                    continue
                k = kind or ("update" if (before is not None and op != "remove") else op)
                logged.append(_log_entry(ctx, agent, k, field, _label(after or before), before, after,
                                         ch.get("reason") or reason, item_id))
            except Exception as e:  # keep going: one bad change must not block the rest
                errors.append(f"{field}: {e}")
        if logged:
            ctx["context_version"] += 1
            for e in logged:
                e["version"] = ctx["context_version"]
        save_context(ctx)
        return {"context": ctx, "changes": logged, "errors": errors}


def undo(account_id: int, change_id: str, agent: str = "you") -> dict:
    """Revert one logged change. Returns {context, change} where change is the new 'undo' log entry."""
    with _LOCK:
        ctx = load_context(account_id)
        entry = next((e for e in ctx.get("profile_log", []) if e["id"] == change_id), None)
        if entry is None:
            raise KeyError(change_id)
        if entry.get("undone") or entry["kind"] == "undo":
            return {"context": ctx, "change": None}
        field, before, after, item_id = entry["field"], entry["before"], entry["after"], entry.get("item_id")
        if field in LISTS:
            items = ctx.setdefault(field, [])
            current = next((x for x in items if x.get("id") == item_id), None) if item_id else None
            if before is None:  # it was an add: remove it
                ctx[field] = [x for x in items if x.get("id") != item_id]
            elif current is not None:  # it was an update: restore
                current["value"] = dict(before)
                current["updated_at"] = _now()
            else:  # it was a remove: put it back
                items.append({"id": item_id or uuid.uuid4().hex[:8], "value": dict(before), "source": "user_confirmed",
                              "proposed_by": agent, "confirmed": True, "created_at": _now(), "updated_at": _now()})
        entry["undone"] = True
        ctx["context_version"] += 1
        new = _log_entry(ctx, agent, "undo", field, entry["label"], after, before, f"Undid: {entry['label']}", item_id)
        new["undoes"] = change_id
        save_context(ctx)
        return {"context": ctx, "change": new}


def last_change_ids(ctx: dict, within_versions: int = 1) -> list[str]:
    """Ids of the not-undone changes made in the most recent version(s), for 'no, that's wrong'."""
    log = [e for e in ctx.get("profile_log", []) if e["kind"] != "undo" and not e.get("undone")]
    if not log:
        return []
    top = max(e["version"] for e in log)
    return [e["id"] for e in log if e["version"] > top - within_versions and e["agent"] not in ("you",)]


def set_doc(account_id: int, key: str, value: Any) -> None:
    """Store an agent document (persona, persona_trace, deck, life_plans) on the context."""
    with _LOCK:
        ctx = load_context(account_id)
        ctx[key] = value
        save_context(ctx)


def get_doc(account_id: int, key: str, default: Any = None) -> Any:
    return load_context(account_id).get(key, default)
