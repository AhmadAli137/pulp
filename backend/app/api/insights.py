"""Demographic and location insights (work package D)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..services.demographics import demographics

router = APIRouter(prefix="/api", tags=["insights"])


@router.get("/insights/demographics/{account_id}")
def get_demographics(account_id: int) -> dict:
    try:
        return demographics(account_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
