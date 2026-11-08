"""Life actions: levers become decisions grounded in the account's own spending mix."""
from __future__ import annotations

import pandas as pd

from app.services.life_actions import future_action, habit_actions, humanize_candidate, life_actions, spending_mix
from app.services.tangerine_metrics import compute_metrics
from tests.test_tangerine_metrics import _synthetic_monthly


def _m():
    return compute_metrics(_synthetic_monthly(), None, 1)


def _row(**kw):
    base = dict(bills_share=0.3, insurance_share=0.05, loan_share=0.0, fee_share=0.001, cash_wd_share=0.2, card_wd_share=0.35, transfer_out_share=0.1,
                regular_transfer_out=False, regular_transfer_out_amount=0.0)
    base.update(kw)
    return pd.Series(base)


def _cand(label, freed=0.0, contrib=0.0, floor=0.0, extra=0.0, p=0.5, source="grid"):
    return {"label": label, "source": source, "levers": {"freed_up_per_month": freed, "goal_contribution_per_month": contrib, "emergency_floor": floor, "extra_income_per_month": extra},
            "prob_shortfall_under_stress": p, "goal_progress_at_deadline": 0.0, "months_to_goal_deterministic": None, "flags": [], "adjusted_score": 0.3}


def test_spend_less_names_the_biggest_flexible_category():
    m, row = _m(), _row()
    req = {"goal": {"label": "Emergency fund", "target_amount": 0.0}}
    stay = _cand("stay the course", p=0.7)
    c = humanize_candidate(_cand("trim spending 10.0%", freed=360.0, p=0.4), m, row, req, stay)
    assert c["action"].startswith("Spend about $360 less a month") and "card purchases" in c["action"]
    assert "70% to 40%" in c["means"]
    assert c["horizon"] == "this month"


def test_regular_transfer_becomes_pause_the_transfer():
    m, row = _m(), _row(regular_transfer_out=True, regular_transfer_out_amount=300.0, transfer_out_share=0.4, card_wd_share=0.1)
    c = humanize_candidate(_cand("trim spending 5.0%", freed=180.0, p=0.4), m, row, {"goal": {"label": "x", "target_amount": 0.0}}, None)
    assert c["action"].startswith("Pause the $300 monthly transfer")


def test_strategist_decision_label_is_kept_and_extra_income_is_a_job():
    m, row = _m(), _row()
    c = humanize_candidate(_cand("Pick up a weekend shift", extra=600.0, p=0.2, source="strategist"), m, row, {"goal": {"label": "x", "target_amount": 0.0}}, None)
    assert c["action"] == "Pick up a weekend shift"
    assert "600" in c["how"] and c["horizon"] == "this month"


def test_habits_and_future_lines():
    m, row = _m(), _row(regular_transfer_out=True, regular_transfer_out_amount=120.0)
    mix = spending_mix(m, row)
    acts = habit_actions([{"key": "timing_dips"}, {"key": "savings_elsewhere"}], mix)
    assert any("bill dates" in a["title"] for a in acts)
    assert any("other account" in a["title"] for a in acts)
    fut = future_action(m, row)
    assert fut["horizon"] == "later" and "six" in fut["how"].lower()


def test_life_actions_beat_orders_plans_then_habits_then_future():
    m, row = _m(), _row()
    stay = _cand("stay the course", p=0.7)
    best = humanize_candidate(_cand("trim spending 10.0%", freed=360.0, p=0.4), m, row, {"goal": {"label": "x", "target_amount": 0.0}}, stay)
    plan = {"ranked": [best, stay], "stay_the_course": stay}
    out = life_actions(plan, m, row, [{"key": "thin_margin"}])
    kinds = [a["source"] for a in out["actions"]]
    assert kinds[0] == "grid" and "habit" in kinds and kinds[-1] == "future"
    assert "70% → 40%" in out["actions"][0]["effect"]
