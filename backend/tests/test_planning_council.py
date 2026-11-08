import csv
from statistics import median,mean
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import find_data_dir
from app.services import context_manager as cm, planning_council as council

@pytest.fixture
def api(monkeypatch,tmp_path):
    monkeypatch.setattr(cm,"STORAGE_DIR",tmp_path)
    monkeypatch.setattr(cm,"_KV_ENABLED",False)
    return TestClient(app)

@pytest.mark.parametrize("account",[21617,21283,20767,89420,61056])
def test_real_council_cards(api,account):
    def ask(text):
        r=api.post("/api/agent/chat",json={"account_id":account,"message":text,"prefer_offline":True})
        assert r.status_code==200,r.text
        return r.json()["tool_results"][0]
    with (find_data_dir()/"monthly_summary.csv").open() as f:
        rows=sorted([r for r in csv.DictReader(f) if int(r["account_id"])==account],key=lambda r:r["month"])
    get=lambda k:median(float(r[k]) for r in rows)
    buf=mean(float(r["avg_daily_balance"]) for r in rows[-6:])
    for card,retained,hike,cost,months in [
        ("Council: retain 55% income; bills +15%; 6 months",.55,.15,0,6),
        ("Council: repair $1000; 12 months",1,0,1000,12),
        ("I bought a car for $5000. Can I cover 6 months?",1,0,5000,6)]:
        response=ask(card)
        if cost==5000:
            assert response["status"]=="clarify" and "financed" in response["reply"]
            response=ask("cash")
        assert response["status"]=="review"
        verified=ask("confirm")
        assert verified["status"]=="verified"
        report=verified["report"]
        gap=get("money_out")+hike*get("household_bills")-retained*get("money_in")
        left=buf-cost
        runway=0 if left<=0 else None if gap<=0 else min(120,left/gap)
        shock=report["shocked"]
        assert shock["monthly_gap"]==pytest.approx(gap)
        assert shock["buffer_left"]==pytest.approx(left)
        assert shock["runway"]==pytest.approx(runway) if runway is not None else shock["runway"] is None
        assert report["verdict"]["survives"]==(left>0 and left>=months*gap)
        print(account,card,shock["runway_label"],report["verdict"]["survives"])
    assert ask("Council: determine fraud from district crime rate")["status"]=="clarify"

def test_model_roles(api,monkeypatch):
    calls=[]
    def fake(role,instruction,payload,schema):
        calls.append(role)
        return schema.model_validate({"months":6} if role=="goals" else {"retained_pct":55} if role=="shock and mitigation" else {})
    monkeypatch.setattr(council,"infer",fake)
    monkeypatch.setattr(council.config,"GEMINI_API_KEY","test")
    monkeypatch.setattr(council.config,"AI_PROVIDER","gemini")
    r=council.coordinate(21617,"six months at fifty-five percent income")
    assert r["status"]=="review"
    r=council.coordinate(21617,"confirm",pending={"state":r["state"]})
    assert r["status"]=="verified"
    assert calls==["goals","shock and mitigation","profile","conversation"]
