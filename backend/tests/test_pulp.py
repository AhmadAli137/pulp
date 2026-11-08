from dataclasses import replace
from decimal import Decimal
import json
import numpy as np
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.api import decision, voice
from app.services import context_manager as cm
from app.services.financial_profiles import get_metrics, get_population
from app.services.pulp_research import findings
from app.services.tangerine_metrics import compute_shock, horizon_verdict
from app.services.scenario_engine import simulate, ScenarioSpec
from app.services.strategy_optimizer import compare_strategies

client=TestClient(app)

@pytest.fixture(autouse=True)
def isolated_memory(tmp_path, monkeypatch):
    monkeypatch.setattr(cm,'STORAGE_DIR',tmp_path)
    monkeypatch.setattr(cm,'_KV_ENABLED',False)

@pytest.mark.parametrize('r,h,c,expected',[(.55,0,0,'3.4'),(1,0,3100,'no shortfall (120+)'),(.55,.15,0,'2.9'),(.55,.15,3100,'0.6')])
def test_tango_fixture(r,h,c,expected):
    assert compute_shock(3500,3100,1500,4000,r=r,h=h,one_off=c)['runway_label']==expected

def test_fractional_cent_shortfall_not_reported_as_success():
    assert not horizon_verdict(compute_shock(0,100,0,599.999),6)['survives']

def test_negative_and_zero_buffer_precedence():
    for buffer in [-1,0]:
        shock=compute_shock(1000,0,0,buffer)
        assert shock['runway_status']=='exhausted'
        assert not horizon_verdict(shock,6)['survives']

def test_research_reproduces_independent_counts():
    result=findings()
    assert result['eligible_accounts']==3660
    assert [x['events'] for x in result['volatility']]==[6,20,19,99]
    assert [x['accounts'] for x in result['volatility']]==[915]*4
    assert result['relative_rate']==pytest.approx(16.5)
    assert result['deciles'][0]['median_runway']==pytest.approx(32.437415,abs=1e-5)
    assert result['deciles'][-1]['median_runway']==pytest.approx(3.911711,abs=1e-5)
    assert result['no_prior_negative'][-1]['events']==74

def test_population_complete_and_finite():
    p=get_population()
    assert len(p)==4500
    assert np.isfinite(p[['I','S','H','F','B','P']]).all().all()

@pytest.mark.parametrize('account_id',get_population().sample(12,random_state=91).index.tolist())
def test_decision_api_matches_independent_decimal_formula(account_id):
    m=get_metrics(account_id)
    response=client.post('/api/decisions/compare',json=dict(account_id=account_id,income_fraction=.55,bills_increase=.15,one_off_cost=900,horizon_months=6))
    assert response.status_code==200
    result=response.json();bl=Decimal(str(m.buffer))-Decimal(900)
    gap=Decimal(str(m.typical_spending))+Decimal('.15')*Decimal(str(m.household_bills))-Decimal('.55')*Decimal(str(m.typical_inflow))
    expected=0 if bl<=0 else None if gap<=0 else min(float(bl/gap),120)
    assert result['shocked']['runway']==pytest.approx(expected) if expected is not None else result['shocked']['runway'] is None
    if bl>0 and gap>0:
        assert result['backup_plan']['monthly_improvement_needed']==pytest.approx(max(0,float(gap-bl/6)))

def test_api_invalid_and_nonfinite():
    assert client.get('/api/customers/1').status_code==404
    for change in [{'income_fraction':-1},{'horizon_months':0},{'one_off_cost':'Infinity'},{'one_off_cost':'NaN'}]:
        assert client.post('/api/decisions/compare',json={'account_id':20111,**change}).status_code==422

def test_upfront_need_survives_monthly_improvements():
    m=get_metrics(20111)
    r=client.post('/api/decisions/compare',json=dict(account_id=20111,one_off_cost=m.buffer+100)).json()
    assert r['backup_plan']['immediate_need']==pytest.approx(100)
    assert all(not x['verdict']['survives'] for x in r['options'])

def test_simulator_detects_bill_before_later_income():
    m=replace(get_metrics(20111),buffer=10,typical_inflow=10000,typical_spending=0)
    result=simulate(m,ScenarioSpec(one_off_cost=100,horizon_months=1),deterministic=True)
    assert result['median_end_buffer']>0
    assert result['prob_below_zero_any']==1

def test_negative_initial_balance_in_simulation():
    m=replace(get_metrics(20111),buffer=-1)
    assert simulate(m,ScenarioSpec(),True)['prob_below_zero_by_month'][0]==1

def test_deficit_not_ignored_when_allocating_savings():
    m=replace(get_metrics(20111),typical_inflow=1000,typical_spending=1500)
    ctx=cm.empty_context(m.account_id)
    ctx['constraints']=[{'value':{'type':'can_free_up_per_month','amount':200},'confirmed':True}]
    r=compare_strategies(m,ctx,n_paths=50)
    assert r['capacity_per_month']==0

def test_confirmation_persists_and_replanning_is_idempotent():
    aid=20111
    client.post('/api/replan',json={'account_id':aid})
    proposal=client.post('/api/context/propose',json={'account_id':aid,'changes':[{'field':'goals','value':{'type':'entrepreneurship','label':'Start a business','target_amount':20000,'target_months':12}}]}).json()['proposal']
    assert not cm.load_context(aid)['goals']
    r=client.post('/api/context/confirm',json={'account_id':aid,'proposal_id':proposal['id']})
    assert r.status_code==200
    assert r.json()['replan']['diff']['materially_changed']
    version=cm.load_context(aid)['context_version'];n=len(cm.load_context(aid)['strategy_snapshots'])
    client.post('/api/context/confirm',json={'account_id':aid,'proposal_id':proposal['id']})
    assert cm.load_context(aid)['context_version']==version
    assert len(cm.load_context(aid)['strategy_snapshots'])==n
    assert client.get('/api/context/20133').json()['summary']['goals']==[]
    assert client.delete('/api/context/20111').status_code==200
    assert cm.load_context(aid)['goals']==[]

def test_stale_proposal_is_conflict():
    a=cm.propose(20111,[{'field':'concerns','value':{'type':'income_loss'}}])
    cm.direct_edit(20111,{'field':'goals','value':{'type':'education'}})
    r=client.post('/api/context/confirm',json={'account_id':20111,'proposal_id':a['id']})
    assert r.status_code==409

def test_missing_gemini_key_does_not_change_scenario(monkeypatch):
    monkeypatch.setattr(decision,'GEMINI_API_KEY','')
    r=client.post('/api/decision/interpret',json={'account_id':20111,'message':'I lost my job'}).json()
    assert r['mode']=='manual' and r['proposal'] is None

def test_native_voice_without_key_returns_clear_error(monkeypatch):
    monkeypatch.setattr(voice,'GEMINI_API_KEY','')
    with client.websocket_connect('/api/agent/voice/20111') as ws:
        assert ws.receive_json()['type']=='error'

def test_scenario_proposal_does_not_invent_missing_values():
    proposal=decision.ScenarioProposal.model_validate({'income_fraction':.55})
    assert proposal.one_off_cost is None
    assert proposal.horizon_months is None

def test_native_voice_protocol_and_server_bound_tools(monkeypatch):
    import asyncio
    from types import SimpleNamespace as NS
    from google import genai
    captured={}
    class Session:
        def __init__(self): self.sent=False
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def send_realtime_input(self,**kwargs): pass
        async def send_tool_response(self,**kwargs): captured['tool_responses']=kwargs
        async def receive(self):
            if self.sent:
                await asyncio.Event().wait()
                return
            self.sent=True
            yield NS(data=b'\x00\x00',server_content=NS(input_transcription=NS(text='Income falls to 55%'),output_transcription=None,interrupted=False,turn_complete=False),
                tool_call=NS(function_calls=[NS(id='p',name='propose_scenario',args={'income_fraction':.55}),
                    NS(id='s',name='calculate_shock',args={'account_id':20133,'income_fraction':.55,'bills_increase':.15,'one_off_cost':0,'horizon_months':6})]))
    class FakeClient:
        def __init__(self,**kwargs): self.aio=NS(live=NS(connect=self.connect),aclose=self.close)
        def connect(self,**kwargs): captured['config']=kwargs;return Session()
        async def close(self): pass
    monkeypatch.setattr(voice,'GEMINI_API_KEY','test-key-not-a-secret')
    monkeypatch.setattr(genai,'Client',FakeClient)
    with client.websocket_connect('/api/agent/voice/20111') as ws:
        assert ws.receive_json()['type']=='ready'
        assert ws.receive_json()['type']=='audio'
        assert ws.receive_json()['type']=='transcript'
        proposal=ws.receive_json()
        assert proposal['type']=='proposal' and proposal['proposal']['horizon_months'] is None
        assert ws.receive_json()['name']=='propose_scenario'
        shock=ws.receive_json()
        assert shock['name']=='calculate_shock'
        assert shock['result']['account_id']==20111
        assert shock['result']['shocked']['runway_label']=='3.4'
    assert cm.load_context(20111)['context_version']==1

def test_invalid_gemini_json_falls_back_without_mutation(monkeypatch):
    from google import genai
    from types import SimpleNamespace as NS
    class FakeClient:
        def __init__(self,**kwargs): self.aio=NS(models=NS(generate_content=self.generate),aclose=self.close)
        async def generate(self,**kwargs): return NS(text='{"income_fraction": -5}')
        async def close(self): pass
    monkeypatch.setattr(decision,'GEMINI_API_KEY','test-key-not-a-secret')
    monkeypatch.setattr(genai,'Client',FakeClient)
    result=client.post('/api/decision/interpret',json={'account_id':20111,'message':'Bad output'}).json()
    assert result['mode']=='unavailable' and result['proposal'] is None
    assert cm.load_context(20111)['context_version']==1


def test_missing_goal_budget_and_long_deadline_are_explicit():
    result = compare_strategies(get_metrics(20111), {"goals": [{"value": {"type": "home_purchase", "target_months": 60}}]}, n_paths=10)
    assert result["goal"]["target_amount"] == 0
    assert "missing" in result["goal"]["assumption"]
    assert result["horizon_months"] == 60
    assert result["requested_horizon_months"] == 24
    assert "extended" in result["projection_note"]
    assert all(s["monthly_contribution"] == 0 for s in result["strategies"])


def test_emergency_target_uses_selected_stress():
    m = replace(get_metrics(20111), typical_inflow=1000, typical_spending=900, household_bills=200)
    result = compare_strategies(m, {"concerns": [{"value": {"type": "irregular_income"}}, {"value": {"type": "rising_costs"}}]}, n_paths=10)
    assert result["emergency_target"] == pytest.approx(6 * (900 + .15 * 200 - .7 * 1000))
