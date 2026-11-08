from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.insights import router



def _client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_demographics_shape_for_real_accounts():
    c = _client()
    for aid in (47788, 20111):
        r = c.get(f"/api/insights/demographics/{aid}")
        assert r.status_code == 200
        d = r.json()
        assert d["account_id"] == aid
        assert set(d["person"]) >= {"age", "age_band", "gender", "owners", "joint", "card", "account_years"}
        assert d["district"]["name"] and d["district"]["region"]
        assert 6 <= len(d["insights"]) <= 10
        for i in d["insights"]:
            assert i["plain"] and i["technical"]
            assert i["strength"] in {"strong", "moderate", "weak"}
            assert i["category"] in {"age", "household", "location", "economy", "banking"}
            assert i["percentile"] is None or 0 <= i["percentile"] <= 100
        dims = {g["dimension"] for g in d["groups"]}
        assert dims == {"age_band", "region", "urban", "unemployment_trend", "household"}
        for dim in dims:
            mine = [g for g in d["groups"] if g["dimension"] == dim and g["mine"]]
            assert len(mine) == 1
        assert all(0 <= g["survive6_layoff_pct"] <= 100 and g["n"] > 0 for g in d["groups"])
        assert d["caveats"]


def test_age_matches_band():
    d = _client().get("/api/insights/demographics/20111").json()
    age, band = d["person"]["age"], d["person"]["age_band"]
    lo, hi = (60, 200) if band == "60+" else map(int, band.split("-"))
    assert lo <= age <= hi


def test_unknown_account_404():
    assert _client().get("/api/insights/demographics/1").status_code == 404
