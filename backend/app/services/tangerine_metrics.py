"""Official Tangerine track calculations.

Everything here is deterministic and pure. The sponsor definitions (event README):

  I  typical monthly money in      = median(money_in)
  S  typical monthly spending      = median(money_out)
  F  typical fixed costs           = median(household_bills + insurance + loan_payments)  (per row, then median)
  H  household bills               = median(household_bills)
  B  buffer                        = mean(avg_daily_balance) over the last 6 rows sorted by month
  P  active loan payment           = loans.monthly_payment if loan still running at end of 2025 (status C or D) else 0

Shock with retained-income fraction r, household-bill increase h and one-off cost C:

  income_after   = r * I
  spending_after = S + h * H
  buffer_left    = B - C
  gap            = spending_after - income_after
  runway         = 0 if buffer_left <= 0; "no shortfall (120+)" if gap <= 0; else min(buffer_left / gap, 120)

Runway is displayed to one decimal; horizon decisions use the unrounded value.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict, field
from typing import Any, Optional

import numpy as np
import pandas as pd
from decimal import Decimal, ROUND_HALF_UP

RUNWAY_CAP = 120.0
NO_SHORTFALL_LABEL = "no shortfall (120+)"


# --------------------------------------------------------------------------- profile
@dataclass
class OfficialMetrics:
    account_id: int
    months_available: int
    first_month: str
    last_month: str
    typical_inflow: float          # I
    typical_spending: float        # S
    typical_fixed_costs: float     # F
    household_bills: float         # H
    typical_insurance: float
    typical_loan_payments: float
    buffer: float                  # B
    buffer_months_used: int
    buffer_rows: list[dict]        # the six rows that make B (for "show the math")
    active_loan_payment: float     # P
    loan: Optional[dict]
    typical_surplus: float         # I - S
    baseline_gap: float            # S - I
    baseline_runway: Optional[float]
    baseline_runway_label: str
    observed_negative_balance_days: int
    observed_months_below_zero: int
    observed_min_balance: float
    income_cv: float               # coefficient of variation of money_in (volatility, descriptive only)
    spending_ratio: float          # S / I (0 when I == 0)
    inflow_mix: dict = field(default_factory=dict)
    outflow_mix: dict = field(default_factory=dict)
    history: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _median(series: pd.Series) -> float:
    return float(np.median(series.to_numpy(dtype=float))) if len(series) else 0.0


def compute_metrics(monthly: pd.DataFrame, loan_row: Any | None, account_id: int) -> OfficialMetrics:
    """Compute the sponsor metrics for one account from its monthly_summary rows."""
    m = monthly.sort_values("month").reset_index(drop=True)
    n = len(m)
    if n == 0:
        raise ValueError("no monthly rows")

    I = _median(m.money_in)
    S = _median(m.money_out)
    fixed_rows = m.household_bills + m.insurance + m.loan_payments
    F = _median(fixed_rows)
    H = _median(m.household_bills)
    ins = _median(m.insurance)
    lp = _median(m.loan_payments)

    last6 = m.tail(6)
    B = float(last6.avg_daily_balance.mean())

    P = 0.0
    loan = None
    if loan_row is not None:
        status = str(loan_row.status)
        running = status in ("C", "D")
        P = float(loan_row.monthly_payment) if running else 0.0
        loan = {
            "loan_id": int(loan_row.loan_id),
            "loan_start": str(loan_row.loan_start),
            "amount": float(loan_row.amount),
            "duration_months": int(loan_row.duration_months),
            "monthly_payment": float(loan_row.monthly_payment),
            "status": status,
            "status_meaning": str(loan_row.status_meaning),
            "running_end_2025": running,
        }

    base = compute_shock(I, S, H, B, r=1.0, h=0.0, one_off=0.0)
    mean_in = float(m.money_in.mean())
    income_cv = float(m.money_in.std(ddof=0) / mean_in) if mean_in > 0 else 0.0

    inflow_mix = {
        "cash_deposits": float(m.cash_deposits.sum()),
        "transfers_in": float(m.transfers_in.sum()),
        "pension_in": float(m.pension_in.sum()),
        "interest_in": float(m.interest_in.sum()),
    }
    outflow_mix = {
        "household_bills": float(m.household_bills.sum()),
        "insurance": float(m.insurance.sum()),
        "loan_payments": float(m.loan_payments.sum()),
        "bank_fees": float(m.bank_fees.sum()),
        "cash_withdrawals_genuine": float(m.cash_withdrawals_genuine.sum()),
        "card_withdrawals": float(m.card_withdrawals.sum()),
        "transfers_out_other": float(m.transfers_out_other.sum()),
    }
    history = [
        {
            "month": str(r.month),
            "money_in": float(r.money_in),
            "money_out": float(r.money_out),
            "household_bills": float(r.household_bills),
            "insurance": float(r.insurance),
            "loan_payments": float(r.loan_payments),
            "fixed_costs": float(r.household_bills + r.insurance + r.loan_payments),
            "month_end_balance": float(r.month_end_balance),
            "min_balance": float(r.min_balance),
            "avg_daily_balance": float(r.avg_daily_balance),
            "days_below_zero": int(r.days_below_zero),
        }
        for r in m.itertuples(index=False)
    ]

    return OfficialMetrics(
        account_id=int(account_id),
        months_available=n,
        first_month=str(m.month.iloc[0]),
        last_month=str(m.month.iloc[-1]),
        typical_inflow=I,
        typical_spending=S,
        typical_fixed_costs=F,
        household_bills=H,
        typical_insurance=ins,
        typical_loan_payments=lp,
        buffer=B,
        buffer_months_used=len(last6),
        buffer_rows=[{"month": str(r.month), "avg_daily_balance": float(r.avg_daily_balance)} for r in last6.itertuples(index=False)],
        active_loan_payment=P,
        loan=loan,
        typical_surplus=I - S,
        baseline_gap=S - I,
        baseline_runway=base["runway"],
        baseline_runway_label=base["runway_label"],
        observed_negative_balance_days=int(m.days_below_zero.sum()),
        observed_months_below_zero=int((m.days_below_zero > 0).sum()),
        observed_min_balance=float(m.min_balance.min()),
        income_cv=income_cv,
        spending_ratio=(S / I) if I > 0 else 0.0,
        inflow_mix=inflow_mix,
        outflow_mix=outflow_mix,
        history=history,
    )


# --------------------------------------------------------------------------- shock
def runway_from(buffer_left: float, gap: float) -> tuple[Optional[float], str, str]:
    """Return (runway_unrounded or None, display label, status code).

    status: 'exhausted' (buffer_left <= 0), 'no_shortfall' (gap <= 0), 'capped' (>=120), 'finite'.
    """
    if buffer_left <= 0:
        return 0.0, "0.0", "exhausted"
    if gap <= 0:
        return None, NO_SHORTFALL_LABEL, "no_shortfall"
    rw = buffer_left / gap
    if rw >= RUNWAY_CAP:
        return RUNWAY_CAP, f"{RUNWAY_CAP:.1f}", "capped"
    return rw, f"{rw:.1f}", "finite"


def compute_shock(I: float, S: float, H: float, B: float, *, r: float = 1.0, h: float = 0.0,
                  one_off: float = 0.0) -> dict:
    """Apply the sponsor shock formula. All inputs unrounded."""
    di, ds, dh, db, dr, dhike, dc = map(lambda x: Decimal(str(x)), (I, S, H, B, r, h, one_off))
    income_after = float(dr * di)
    spending_after = float(ds + dhike * dh)
    buffer_left = float(db - dc)
    gap = float(ds + dhike * dh - dr * di)
    rw, label, status = runway_from(buffer_left, gap)
    display = float(Decimal(str(rw)).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)) if rw is not None else None
    if display is not None:
        label = f"{display:.1f}"
    return {
        "inputs": {"I": I, "S": S, "H": H, "B": B, "r": r, "h": h, "one_off": one_off},
        "income_after": income_after,
        "spending_after": spending_after,
        "buffer_left": buffer_left,
        "monthly_gap": gap,
        "runway": rw,                       # unrounded (None when no shortfall)
        "runway_display": display,
        "runway_label": label,
        "runway_status": status,
    }


def horizon_verdict(shock: dict, horizon_months: int) -> dict:
    """Does the account last `horizon_months` under this shock? Uses unrounded values.

    Assumes the specified cash flows continue unchanged through the selected period.
    """
    T = int(horizon_months)
    status = shock["runway_status"]
    bl = shock["buffer_left"]
    gap = shock["monthly_gap"]
    if status == "exhausted":
        shortfall_total = -bl + max(0.0, gap) * T   # money missing today plus ongoing gap
        return {
            "horizon_months": T, "survives": False, "exact_at_horizon": False,
            "months_covered": 0.0, "shortfall_over_horizon": shortfall_total,
            "cash_left_at_horizon": bl - max(0.0, gap) * T,
            "verdict": (f"Immediate funding gap: ${-bl:,.0f}. Future income cannot pay an upfront bill today." if bl < 0 else "The buffer is exhausted now; official runway is zero. Ongoing income and spending must be considered separately."),
        }
    if status == "no_shortfall":
        return {
            "horizon_months": T, "survives": True, "exact_at_horizon": False,
            "months_covered": float(T), "shortfall_over_horizon": 0.0,
            "cash_left_at_horizon": bl + (-gap) * T,
            "verdict": f"Makes it. Income still covers spending; the buffer grows by about ${(-gap) * T:,.0f} over {T} months.",
        }
    rw = shock["runway"]
    needed = gap * T
    cash_left = bl - needed
    exact = abs(cash_left) < 1e-9
    survives = cash_left >= -1e-9
    if exact:
        verdict = f"Cash runs out exactly at the {T}-month mark."
    elif survives:
        verdict = f"Makes it. Runway is {rw:.1f} months with about ${cash_left:,.0f} left after {T} months."
    else:
        verdict = f"Does not make it. Cash runs out after {rw:.1f} months, {T - rw:.1f} months short, a ${-cash_left:,.0f} shortfall."
    return {
        "horizon_months": T, "survives": survives, "exact_at_horizon": exact,
        "months_covered": min(rw, float(T)),
        "shortfall_over_horizon": max(0.0, -cash_left),
        "cash_left_at_horizon": cash_left,
        "verdict": verdict,
    }


def explain_change(baseline: dict, shocked: dict) -> dict:
    """Which input drove the change from baseline to shocked? Decompose the gap change."""
    d_income = shocked["income_after"] - baseline["income_after"]       # negative = lost income
    d_spend = shocked["spending_after"] - baseline["spending_after"]     # positive = higher bills
    d_buffer = shocked["buffer_left"] - baseline["buffer_left"]          # negative = one-off cost
    contributions = {
        "income_change_per_month": -d_income,
        "spending_change_per_month": d_spend,
        "one_off_cost": -d_buffer,
    }
    drivers = []
    if abs(d_income) > 0.005:
        drivers.append(("income", abs(d_income), f"Income fell by ${-d_income:,.0f} a month"))
    if abs(d_spend) > 0.005:
        drivers.append(("spending", abs(d_spend), f"Spending rose by ${d_spend:,.0f} a month"))
    if abs(d_buffer) > 0.005:
        # compare one-off against the per-month gap on a six-month scale so magnitudes are comparable
        drivers.append(("one_off", abs(d_buffer) / 6.0, f"A one-off cost of ${-d_buffer:,.0f} came off the buffer"))
    drivers.sort(key=lambda x: -x[1])
    primary = drivers[0][0] if drivers else "none"
    summary = "; ".join(d[2] for d in drivers) if drivers else "No change from baseline."
    return {"primary_driver": primary, "drivers": [d[0] for d in drivers], "summary": summary, "contributions": contributions}


# --------------------------------------------------------------------------- plans
def goal_plan(shock: dict, horizon_months: int) -> dict:
    """Before-the-shock plan: build the buffer this scenario would need.

    cash_needed = C + T * max(0, gap). Compare with B. Capacity to save = typical surplus (labelled assumption).
    """
    T = int(horizon_months)
    C = shock["inputs"]["one_off"]
    gap = shock["monthly_gap"]
    B = shock["inputs"]["B"]
    I = shock["inputs"]["I"]
    S = shock["inputs"]["S"]
    surplus = I - S
    need = C + T * max(0.0, gap)
    additional = max(0.0, need - B)
    months_to_target = None
    reachable = True
    if additional <= 0:
        note = f"The current buffer of ${B:,.0f} already covers the ${need:,.0f} this scenario needs over {T} months."
    elif surplus > 0:
        months_to_target = additional / surplus
        note = (f"Set aside the typical monthly surplus of ${surplus:,.0f}; at that pace the extra ${additional:,.0f} "
                f"takes about {months_to_target:.1f} months.")
    else:
        reachable = False
        note = (f"Typical spending is at or above typical inflow (surplus ${surplus:,.0f}), so the extra ${additional:,.0f} "
                f"cannot be reached from the current estimated surplus alone. Freeing spending or adding income is required.")
    return {
        "type": "goal",
        "title": "Before the shock: build the buffer this scenario needs",
        "horizon_months": T,
        "cash_needed": need,
        "current_buffer": B,
        "additional_buffer_needed": additional,
        "capacity_to_save_per_month": surplus,
        "capacity_assumption": "Capacity to save is estimated as typical inflow minus typical spending (I - S). Actual capacity may differ.",
        "months_to_target": months_to_target,
        "reachable_from_surplus": reachable,
        "note": note,
    }


def backup_plan(shock: dict, horizon_months: int) -> dict:
    """If the shock happens: immediate funding need and recurring gap, separately."""
    T = int(horizon_months)
    C = shock["inputs"]["one_off"]
    B = shock["inputs"]["B"]
    gap = shock["monthly_gap"]
    bl = shock["buffer_left"]
    immediate = max(0.0, C - B)
    recurring = max(0.0, gap)
    if bl <= 0:
        monthly_improvement = recurring
        note = (f"The upfront bill exceeds the buffer: ${immediate:,.0f} is needed immediately, and monthly savings later "
                f"cannot pay today's bill. After that, each month still needs ${recurring:,.0f} covered.")
    else:
        monthly_improvement = max(0.0, gap - bl / T)
        if recurring == 0:
            note = "No monthly shortfall under this shock; no change in monthly cash flow is required to last the horizon."
        elif monthly_improvement == 0:
            note = f"The remaining buffer of ${bl:,.0f} covers the ${recurring:,.0f} monthly gap for the full {T} months."
        else:
            note = (f"To last {T} months, free up ${monthly_improvement:,.0f} a month (cut spending or add income). "
                    f"The remaining buffer of ${bl:,.0f} covers the rest of the ${recurring:,.0f} monthly gap.")
    total_shortfall = max(0.0, recurring * T - max(0.0, bl)) + immediate
    return {
        "type": "backup",
        "title": "If it happens: cover the gap for the horizon",
        "horizon_months": T,
        "immediate_need": immediate,
        "recurring_gap": recurring,
        "buffer_left": bl,
        "monthly_improvement_needed": monthly_improvement,
        "unresolved_gap_over_horizon": total_shortfall,
        "note": note,
        "no_discretionary_inference": "Amounts are what must be freed up; the data does not label discretionary spending, so no cut is invented.",
    }


def tipping_point(I: float, S: float, H: float, B: float, *, r: float, one_off: float, horizon_months: int) -> dict:
    """Largest household-bill increase h (fraction) the account absorbs through T months, given r and one-off."""
    T = int(horizon_months)
    bl = B - one_off
    if bl <= 0:
        return {"kind": "upfront_shortfall", "max_bill_increase": None, "absorbable_extra_per_month": None,
                "note": "The one-off cost alone exhausts the buffer, so no level of bills is absorbable."}
    base_gap = S - r * I
    room = bl / T - base_gap  # per-month room for extra bills
    if room < 0:
        return {"kind": "already_fails", "max_bill_increase": None, "absorbable_extra_per_month": None,
                "note": f"Even with no bill increase the account lasts only {bl / base_gap:.1f} months under this income shock."}
    if H <= 0:
        return {"kind": "no_household_bills", "max_bill_increase": None, "absorbable_extra_per_month": room,
                "note": f"This account has no labelled household bills; it could absorb up to ${room:,.0f} of new monthly costs through {T} months."}
    hmax = room / H
    return {"kind": "ok", "max_bill_increase": hmax, "absorbable_extra_per_month": room,
            "note": f"Household bills could rise up to {hmax * 100:.0f}% (${room:,.0f}/month) and the account would still last {T} months."}


def full_shock_report(m: OfficialMetrics, *, r: float, h: float, one_off: float, horizon_months: int) -> dict:
    """Everything the judge needs for one twist on one account."""
    I, S, H, B = m.typical_inflow, m.typical_spending, m.household_bills, m.buffer
    baseline = compute_shock(I, S, H, B)
    shocked = compute_shock(I, S, H, B, r=r, h=h, one_off=one_off)
    verdict = horizon_verdict(shocked, horizon_months)
    return {
        "account_id": m.account_id,
        "baseline": baseline,
        "shocked": shocked,
        "verdict": verdict,
        "change_in_monthly_cash_flow": -(shocked["monthly_gap"] - baseline["monthly_gap"]),
        "upfront_cost": one_off,
        "remaining_buffer": shocked["buffer_left"],
        "explanation": explain_change(baseline, shocked),
        "goal_plan": goal_plan(shocked, horizon_months),
        "backup_plan": backup_plan(shocked, horizon_months),
        "tipping_point": tipping_point(I, S, H, B, r=r, one_off=one_off, horizon_months=horizon_months),
        "assumptions": [
            "The specified cash flows continue unchanged through the selected period.",
            "Official runway follows the Tangerine definitions; the horizon verdict is kept separate from the runway display.",
            "Fixed costs are already inside typical spending; the active loan payment is not added again.",
        ],
    }
