"""Deterministic purchase trade-offs using the same report as the shock calculator."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import routes
from app.main import app


@pytest.fixture
def client(monkeypatch):
    metrics = SimpleNamespace(account_id=1, typical_inflow=4000.0, typical_spending=3600.0,
                              household_bills=1000.0, buffer=6200.0)
    monkeypatch.setattr(routes, "_metrics_or_404", lambda _account_id: metrics)
    return TestClient(app)


def test_job_loss_with_a_purchase_preserves_both_plans(client):
    inputs = {"account_id": 1, "income_fraction": 0.55, "bills_increase": 0.15,
              "one_off_cost": 200, "horizon_months": 6}
    response = client.post("/api/shocks/compare-purchase", json={**inputs, "purchase_cost": 1200})
    assert response.status_code == 200
    result = response.json()
    wait, buy = result["wait"], result["buy"]
    assert wait == client.post("/api/shocks/calculate", json=inputs).json()
    assert result["recommendation"] == "wait"
    assert result["cash_preserved"] == 1200
    assert result["extra_shortfall"] == 1200
    assert buy["applied_inputs"]["one_off_cost"] == 1400
    assert buy["shocked"]["monthly_gap"] == wait["shocked"]["monthly_gap"] == 1550
    assert buy["verdict"]["shortfall_over_horizon"] == 4500
    assert buy["goal_plan"]["cash_needed"] == 10700
    assert buy["backup_plan"]["unresolved_gap_over_horizon"] == 4500
    assert wait["cash_path"] == [
        {"month": 0, "baseline": 6200, "after_shock": 6200},
        {"month": 0, "baseline": 6200, "after_shock": 6000},
        {"month": 6, "baseline": 8600, "after_shock": -3300},
    ]
    assert buy["cash_path"][-1] == {"month": 6, "baseline": 8600, "after_shock": -4500}


@pytest.mark.parametrize(("cost", "recommendation", "cash_left"), [(1200, "compare", 150), (1350, "wait", 0)])
def test_purchase_that_preserves_horizon_coverage(client, cost, recommendation, cash_left):
    response = client.post("/api/shocks/compare-purchase", json={
        "account_id": 1, "income_fraction": 0.55, "bills_increase": 0.15, "one_off_cost": 200,
        "horizon_months": 3, "purchase_cost": cost,
    })
    assert response.status_code == 200
    result = response.json()
    assert result["recommendation"] == recommendation
    assert result["extra_shortfall"] == 0
    assert result["buy"]["verdict"]["survives"] is True
    assert result["buy"]["verdict"]["cash_left_at_horizon"] == cash_left


def test_buying_can_exhaust_cash_before_income_arrives(client):
    response = client.post("/api/shocks/compare-purchase", json={"account_id": 1, "purchase_cost": 6200})
    assert response.status_code == 200
    result = response.json()
    assert result["recommendation"] == "wait"
    assert result["wait"]["shocked"]["runway_status"] == "no_shortfall"
    assert result["buy"]["shocked"]["runway_status"] == "exhausted"
    assert result["buy"]["verdict"]["months_covered"] == 0
    assert result["buy"]["backup_plan"]["immediate_need"] == 0
    assert result["buy"]["cash_path"][1] == {"month": 0, "baseline": 6200, "after_shock": 0}
    assert result["buy"]["cash_path"][-1] == {"month": 6, "baseline": 8600, "after_shock": 0}


@pytest.mark.parametrize("invalid", [0, -1, True, "Infinity"])
def test_invalid_purchase_cost_returns_422(client, invalid):
    response = client.post("/api/shocks/compare-purchase", json={"account_id": 1, "purchase_cost": invalid})
    assert response.status_code == 422


def test_overflow_in_combined_cost_returns_422(client):
    response = client.post("/api/shocks/compare-purchase", json={
        "account_id": 1, "one_off_cost": 1e308, "purchase_cost": 1e308,
    })
    assert response.status_code == 422
