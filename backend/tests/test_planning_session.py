import json
import pytest
from app.services import context_manager as cm, planning_session as ps, council, financial_profiles
from app.services.strategy_optimizer import compare_strategies
from app.services.roadmap import build_roadmap
from tests.test_council import _metrics


def test_confirmed_objection_replans_same_scenario_across_views(monkeypatch):
    m = _metrics()
    monkeypatch.setattr(financial_profiles, "get_metrics", lambda _: m)
    plan = council.run_council(1, m, r=.7, h=.1, one_off=450, duration=4, use_ai=False)
    ps.publish(1, plan)
    proposal = cm.propose(1, [{"field": "constraints", "value": {"type": "can_free_up_per_month", "amount": 0}}])
    assert ps.current(1)["plan"] == plan
    cm.confirm(1, proposal["id"])
    assert ps.current(1)["stale"]
    revised = ps.rerun(1, use_ai=False)
    assert revised["request"]["context_version"] == 2
    assert revised["request"]["shock"] == plan["request"]["shock"]
    assert all(c["levers"]["freed_up_per_month"] == 0 for c in revised["ranked"])
    cmp = compare_strategies(m, cm.load_context(1))
    roadmap = build_roadmap(m, cm.load_context(1))
    assert cmp["recommended"] == revised["recommended"] == roadmap["summary"]["recommended"]
    assert cmp["stress_scenario"]["shock_duration"] == 4
    assert not ps.current(1)["stale"]
    with pytest.raises(ValueError, match="context changed"):
        ps.publish(1, plan)
    assert ps.current(1)["plan"] == revised


def test_challenger_receives_validated_strategist_candidates(monkeypatch):
    monkeypatch.setattr(council, 'council_available', lambda: True)
    calls = []
    class Role:
        def __init__(self, **kw): self.name = kw['name']
    monkeypatch.setattr(council, 'LlmAgent', Role)
    def run(role, payload, **kwargs):
        calls.append(role.name)
        if role.name == 'strategist':
            return {'state': {'strategist': {'levers': [{'label': 'User-specific option', 'freed_up_per_month': 150}]}}, 'texts': {}, 'tool_calls': []}
        candidates = json.loads(payload)['grid_top']
        assert any(c['label'] == 'User-specific option' and 'score' in c for c in candidates)
        return {'state': {'challenger': {'flags': [{'candidate': 'User-specific option', 'risk': 'Needs confirmation', 'severity': 'high'}]}}, 'texts': {}, 'tool_calls': []}
    monkeypatch.setattr(council, 'run_agent', run)
    result = council.run_council(1, _metrics(), r=.7, h=0, one_off=0, use_ai=True, top_n=100)
    assert calls == ['strategist', 'challenger']
    assert next(c for c in result['ranked'] if c['label'] == 'User-specific option')['flags']
