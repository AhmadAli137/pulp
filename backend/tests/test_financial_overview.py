from datetime import date
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import context_manager as cm
from app.services.financial_overview import overview, briefing, goal_progress


def test_unknown_balances_and_savings_are_not_zero():
    cm.direct_edit(20111, {"field": "goals", "value": {"type": "travel", "target_amount": 5000, "target_months": 12}})
    view = overview(20111)
    assert view["position"] is None
    assert view["recorded"]["debt_balance_known"] is False
    assert view["goals"][0]["saved"] is None
    assert view["goals"][0]["progress"] is None
    assert any("already set aside" in q for q in view["questions"])


def test_partial_position_totals_and_goal_allocation_are_separate():
    cm.direct_edit(20111, {"field": "constraints", "value": {"type": "financial_position", "as_of": "2026-01-01", "assets": [{"label": "Savings", "amount": 1200}], "liabilities": [{"label": "Card", "amount": 1800}], "complete": False}})
    cm.direct_edit(20111, {"field": "goals", "value": {"type": "travel", "target_amount": 5000, "saved_amount": 1000}})
    view = overview(20111)
    assert view["position"]["asset_total"] == 1200
    assert view["position"]["difference"] == -600
    assert view["position"]["complete"] is False
    assert view["goals"][0]["progress"] == .2
    assert view["goals"][0]["remaining"] == 4000


def test_deadline_and_overfunded_goal():
    item = {"id": "a", "created_at": "2026-01-31", "updated_at": "2026-02-01", "value": {"type": "travel", "target_amount": 100, "saved_amount": 110, "target_months": 1}}
    g = goal_progress({"goals": [item]}, date(2026, 2, 1))[0]
    assert g["deadline"] == "2026-02-28"
    assert g["remaining"] == 0 and g["progress"] == 1
    assert g["monthly_needed"] == 0


def test_weekly_summary_uses_personal_updates_not_invented_bank_changes():
    cm.direct_edit(20111, {"field": "goals", "value": {"type": "travel"}})
    ctx = cm.load_context(20111)
    ctx["goals"][0]["updated_at"] = "2026-01-05T12:00:00Z"
    cm.save_context(ctx)
    daily = briefing(20111, "daily", date(2026, 1, 7))
    weekly = briefing(20111, "weekly", date(2026, 1, 7))
    assert daily["changes"] == []
    assert weekly["changes"][0]["text"] == "Updated travel"
    assert weekly["from"] == "2026-01-01"
    assert "No new bank transactions" in weekly["freshness"]
    assert "no automatic notifications" in weekly["delivery"]


def test_api_validates_bad_balance_and_period():
    client = TestClient(app)
    assert client.get('/api/customers/20111/overview').status_code == 200
    assert client.get('/api/customers/20111/briefing?period=monthly').status_code == 422
    assert client.get('/api/customers/20111/briefing?period=weekly').status_code == 200
    result = client.post('/api/context/edit', json={"account_id": 20111, "change": {"field": "constraints", "operation": "add", "value": {"type": "financial_position", "as_of": "2026-01-01", "assets": [{"label": "Cash", "amount": -1}]}}})
    assert result.status_code == 422
    assert not cm.load_context(20111)["constraints"]


@pytest.mark.parametrize('amount', [-1, True, float('inf'), float('nan')])
def test_reject_invalid_goal_savings(amount):
    with pytest.raises(ValueError):
        cm.direct_edit(20111, {"field": "goals", "value": {"type": "travel", "saved_amount": amount}})


def test_savings_answer_does_not_overwrite_goal_budget():
    from app.services.gemini_agent import offline_extract
    summary = {"goals": [{"type": "travel", "target_amount": 5000, "target_months": 12}], "asked_questions": ["goal_saved"]}
    for message, amount in [("1250", 1250), ("nothing", 0), ("I already saved $1250 for my vacation", 1250)]:
        changes = offline_extract(message, summary).proposed_changes
        goal = next(c.value for c in changes if c.field == "goals")
        assert goal["saved_amount"] == amount
        assert "target_amount" not in goal


def test_partial_position_update_is_validated_and_savings_date_is_stable():
    result = cm.direct_edit(20111, {"field": "constraints", "value": {"type": "financial_position", "as_of": "2026-01-01", "assets": []}})
    item = result["context"]["constraints"][0]
    with pytest.raises(ValueError):
        cm.direct_edit(20111, {"field": "constraints", "operation": "update", "target_id": item["id"], "value": {"assets": [{"label": "Cash", "amount": -5}]}})
    cm.direct_edit(20111, {"field": "goals", "value": {"type": "travel", "saved_amount": 25, "saved_as_of": "2026-01-01"}})
    cm.direct_edit(20111, {"field": "goals", "operation": "update", "value": {"type": "travel", "label": "Holiday"}})
    assert overview(20111)["goals"][0]["saved_as_of"] == "2026-01-01"
