"""Benefits: the bottom line per account, honest and sourced."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _items(b):
    yield from b["money"]["items"]
    yield b["money"]["shock"]
    yield from b["perspective"]["items"]
    yield from b["control"]["items"]


def test_benefits_shape_and_honesty():
    for acc in (74916, 20111, 47788):
        b = client.get(f"/api/customers/{acc}/benefits").json()
        assert b["headline"].startswith("Pulp read") and b["headline"].endswith(".")
        assert b["time"]["hours_saved"] > 0 and b["time"]["pulp_seconds"] > 0 and "By hand" in b["time"]["basis"]
        assert b["money"]["per_year"] >= 0 and abs(b["money"]["per_year"] - sum(i["amount"] for i in b["money"]["items"])) < 0.05
        sh = b["money"]["shock"]
        assert sh["shortfall_without"] >= 0 and sh["shortfall_with_plan"] >= 0 and sh["avoided"] >= 0
        assert abs(sh["avoided"] - max(0, sh["shortfall_without"] - sh["shortfall_with_plan"])) < 0.05
        assert all(i.get("basis") for i in _items(b))
        c = b["control"]
        assert 0 <= c["runway_now_months"] <= 6 and c["runway_gain_months"] >= 0 and c["plans_tried"] > 0
        assert b["perspective"]["count"] == len(b["perspective"]["items"]) >= 2


def test_found_costs_come_from_the_records():
    b = client.get("/api/customers/20111/benefits").json()
    labels = {i["label"] for i in b["money"]["items"]}
    assert "Penalty interest for dipping below zero" in labels
    assert all(i["kind"] == "found in your records" for i in b["money"]["items"])
    assert b["money"]["shock"]["kind"] == "if a layoff hits"


def test_unknown_account_is_404():
    assert client.get("/api/customers/999999999/benefits").status_code == 404
