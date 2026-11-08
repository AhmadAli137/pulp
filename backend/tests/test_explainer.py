"""Explainer scenes are built in code from the insights and the plan; narration falls back to templates."""
from __future__ import annotations

from app.services.council import run_council
from app.services.context_manager import empty_context
from app.services.explainer import HABIT_KIND, build_scenes, habit_scene, narrate
from tests.test_tangerine_metrics import _synthetic_monthly
from app.services.tangerine_metrics import compute_metrics


def _insights(flags):
    return {"account_id": 1, "flags": flags, "archetype": None, "months": 12,
            "features": {"timing_dip_share": {"value": 0.75}, "neg_months_share": {"value": 0.25}, "regular_transfer_out_amount": {"value": 250.0},
                         "spending_ratio": {"value": 0.97}},
            "narrative": {"headline": "x", "insights": [], "source": "template"}}


def test_habit_scene_picks_first_mapped_flag_with_numbers():
    flags = [{"key": "fragile_but_clean", "label": "Never negative", "severity": "risk", "evidence": "e", "insight": "i"},
             {"key": "savings_elsewhere", "label": "Regular transfer to another bank", "severity": "info",
              "evidence": "a steady unlabelled transfer out of about $250 most months", "insight": "a regular transfer leaves this account"}]
    sc = habit_scene(_insights(flags))
    assert sc["type"] == "habit" and sc["params"]["kind"] == "transfer"
    assert sc["params"]["numbers"]["amount"] == 250.0
    assert "$250" in sc["narration"]
    assert all(k in HABIT_KIND for k in ("timing_dips", "fee_bleed", "thin_margin"))


def test_habit_scene_without_flags_is_calm():
    sc = habit_scene(_insights([]))
    assert sc["params"]["kind"] == "none"


def test_scenes_from_an_offline_plan_cover_runway_and_two_futures():
    m = compute_metrics(_synthetic_monthly(), None, 1)
    plan = run_council(1, m, r=0.55, h=0.0, one_off=0.0, duration=6, horizon=24, n_paths=100, use_ai=False)
    scenes = build_scenes(_insights([]), plan)
    types = [s["type"] for s in scenes]
    assert types[:3] == ["habit", "runway", "two_futures"]
    rw = next(s for s in scenes if s["type"] == "runway")["params"]
    assert rw["duration_months"] == 6 and rw["income_after"] < rw["income_before"]
    assert all(s["narration"] for s in scenes)
    # synthetic account: gap 1400/mo vs 6200 buffer -> runs out before 6 months
    assert rw["runs_out_month"] is not None and rw["runs_out_month"] < 6
    out, source = narrate(scenes, use_ai=False)
    assert source == "template" and out == scenes
