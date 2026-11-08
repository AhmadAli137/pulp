"""Agent traces and the Stage 1 report (docs/agents/v2-contracts.md). Deterministic; no model calls."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..services.agent_trace import build_trace
from ..services.data_store import get_store
from ..services.stage1_report import build_report

router = APIRouter(prefix="/api", tags=["reports"])


def _check(account_id: int) -> None:
    if not get_store().has_account(int(account_id)):
        raise HTTPException(404, f"Unknown account_id {account_id}")


@router.get("/agents/trace/{account_id}")
def agent_trace(account_id: int) -> dict:
    _check(account_id)
    return build_trace(account_id)


@router.get("/report/stage1")
def stage1_report(account_id: int | None = Query(default=None)) -> dict:
    if account_id is not None:
        _check(account_id)
    try:
        return build_report(account_id)
    except KeyError:
        raise HTTPException(404, f"Unknown account_id {account_id}")
