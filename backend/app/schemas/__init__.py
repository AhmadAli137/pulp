"""Pydantic request/response schemas for the PULP API."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel as PydanticBaseModel, ConfigDict, Field, field_validator


class BaseModel(PydanticBaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra='forbid')


class ShockRequest(BaseModel):
    account_id: int = Field(..., description="Any valid account_id from the Tangerine data")
    income_fraction: float = Field(1.0, ge=0.0, le=5.0, description="Retained income fraction r (0.55 = EI at 55%)")
    bills_increase: float = Field(0.0, ge=-1.0, le=10.0, description="Household-bill increase h as a fraction (0.15 = +15%)")
    one_off_cost: float = Field(0.0, ge=0.0, description="One-time cost C in dollars")
    one_off_in_months_of_spending: Optional[float] = Field(None, ge=0.0, description="Alternative: one-off cost as a multiple of typical spending S")
    horizon_months: int = Field(6, ge=1, le=120, description="Scenario duration T in months")
    preset: Optional[Literal["layoff", "furnace", "combined", "baseline"]] = None

    @field_validator("income_fraction", "bills_increase", "one_off_cost")
    @classmethod
    def finite(cls, v):
        if v != v or v in (float("inf"), float("-inf")):
            raise ValueError("must be finite")
        return v


class StrategyAdjustIn(BaseModel):
    label: str = "Custom"
    freed_up_per_month: float = Field(0.0, ge=0.0)
    goal_contribution_per_month: float = Field(0.0, ge=0.0)
    goal_target: float = Field(0.0, ge=0.0)
    emergency_floor: float = Field(0.0, ge=0.0)
    goal_contribution_start: int = Field(0, ge=0, le=240)
    extra_income_per_month: float = Field(0.0, ge=0.0)


class ScenarioIn(BaseModel):
    preset: Optional[Literal["baseline", "income_loss", "higher_costs", "one_off", "positive_income", "combined"]] = None
    scenario_type: str = "custom"
    income_fraction: float = Field(1.0, ge=0.0, le=5.0)
    bills_increase: float = Field(0.0, ge=-1.0, le=10.0)
    one_off_cost: float = Field(0.0, ge=0.0)
    shock_start: int = Field(0, ge=0, le=240)
    shock_duration: int = Field(6, ge=0, le=240)
    positive_income_change: float = Field(0.0, ge=-1.0, le=5.0)
    positive_start: int = Field(0, ge=0, le=240)
    horizon_months: int = Field(24, ge=1, le=240)
    n_paths: int = Field(500, ge=1, le=5000)
    seed: int = 42
    label: str = ""


class SimulateRequest(BaseModel):
    account_id: int
    scenario: ScenarioIn = Field(default_factory=ScenarioIn)
    strategy: Optional[StrategyAdjustIn] = None


class CompareRequest(BaseModel):
    account_id: int
    horizon_months: int = Field(24, ge=6, le=120)
    n_paths: int = Field(400, ge=50, le=3000)


class ContextChange(BaseModel):
    field: Literal["goals", "concerns", "constraints", "preferences", "upcoming_events", "accepted_actions", "completed_actions"]
    operation: Literal["add", "update", "remove"] = "add"
    value: dict[str, Any] = Field(default_factory=dict)
    target_id: Optional[str] = None

    @field_validator('value')
    @classmethod
    def safe_context(cls, value):
        import math
        for key in ('amount','target_amount','target_months','months','months_from_now','priority','fraction'):
            if key in value and value[key] is not None:
                number = value[key]
                if not isinstance(number,(int,float)) or isinstance(number,bool) or not math.isfinite(number) or number < 0:
                    raise ValueError(f'{key} must be a finite nonnegative number')
                if key in ('target_months','months') and (number < 1 or number > 240 or int(number)!=number):
                    raise ValueError(f'{key} must be a whole number from 1 to 240')
        return value


class ProposeRequest(BaseModel):
    account_id: int
    changes: list[ContextChange]
    source: str = "user"
    rationale: str = ""


class ConfirmRequest(BaseModel):
    account_id: int
    proposal_id: str
    accept: bool = True
    replan: bool = True


class EditRequest(BaseModel):
    account_id: int
    change: ContextChange
    replan: bool = False


class ChatRequest(BaseModel):
    account_id: int
    message: str = Field(..., min_length=1, max_length=2000)
    prefer_offline: bool = False


class ReplanRequest(BaseModel):
    account_id: int
    reason: str = "manual replan"


class ErrorOut(BaseModel):
    detail: str
    hint: Optional[str] = None
