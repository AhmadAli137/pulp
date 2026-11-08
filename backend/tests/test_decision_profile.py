import pandas as pd
from app.services.decision_profile import build_decision_profile
from app.services.intake import pick_question
from app.services import context_manager as cm, director as D, gemini_agent as g
from tests.test_director import _m


def profile(constraints=None, goals=None, **features):
    monthly = pd.DataFrame({"month": ["2025-01", "2025-02", "2025-03"], "money_in": [2000, 2000, 2000], "money_out": [1800, 2100, 1900]})
    summary = cm.summarize(cm.empty_context(1))
    summary.update(constraints=constraints or [], goals=goals or [])
    return build_decision_profile(monthly, pd.Series(features, dtype=object), summary), summary


def test_profile_preserves_evidence_limits_and_actual_monthly_room():
    p, _ = profile(regular_transfer_out_amount=300, pension_share=.99)
    assert p["recent_monthly_room"] == 100
    assert p["lowest_recorded_monthly_room"] == -100
    assert p["period"]["to"] == "2025-03"
    transfer = next(o for o in p["observations"] if o["key"] == "transfer_purpose")
    assert transfer["needs_answer"] and "family support" in transfer["life_effect"]
    assert "monthly expense" in p["decisions"]["small"][0]["label"]
    assert any("Card and cash" in x for x in p["limits"])


def test_confirmed_answers_remove_questions_and_goal_timing_has_priority():
    p, s = profile(constraints=[{"type": "transfer_purpose", "value": "rent"}], goals=[{"type": "travel", "label": "Vacation"}], regular_transfer_out_amount=300)
    assert not any(q["key"] == "transfer_purpose" for q in p["questions"])
    q = pick_question(s, [], {"decision_profile": p})
    assert q["key"] == "goal_timing" and "vacation" in q["text"]
    assert "wait longer" in p["decisions"]["big"][0]["label"]


def test_bill_timing_produces_small_decision_not_a_spending_cut():
    p, _ = profile(timing_dip_share=.8, neg_months_share=.5)
    assert "bill date" in p["decisions"]["small"][0]["label"]


def test_purchase_comparison_requires_supplied_cost_and_keeps_tradeoff_explicit():
    tools = D._Tools(1, _m())
    tools.user_message = "Should I add a $50 monthly service?"
    assert "needs_context" in tools.compare_purchase(500)
    out = tools.compare_purchase(50, recurring=True)
    assert out["keep_money"]["retained_after_one_year"] == 600
    assert out["buy"]["monthly_room_after"] == 350
    assert "not proof of affordability" in out["limits"]
    assert "needs_context" in tools.compare_purchase(float("nan"))


def test_protected_spending_is_remembered_without_inventing_cut_capacity():
    summary = cm.summarize(cm.empty_context(1))
    extraction = g.offline_extract("I cannot cut my spending", summary)
    values = [c.value for c in extraction.proposed_changes]
    assert any(v.get("type") == "protected_spending" for v in values)
    assert any(v.get("type") == "can_free_up_per_month" and v["amount"] == 0 for v in values)


def test_purchase_does_not_silently_become_the_vacation_budget():
    summary = cm.summarize(cm.empty_context(1))
    summary["goals"] = [{"type": "travel"}]
    ex = g.offline_extract("Should I add a $50 monthly service?", summary)
    assert not any(c.field == "goals" for c in ex.proposed_changes)


def test_planning_tool_asks_before_assuming_goal_budget_or_date():
    cm.direct_edit(1, {"field": "goals", "value": {"type": "travel"}})
    tools = D._Tools(1, _m())
    tools.shock = {"r": 1, "h": 0, "one_off": 1500, "duration": 1}
    assert "needs_context" in tools.run_council()
