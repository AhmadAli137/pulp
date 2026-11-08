"""Council: deterministic parts only (no network). The ADK agents are exercised manually and in the demo."""
from __future__ import annotations

import pytest

from app.services.council import _attach_flags, _clamp_lever, _json_block, fan_out, freeze_request, run_council
from app.services.context_manager import empty_context
from app.services.tangerine_metrics import OfficialMetrics


def _metrics() -> OfficialMetrics:
    """Synthetic account shared with the metrics tests: I=4000, S=3600, H=1000, B=6200."""
    from tests.test_tangerine_metrics import _synthetic_monthly
    from app.services.tangerine_metrics import compute_metrics
    return compute_metrics(_synthetic_monthly(), None, 1)


def test_freeze_request_matches_official_shock():
    m = _metrics()
    req = freeze_request(m, empty_context(1), r=0.55, h=0.0, one_off=0.0, duration=6, horizon=24, n_paths=100)
    off = req["shock"]["official"]
    assert off["income_after"] == pytest.approx(0.55 * 4000)
    assert off["monthly_gap"] == pytest.approx(3600 - 2200)  # H is irrelevant with h=0
    assert req["stress_need"] == pytest.approx(6 * 1400)
    assert req["goal"]["type"] == "emergency_fund"   # default goal when nothing is confirmed


def test_fan_out_has_stay_the_course_and_is_ranked_by_code():
    m = _metrics()
    req = freeze_request(m, empty_context(1), r=0.55, h=0.0, one_off=0.0, duration=6, horizon=24, n_paths=100)
    cands = fan_out(m, req)
    labels = [c["label"] for c in cands]
    assert "stay the course" in labels
    assert len(cands) >= 10
    for c in cands:
        assert 0.0 <= c["prob_shortfall_under_stress"] <= 1.0
        assert 0.0 <= c["goal_progress_at_deadline"] <= 1.0
        assert c["source"] == "grid"


def test_clamp_lever_boxes_model_numbers():
    m = _metrics()
    req = freeze_request(m, empty_context(1), r=0.55, h=0.0, one_off=0.0, duration=6, horizon=24, n_paths=100)
    strat, notes = _clamp_lever(m, req, {"label": "x", "freed_up_per_month": 99999, "goal_contribution_per_month": -5,
                                         "emergency_floor": "abc", "extra_income_per_month": 10**9})
    assert strat is not None
    assert strat.freed_up_per_month == pytest.approx(0.30 * 3600)
    assert strat.goal_contribution_per_month == 0.0
    assert strat.extra_income_per_month == pytest.approx(0.50 * 4000)
    assert any("capped" in n for n in notes)
    none, notes2 = _clamp_lever(m, req, {"label": "nothing"})
    assert none is None and notes2


def test_json_block_tolerates_fences_and_prose():
    assert _json_block('Here you go:\n```json\n{"levers": []}\n```')["levers"] == []
    assert _json_block('{"flags": [{"candidate": "a"}]} trailing')["flags"][0]["candidate"] == "a"
    assert _json_block("no json here") is None


def test_attach_flags_matches_labels_case_insensitively():
    cands = [{"label": "Stay the course", "flags": []}, {"label": "trim spending 5.0%", "flags": []}]
    unmatched = _attach_flags(cands, [{"candidate": "stay the COURSE", "risk": "r", "severity": "high"}, {"candidate": "zzz"}])
    assert len(cands[0]["flags"]) == 1 and cands[1]["flags"] == []
    assert len(unmatched) == 1


def test_run_council_offline_never_needs_a_model():
    m = _metrics()
    out = run_council(1, m, r=0.55, h=0.15, one_off=0.0, duration=6, horizon=24, n_paths=100, use_ai=False)
    assert out["mode"] == "offline"
    assert out["recommended"] is not None
    assert out["ranked"][0]["adjusted_score"] >= out["ranked"][-1]["adjusted_score"]
    assert out["stay_the_course"] is not None
    assert "P(shortfall)" in out["objective"]["formula"]
