from types import SimpleNamespace
import pandas as pd
import pytest
from app.services.life_profile import build_life_profile
from app.services import context_manager as cm, gemini_agent as g
from app.services.decision_profile import build_decision_profile
from app.services.data_store import get_store


def records():
    return pd.DataFrame({"month": [f"2025-{m:02}" for m in range(1, 7)], "money_in": [1000] * 6,
                         "money_out": [1300, 1400, 1300, 100000, 1400, 1400], "loan_payments": [0, 0, 0, 200, 200, 200]})


def loan():
    return SimpleNamespace(loan_id=12, loan_start="2025-04-15", amount=4800, monthly_payment=200, duration_months=24, status="C", status_meaning="running, OK so far")


def test_cash_gap_hypothesis_explains_evidence_and_alternative_without_inventing_purchase():
    p = build_life_profile(records(), {}, loan())
    story = p["loan"]
    h = story["hypotheses"][0]
    assert "may have" in h["title"]
    assert "3 of the 3" in h["basis"] and "$300 more went out than came in" in h["basis"]
    assert h["alternative"] and h["decision"] and h["question"]
    assert story["evidence"][0]["to"] == "2025-03"
    assert not any("100,000" in e["text"] for e in story["evidence"])
    assert story["confirmed_purpose"] is None
    assert story["status_as_of"] == "2025-12-31"
    assert "not the current outstanding" in story["unknowns"][0]


def test_thin_or_remote_history_does_not_create_a_borrowing_story():
    r = records().iloc[3:]
    assert build_life_profile(r, {}, loan())["loan"]["hypotheses"] == []
    r = records().copy()
    r.loc[:2, 'month'] = ['2021-01', '2021-02', '2021-03']
    assert build_life_profile(r, {}, loan())["loan"]["hypotheses"] == []


def test_confirmed_purpose_replaces_hypotheses_and_changes_next_question():
    summary = {"constraints": [{"type": "loan_purpose", "loan_id": 12, "purpose": "replace the car needed for work"}], "goals": [{"type": "travel", "label": "visit family"}]}
    p = build_decision_profile(records(), {}, summary, loan())
    assert p["life_profile"]["loan"]["hypotheses"] == []
    assert p["life_profile"]["loan"]["confirmed_purpose"] == "replace the car needed for work"
    assert any("car needed for work" in x["text"] for x in p["life_profile"]["confirmed_motivations"])
    assert not any(q["key"] == "loan_purpose" for q in p["questions"])
    assert any(q["key"] == "loan_current_terms" for q in p["questions"])
    assert p["questions"][0]["key"] == "goal_timing"


def test_wrong_loan_purpose_is_not_used_and_no_recorded_loan_does_not_mean_no_debt():
    p = build_life_profile(records(), {"constraints": [{"type": "loan_purpose", "loan_id": 99, "purpose": "a trip"}]}, loan())
    assert p["loan"]["confirmed_purpose"] is None
    assert "borrowing elsewhere" in build_life_profile(records(), {})["loan_note"]


def test_past_loan_purpose_requires_confirmation_and_does_not_become_a_new_goal():
    real_loan = get_store().loans.iloc[0]
    account = int(real_loan.account_id)
    summary = cm.summarize(cm.load_context(account))
    result = g.offline_extract("My loan was for a car I needed for work.", summary)
    assert result.requires_confirmation
    purpose = next(c.value for c in result.proposed_changes if c.value.get("type") == "loan_purpose")
    assert purpose["loan_id"] == int(real_loan.loan_id)
    assert not any(c.field == "goals" for c in result.proposed_changes)
    assert not cm.load_context(account)["constraints"]
    proposal = cm.propose(account, [c.model_dump() for c in result.proposed_changes])
    cm.confirm(account, proposal["id"])
    assert cm.summarize(cm.load_context(account))["constraints"][0]["purpose"] == "a car I needed for work"
    question = g.offline_extract("Was my loan for a car?", summary)
    assert not any(c.value.get("type") == "loan_purpose" for c in question.proposed_changes)


def test_purpose_validation_rejects_wrong_account_and_blank_text():
    real_loan = get_store().loans.iloc[0]
    for value in [{"loan_id": int(real_loan.loan_id) + 1000000, "purpose": "a car"}, {"loan_id": int(real_loan.loan_id), "purpose": "  "}]:
        with pytest.raises(ValueError):
            cm.direct_edit(int(real_loan.account_id), {"field": "constraints", "value": {"type": "loan_purpose", **value}})
