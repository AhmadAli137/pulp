"""Director: deck, deterministic storyboards, param mappers and caption grounding (no network)."""
from __future__ import annotations

import pytest

from app.services import director as D
from app.services.council import run_council
from app.services.context_manager import empty_context
from app.services.tangerine_metrics import compute_metrics
from tests.test_tangerine_metrics import _synthetic_monthly


def _m():
    return compute_metrics(_synthetic_monthly(), None, 1)


def test_deck_is_realistic_and_deterministic_by_key():
    assert len(D.SHOCK_DECK) >= 10
    assert {c["key"] for c in D.SHOCK_DECK} >= {"layoff", "furnace", "combined"}
    lay = D.deal_card("layoff")
    assert lay["r"] == 0.55 and lay["duration"] == 6
    furnace = D.card_shock(D.deal_card("furnace"), S=3600.0)
    assert furnace["one_off"] == pytest.approx(3600.0)
    a, b = D.deal_card("random", seed=1), D.deal_card("random", seed=1)
    assert a == b


def test_timeline_params_match_official_shock():
    m = _m()
    tl = D.timeline_params(m, {"r": 0.55, "h": 0.0, "one_off": 0.0, "duration": 6}, D.deal_card("layoff"))
    assert tl["income_after"] == pytest.approx(0.55 * 4000)
    assert tl["monthly_gap"] == pytest.approx(3600 - 2200)
    assert tl["runs_out_month"] is not None and tl["runs_out_month"] < 6
    assert any(e["label"] == "cushion empty" for e in tl["events"])


def test_twist_storyboard_has_the_story_arc():
    m = _m()
    plan = run_council(1, m, r=0.55, h=0.0, one_off=0.0, duration=6, horizon=24, n_paths=100, use_ai=False)
    beats = D.twist_storyboard(1, m, D.deal_card("layoff"), plan, dealt_randomly=True)
    visuals = [b["visual"] for b in beats]
    assert visuals[:4] == ["shuffle", "timeline", "swarm", "podium"]
    assert "math" in visuals and visuals[-1] == "none"
    sw = next(b for b in beats if b["visual"] == "swarm")["params"]
    assert sw["grid_size"] >= 1 and all(len(c["buffer_path"]) <= 25 for c in sw["candidates"])
    assert sum(c["best"] for c in sw["candidates"]) == 1
    pod = next(b for b in beats if b["visual"] == "podium")["params"]
    assert pod["top"][0]["rank"] == 1
    for b in beats:
        assert b["caption"] and b["duration_s"] > 0


def test_caption_grounding_rejects_invented_numbers():
    params = {"buffer": 6200.0, "gap": 1400.0, "share": 0.38}
    assert D.caption_is_grounded("Your $6,200 cushion loses $1,400 a month, 38% of accounts are like you.", params)
    assert not D.caption_is_grounded("Your $9,999 cushion is fine.", params)
    assert D.caption_is_grounded("No numbers at all here.", params)


def test_math_lines_show_the_sponsor_formula():
    lines = D.math_params(_m(), {"r": 0.55, "h": 0.15, "one_off": 0.0, "duration": 6})["lines"]
    assert any("0.55" in l and "income after" in l for l in lines)
    assert any("runway" in l for l in lines)
