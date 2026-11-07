"""Dataset-backed checks: official metrics on real accounts, population table consistency, API behaviour,
simulation reproducibility, context + replanning loop, and AI-failure resilience."""
import os

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import context_manager as cm
from app.services.data_store import get_store
from app.services.financial_profiles import build_population_table, get_metrics, get_population
from app.services.scenario_engine import ScenarioSpec, StrategyAdjust, simulate
from app.services.tangerine_metrics import compute_shock, horizon_verdict

client = TestClient(app)
store = get_store()
SAMPLE = store.sample_ids(12, seed=3)
TEST_ACCOUNT = SAMPLE[0]


@pytest.fixture(autouse=True)
def _clean_context():
    cm.reset_context(TEST_ACCOUNT)
    yield
    cm.reset_context(TEST_ACCOUNT)


# --------------------------------------------------------------------------- metrics vs pandas recomputation
@pytest.mark.parametrize("account_id", SAMPLE)
def test_metrics_match_manual_recomputation(account_id):
    m = get_metrics(account_id)
    df = store.monthly_for(account_id).sort_values("month")
    assert m.typical_inflow == pytest.approx(float(np.median(df.money_in)))
    assert m.typical_spending == pytest.approx(float(np.median(df.money_out)))
    assert m.household_bills == pytest.approx(float(np.median(df.household_bills)))
    assert m.typical_fixed_costs == pytest.approx(float(np.median(df.household_bills + df.insurance + df.loan_payments)))
    assert m.buffer == pytest.approx(float(df.tail(6).avg_daily_balance.mean()))
    assert m.months_available == len(df)
    loan = store.loan_for(account_id)
    if loan is None:
        assert m.active_loan_payment == 0.0
    else:
        assert m.active_loan_payment == (float(loan.monthly_payment) if loan.status in ("C", "D") else 0.0)


def test_population_table_matches_per_account():
    pop = build_population_table(store)
    assert len(pop) == len(store.account_ids)
    for a in SAMPLE:
        m = get_metrics(a)
        r = pop.loc[a]
        assert r.I == pytest.approx(m.typical_inflow)
        assert r.S == pytest.approx(m.typical_spending)
        assert r.B == pytest.approx(m.buffer)
        assert r.H == pytest.approx(m.household_bills)
        assert r.P == pytest.approx(m.active_loan_payment)


def test_loan_payment_rule():
    loans = store.loans
    running = loans[loans.status.isin(["C", "D"])].iloc[0]
    finished = loans[loans.status.isin(["A", "B"])].iloc[0]
    assert get_metrics(int(running.account_id)).active_loan_payment == float(running.monthly_payment)
    assert get_metrics(int(finished.account_id)).active_loan_payment == 0.0


# --------------------------------------------------------------------------- API
def test_unknown_account_404():
    r = client.get("/api/customers/1")
    assert r.status_code == 404
    assert "not in the dataset" in r.json()["detail"]


def test_customer_endpoint_shape():
    r = client.get(f"/api/customers/{TEST_ACCOUNT}")
    assert r.status_code == 200
    d = r.json()
    for k in ("typical_inflow", "typical_spending", "typical_fixed_costs", "household_bills", "buffer", "baseline_runway_label", "show_the_math"):
        assert k in d


def test_shock_presets_against_formula():
    m = get_metrics(TEST_ACCOUNT)
    for preset, (r, h, C) in {"layoff": (0.55, 0.0, 0.0), "furnace": (1.0, 0.0, m.typical_spending), "combined": (0.55, 0.15, 0.0)}.items():
        resp = client.post("/api/shocks/calculate", json={"account_id": TEST_ACCOUNT, "preset": preset})
        assert resp.status_code == 200, resp.text
        got = resp.json()["shocked"]
        exp = compute_shock(m.typical_inflow, m.typical_spending, m.household_bills, m.buffer, r=r, h=h, one_off=C)
        assert got["monthly_gap"] == pytest.approx(exp["monthly_gap"])
        assert got["runway_label"] == exp["runway_label"]
        assert "goal_plan" in resp.json() and "backup_plan" in resp.json()


def test_shock_validation_errors():
    assert client.post("/api/shocks/calculate", json={"account_id": TEST_ACCOUNT, "income_fraction": -1}).status_code == 422
    assert client.post("/api/shocks/calculate", json={"account_id": TEST_ACCOUNT, "horizon_months": 0}).status_code == 422
    assert client.post("/api/shocks/calculate", json={"account_id": "abc"}).status_code == 422


def test_every_sample_account_has_baseline_verdict_and_plans():
    for a in SAMPLE:
        resp = client.post("/api/shocks/calculate", json={"account_id": a, "income_fraction": 0.55, "horizon_months": 6})
        assert resp.status_code == 200
        d = resp.json()
        assert d["baseline"]["runway_label"]
        assert d["verdict"]["verdict"]
        assert d["goal_plan"]["note"] and d["backup_plan"]["note"]


def test_cohort_and_research():
    r = client.get(f"/api/customers/{TEST_ACCOUNT}/cohort")
    assert r.status_code == 200 and r.json()["n_peers"] >= 0
    r = client.get("/api/research/summary")
    assert r.status_code == 200
    d = r.json()
    if d.get("available"):
        assert d["runs"]["primary_5pct_layoff"]["pairs_unequal_buffer"] > 0
        assert "headline" in d


# --------------------------------------------------------------------------- simulation
def test_deterministic_simulation_reproduces_official_runway():
    m = get_metrics(TEST_ACCOUNT)
    sh = compute_shock(m.typical_inflow, m.typical_spending, m.household_bills, m.buffer, r=0.55)
    spec = ScenarioSpec(scenario_type="income_loss", income_fraction=0.55, shock_duration=36, horizon_months=36, n_paths=1)
    res = simulate(m, spec, deterministic=True)
    if sh["runway_status"] == "finite" and sh["runway"] < 36:
        # buffer after k months = B - k*gap; first negative month index = floor(runway)+1
        expected_first_neg = int(np.floor(sh["runway"])) + 1
        assert res["deterministic_month_cash_runs_out"] == expected_first_neg
    else:
        assert res["deterministic_month_cash_runs_out"] is None


def test_monte_carlo_reproducible_and_shaped():
    m = get_metrics(TEST_ACCOUNT)
    spec = ScenarioSpec(scenario_type="combined", income_fraction=0.55, bills_increase=0.15, horizon_months=24, n_paths=200, seed=7)
    a = simulate(m, spec)
    b = simulate(m, spec)
    assert a["buffer_percentiles"]["p50"] == b["buffer_percentiles"]["p50"]
    assert len(a["buffer_percentiles"]["p50"]) == 25
    assert 0.0 <= a["prob_below_zero_any"] <= 1.0
    p = a["buffer_percentiles"]
    assert all(x <= y for x, y in zip(p["p10"], p["p90"]))


def test_simulate_endpoint_with_strategy():
    r = client.post("/api/scenarios/simulate", json={"account_id": TEST_ACCOUNT, "scenario": {"preset": "income_loss", "n_paths": 100},
                                                     "strategy": {"goal_contribution_per_month": 100, "goal_target": 1200}})
    assert r.status_code == 200
    d = r.json()
    assert d["scenario"]["goal_target"] == 1200
    assert "baseline" in d and "deterministic" in d


def test_branches_endpoint():
    r = client.get(f"/api/scenarios/branches/{TEST_ACCOUNT}?n_paths=100")
    assert r.status_code == 200
    assert [b["key"] for b in r.json()["branches"]] == ["baseline", "income_loss", "higher_costs", "positive_income", "combined"]


# --------------------------------------------------------------------------- strategies, context, replanning loop
def test_compare_strategies_default_context():
    r = client.post("/api/strategies/compare", json={"account_id": TEST_ACCOUNT, "n_paths": 100})
    assert r.status_code == 200
    d = r.json()
    assert d["recommended"] in {s["key"] for s in d["strategies"]}
    assert d["goal"]["type"] == "emergency_fund"
    assert any(s["feasible"] for s in d["strategies"])


def test_context_propose_confirm_replan_loop():
    first = client.post("/api/replan", json={"account_id": TEST_ACCOUNT}).json()
    assert first["diff"]["has_previous"] is False
    prop = client.post("/api/context/propose", json={"account_id": TEST_ACCOUNT, "changes": [
        {"field": "goals", "value": {"type": "home_purchase", "label": "Buy a home", "target_months": 60, "target_amount": 40000, "priority": 1}}]}).json()["proposal"]
    assert prop["status"] == "pending"
    conf = client.post("/api/context/confirm", json={"account_id": TEST_ACCOUNT, "proposal_id": prop["id"]}).json()
    assert conf["proposal"]["status"] == "confirmed"
    assert conf["summary"]["goals"][0]["type"] == "home_purchase"
    assert conf["replan"]["diff"]["has_previous"] is True
    assert conf["replan"]["comparison"]["goal"]["type"] == "home_purchase"
    # new life event: business next year + irregular income -> weights change, stress changes
    prop2 = client.post("/api/context/propose", json={"account_id": TEST_ACCOUNT, "changes": [
        {"field": "goals", "value": {"type": "entrepreneurship", "label": "Start a business", "target_months": 12, "target_amount": 15000, "priority": 1}},
        {"field": "goals", "operation": "update", "value": {"type": "home_purchase", "priority": 2}},
        {"field": "concerns", "value": {"type": "irregular_income", "label": "irregular income"}}]}).json()["proposal"]
    conf2 = client.post("/api/context/confirm", json={"account_id": TEST_ACCOUNT, "proposal_id": prop2["id"]}).json()
    diff = conf2["replan"]["diff"]
    assert diff["has_previous"] is True
    assert "goal" in diff["changes"]
    assert diff["changes"]["goal"]["new"] == "Start a business"
    assert conf2["replan"]["comparison"]["weights"]["resilience"] > 0.5
    d = client.get(f"/api/replan/{TEST_ACCOUNT}/diff").json()
    assert d["has_previous"] and d["diff"]["reasons"]
    # reject path and delete
    prop3 = client.post("/api/context/propose", json={"account_id": TEST_ACCOUNT, "changes": [{"field": "concerns", "value": {"type": "debt"}}]}).json()["proposal"]
    rej = client.post("/api/context/confirm", json={"account_id": TEST_ACCOUNT, "proposal_id": prop3["id"], "accept": False}).json()
    assert rej["proposal"]["status"] == "rejected"
    assert client.post("/api/context/confirm", json={"account_id": TEST_ACCOUNT, "proposal_id": "nope"}).status_code == 404
    assert client.delete(f"/api/context/{TEST_ACCOUNT}").json()["summary"]["goals"] == []


def test_unchanged_context_reports_no_material_change():
    client.post("/api/replan", json={"account_id": TEST_ACCOUNT})
    second = client.post("/api/replan", json={"account_id": TEST_ACCOUNT}).json()
    assert second["diff"]["materially_changed"] is False
    assert "does not materially change" in second["diff"]["reasons"][0]


def test_roadmap():
    r = client.get(f"/api/roadmap/{TEST_ACCOUNT}")
    assert r.status_code == 200
    d = r.json()
    for k in ("this_week", "this_month", "next_three_months", "next_year", "long_term"):
        assert d[k]


# --------------------------------------------------------------------------- agent (offline path must always work)
def test_agent_offline_extracts_goal_and_concern():
    r = client.post("/api/agent/chat", json={"account_id": TEST_ACCOUNT, "message": "I want to move out next year, but I'm worried about losing my job.", "prefer_offline": True})
    assert r.status_code == 200
    d = r.json()
    assert d["mode"] in ("offline", "offline_fallback")
    fields = {(c["field"], c["value"].get("type")) for c in d["extraction"]["proposed_changes"]}
    assert ("goals", "move_out") in fields
    assert ("concerns", "income_loss") in fields
    assert d["proposal"]["status"] == "pending"
    assert any(t["tool"] == "run_official_shock" for t in d["tool_results"])
    assert d["next_question"]["key"] in ("rent", "income_replacement")
    # follow-up answer fills the rent constraint and does not repeat the same question
    r2 = client.post("/api/agent/chat", json={"account_id": TEST_ACCOUNT, "message": "Rent would be about $1,800 a month.", "prefer_offline": True}).json()
    assert ("constraints", "expected_rent") in {(c["field"], c["value"].get("type")) for c in r2["extraction"]["proposed_changes"]}
    assert r2["next_question"] is None or r2["next_question"]["key"] != "rent"


def test_agent_signature_replanning_scenario():
    r = client.post("/api/agent/chat", json={"account_id": TEST_ACCOUNT, "message": "I want to buy a home in five years.", "prefer_offline": True}).json()
    conf = client.post("/api/context/confirm", json={"account_id": TEST_ACCOUNT, "proposal_id": r["proposal"]["id"]}).json()
    assert conf["replan"]["comparison"]["goal"]["type"] == "home_purchase"
    assert conf["replan"]["comparison"]["goal"]["target_months"] == 60
    r2 = client.post("/api/agent/chat", json={"account_id": TEST_ACCOUNT, "message": "Actually, I want to start a business next year, and my income may become irregular.", "prefer_offline": True}).json()
    types_ = {(c["field"], c["value"].get("type")) for c in r2["extraction"]["proposed_changes"]}
    assert ("goals", "entrepreneurship") in types_ and ("concerns", "irregular_income") in types_
    conf2 = client.post("/api/context/confirm", json={"account_id": TEST_ACCOUNT, "proposal_id": r2["proposal"]["id"]}).json()
    diff = conf2["replan"]["diff"]
    assert diff["changes"]["goal"]["new"] == "Start a business"
    assert diff["reasons"]


def test_agent_survives_bad_gemini_key(monkeypatch):
    from app.services import gemini_agent
    monkeypatch.setattr(gemini_agent, "GEMINI_API_KEY", "invalid-key-for-test")
    monkeypatch.setattr(gemini_agent, "gemini_turn", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("simulated API outage")))
    r = client.post("/api/agent/chat", json={"account_id": TEST_ACCOUNT, "message": "What is my runway?"}).json()
    assert r["mode"] == "offline_fallback"
    assert r["reply"]
