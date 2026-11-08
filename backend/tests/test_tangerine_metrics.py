"""Calculation checks for the official Tangerine engine.

The synthetic fixture (I=4000, S=3600, H=1000, B=6200) is from the build prompt and is NOT a dataset
discovery. Dataset-backed tests live in test_data_accounts.py.
"""
import math

import pandas as pd
import pytest

from app.services.tangerine_metrics import (
    compute_metrics, compute_shock, horizon_verdict, goal_plan, backup_plan, tipping_point,
    explain_change, full_shock_report, NO_SHORTFALL_LABEL,
)

I, S, H, B = 4000.0, 3600.0, 1000.0, 6200.0


def test_synthetic_combined_shock_matches_prompt():
    sh = compute_shock(I, S, H, B, r=0.55, h=0.15, one_off=0.0)
    assert sh["income_after"] == pytest.approx(2200.0)
    assert sh["spending_after"] == pytest.approx(3750.0)
    assert sh["monthly_gap"] == pytest.approx(1550.0)
    assert sh["runway_display"] == pytest.approx(4.0)
    assert sh["runway_label"] == "4.0"
    v = horizon_verdict(sh, 6)
    assert v["survives"] is False
    assert v["shortfall_over_horizon"] == pytest.approx(3100.0)


def test_baseline_no_shortfall():
    sh = compute_shock(I, S, H, B)
    assert sh["runway"] is None
    assert sh["runway_label"] == NO_SHORTFALL_LABEL
    assert sh["runway_status"] == "no_shortfall"
    v = horizon_verdict(sh, 6)
    assert v["survives"] is True


def test_layoff_only():
    sh = compute_shock(I, S, H, B, r=0.55)
    # gap = 3600 - 2200 = 1400; runway = 6200/1400 = 4.428...
    assert sh["monthly_gap"] == pytest.approx(1400.0)
    assert sh["runway"] == pytest.approx(6200 / 1400)
    assert sh["runway_label"] == "4.4"
    assert horizon_verdict(sh, 6)["survives"] is False
    assert horizon_verdict(sh, 4)["survives"] is True


def test_one_off_equal_to_typical_spending():
    sh = compute_shock(I, S, H, B, one_off=S)
    assert sh["buffer_left"] == pytest.approx(2600.0)
    assert sh["runway_status"] == "no_shortfall"  # gap still negative


def test_exhausted_buffer():
    sh = compute_shock(I, S, H, B, one_off=7000.0)
    assert sh["runway"] == 0.0
    assert sh["runway_label"] == "0.0"
    assert sh["runway_status"] == "exhausted"
    v = horizon_verdict(sh, 6)
    assert v["survives"] is False
    bp = backup_plan(sh, 6)
    assert bp["immediate_need"] == pytest.approx(800.0)


def test_capped_runway():
    sh = compute_shock(I, S, H, 1_000_000.0, r=0.55)
    assert sh["runway"] == 120.0
    assert sh["runway_status"] == "capped"
    assert sh["runway_label"] == "120.0"


def test_exactly_at_horizon():
    # choose B so that buffer / gap == 6 exactly: gap 1400 -> B = 8400
    sh = compute_shock(I, S, H, 8400.0, r=0.55)
    v = horizon_verdict(sh, 6)
    assert v["exact_at_horizon"] is True
    assert v["survives"] is True


def test_unrounded_used_for_horizon():
    # runway displays 6.0 but is 5.96 -> should fail a 6-month horizon
    gap = 1400.0
    sh = compute_shock(I, S, H, gap * 5.96, r=0.55)
    assert sh["runway_label"] == "6.0"
    assert horizon_verdict(sh, 6)["survives"] is False


def test_goal_plan_numbers():
    sh = compute_shock(I, S, H, B, r=0.55, h=0.15)
    gp = goal_plan(sh, 6)
    assert gp["cash_needed"] == pytest.approx(9300.0)
    assert gp["additional_buffer_needed"] == pytest.approx(3100.0)
    assert gp["capacity_to_save_per_month"] == pytest.approx(400.0)
    assert gp["months_to_target"] == pytest.approx(7.75)


def test_goal_plan_zero_surplus():
    sh = compute_shock(I, I, H, B, r=0.55)  # S == I
    gp = goal_plan(sh, 6)
    assert gp["reachable_from_surplus"] is False


def test_backup_plan_monthly_improvement():
    sh = compute_shock(I, S, H, B, r=0.55, h=0.15)
    bp = backup_plan(sh, 6)
    assert bp["immediate_need"] == 0.0
    assert bp["recurring_gap"] == pytest.approx(1550.0)
    # 1550 - 6200/6 = 1550 - 1033.33 = 516.67
    assert bp["monthly_improvement_needed"] == pytest.approx(1550 - 6200 / 6)
    assert bp["unresolved_gap_over_horizon"] == pytest.approx(3100.0)


def test_tipping_point_cases():
    tp = tipping_point(I, S, H, B, r=0.55, one_off=0.0, horizon_months=6)
    # room = 6200/6 - 1400 = -366.67 -> already fails
    assert tp["kind"] == "already_fails"
    tp2 = tipping_point(I, S, H, 12000.0, r=0.55, one_off=0.0, horizon_months=6)
    # room = 2000 - 1400 = 600 -> h = 0.6
    assert tp2["kind"] == "ok" and tp2["max_bill_increase"] == pytest.approx(0.6)
    tp3 = tipping_point(I, S, 0.0, 12000.0, r=0.55, one_off=0.0, horizon_months=6)
    assert tp3["kind"] == "no_household_bills"
    tp4 = tipping_point(I, S, H, B, r=1.0, one_off=7000.0, horizon_months=6)
    assert tp4["kind"] == "upfront_shortfall"


def test_explain_change_primary_driver():
    base = compute_shock(I, S, H, B)
    sh = compute_shock(I, S, H, B, r=0.55, h=0.15)
    ex = explain_change(base, sh)
    assert ex["primary_driver"] == "income"
    sh2 = compute_shock(I, S, H, B, h=0.15)
    assert explain_change(base, sh2)["primary_driver"] == "spending"


def _synthetic_monthly():
    rows = []
    for k, (mi, mo, hb, adb) in enumerate([
        (4000, 3600, 1000, 6000), (4000, 3600, 1000, 6100), (3800, 3700, 1000, 6200),
        (4200, 3500, 1000, 6300), (4000, 3600, 1000, 6200), (4000, 3600, 1000, 6400),
        (4000, 3600, 1000, 6000),
    ]):
        rows.append({
            "account_id": 1, "month": f"2025-{k + 1:02d}", "money_in": mi, "money_out": mo,
            "cash_deposits": mi, "transfers_in": 0, "pension_in": 0, "interest_in": 0,
            "household_bills": hb, "insurance": 100, "loan_payments": 0, "bank_fees": 0,
            "cash_withdrawals_genuine": mo - hb - 100, "card_withdrawals": 0, "transfers_out_other": 0,
            "month_end_balance": adb, "min_balance": adb - 100, "avg_daily_balance": adb, "days_below_zero": 0,
        })
    return pd.DataFrame(rows)


def test_compute_metrics_definitions():
    m = compute_metrics(_synthetic_monthly(), None, 1)
    assert m.typical_inflow == 4000.0
    assert m.typical_spending == 3600.0
    assert m.household_bills == 1000.0
    assert m.typical_fixed_costs == 1100.0
    # last six rows: 6100,6200,6300,6200,6400,6000 -> mean 6200
    assert m.buffer == pytest.approx(6200.0)
    assert m.buffer_months_used == 6
    assert m.active_loan_payment == 0.0
    assert m.baseline_runway_label == NO_SHORTFALL_LABEL


def test_compute_metrics_short_history():
    m = compute_metrics(_synthetic_monthly().head(4), None, 1)
    assert m.buffer_months_used == 4


def test_full_report_shape():
    m = compute_metrics(_synthetic_monthly(), None, 1)
    rep = full_shock_report(m, r=0.55, h=0.15, one_off=0.0, horizon_months=6)
    for k in ("baseline", "shocked", "verdict", "goal_plan", "backup_plan", "tipping_point", "explanation"):
        assert k in rep
    assert rep["shocked"]["runway_display"] == 4.0


def test_bills_shock_warns_when_account_has_no_household_bills():
    rows = _synthetic_monthly().copy()
    rows["household_bills"] = 0.0
    m = compute_metrics(rows, None, 1)
    assert m.household_bills == 0.0
    rep = full_shock_report(m, r=0.55, h=0.15, one_off=0.0, horizon_months=6)
    assert any("no labelled household bills" in w for w in rep["warnings"])
    # the formula itself is unchanged: bills +15% of 0 adds nothing
    assert rep["shocked"]["spending_after"] == pytest.approx(m.typical_spending)
    assert full_shock_report(compute_metrics(_synthetic_monthly(), None, 1), r=0.55, h=0.15, one_off=0.0, horizon_months=6)["warnings"] == []
