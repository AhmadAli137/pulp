from types import SimpleNamespace
from app.services.vehicle_planner import run,starts

def play(inputs):
    state=None
    for text in inputs:
        reply,state=run(text,state,SimpleNamespace(buffer=10000))
    return reply,state

def test_cash_range_and_user_chosen_cut():
    assert starts("I want to buy a car")
    reply,state=play(["I want to buy a car","$5k to $7k","Civic","cash","4000","200","150","420","takeout $60"])
    assert state is None
    for phrase in ("$1,000.00 above","$1,000.00 below","short by $70.00","takeout","-$10.00"):
        assert phrase in reply

def test_finance_unknown_and_cancel():
    reply,state=play(["I want to buy a car for $20000","Undecided","finance","3000","350","2000","400","125","unknown","none"])
    assert state is None and "$175.00 per month available" in reply
    assert play(["buy a car","cancel"])[1] is None

def test_invalid_range_reprompts():
    assert play(["buy a car","$8000 to $5000"])[1]["next"]=="price"
