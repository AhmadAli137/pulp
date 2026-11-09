"""v2 agents: Persona Builder, Shock Generator, Life Planner, direct profile updates with undo, Stage 3 from conversation."""
from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import context_manager as cm

ACC = 47788
BORROWER = 20111
client = TestClient(app)


# ----------------------------------------------------------------------------- profile log
def test_apply_now_logs_and_undo_restores():
    res = cm.apply_now(1, [{"field": "goals", "operation": "add", "value": {"type": "travel", "label": "Trip to Lisbon"}}],
                       agent="companion", reason="you said so")
    assert len(res["changes"]) == 1 and res["changes"][0]["kind"] == "add"
    upd = cm.apply_now(1, [{"field": "goals", "operation": "update", "value": {"type": "travel", "label": "Trip to Porto"}}], agent="companion")
    assert upd["changes"][0]["kind"] == "update" and upd["changes"][0]["before"]["label"] == "Trip to Lisbon"
    cm.undo(1, upd["changes"][0]["id"])
    assert cm.summarize(cm.load_context(1))["goals"][0]["label"] == "Trip to Lisbon"
    cm.undo(1, res["changes"][0]["id"])
    ctx = cm.load_context(1)
    assert cm.summarize(ctx)["goals"] == []
    assert [e["kind"] for e in ctx["profile_log"]] == ["add", "update", "undo", "undo"]
    assert cm.undo(1, res["changes"][0]["id"])["change"] is None  # undoing twice is a no-op


# ----------------------------------------------------------------------------- persona
def test_persona_is_fictional_consistent_and_seeds_the_profile():
    from app.services.persona import get_persona, profile_doc
    p = get_persona(ACC, refine=False)
    assert p["fictional"] is True and p["display_name"] and p["goals"]
    assert abs(sum(g["weight"] for g in p["goals"]) - 1) < 1e-3
    for g in p["goals"]:
        assert g["size"] in ("small", "large") and g["horizon"] in ("short", "medium", "long") and 1 <= g["importance"] <= 5
        assert g["target_amount"] > 0 and g["target_months"] > 0
    doc = profile_doc(ACC, build=False)
    assert doc["log"] and all(e["agent"] == "persona_builder" and e["kind"] == "seed" for e in doc["log"])
    assert {g["label"] for g in doc["goals"]} >= {g["label"] for g in p["goals"]}
    assert get_persona(ACC)["built_at"] == p["built_at"]  # built once


def test_profile_endpoints_build_and_undo():
    d = client.get(f"/api/profile/{ACC}").json()
    assert d["persona"]["fictional"] and d["log"]
    change = d["log"][0]["id"]
    after = client.post(f"/api/profile/{ACC}/undo/{change}").json()
    assert after["log"][0]["kind"] == "undo" and after["version"] > d["version"]
    assert client.get("/api/profile/999999999").status_code == 404


# ----------------------------------------------------------------------------- shock generator
def test_personal_deck_fits_the_account():
    r = client.get(f"/api/agent/deck?account_id={BORROWER}").json()
    keys = {c["key"] for c in r["cards"]}
    assert all(k.startswith("p_") for k in keys)
    assert "p_rate_reset" in keys  # a running loan gets a payment reset
    for c in r["cards"]:
        assert c["why_you"] and c["likelihood"] in ("low", "medium", "high") and c["r"] >= 0
    assert len(client.get("/api/agent/deck").json()["cards"]) == 12  # the generic deck is unchanged


def test_personal_card_resolves_through_deal_card():
    from app.services.director import deal_card
    from app.services.shocks import personal_deck
    key = personal_deck(ACC)["cards"][0]["key"]
    assert deal_card(key, account_id=ACC)["key"] == key
    assert deal_card("layoff", account_id=ACC)["key"] == "layoff"  # judges' cards stay exact


# ----------------------------------------------------------------------------- life planner
def test_life_planner_searches_screens_and_keeps_four_distinct_finalists():
    from app.services.life_planner import run
    r = run(ACC, {"income_fraction": 0.55, "shock_duration": 6}, store=False)
    s = r["search"]
    assert s["generated"] >= 100 and s["screened_out"] > 0 and s["feasible"] + s["screened_out"] == s["generated"]
    roles = [p["role"] for p in r["plans"]]
    assert sorted(roles) == sorted(["best_tradeoff", "best_shortfall", "best_resilience", "best_goals"])
    fams = [{st["decision"] for st in p["steps"]} for p in r["plans"]]
    assert all(fams[i] != fams[j] for i in range(4) for j in range(i + 1, 4))
    tradeoff = next(p for p in r["plans"] if p["role"] == "best_tradeoff")
    assert r["recommended"] == tradeoff["id"]
    assert tradeoff["score"] >= max(c["score"] for c in s["candidates"] if c["status"] != "screened") - 1e-9
    for p in r["plans"]:
        assert len(p["reasoning"]) == len(p["steps"]) and all(x["because"] and x["evidence"] for x in p["reasoning"])
        assert len(p["outcome"]["cash_path"]) == r["horizon_months"] + 1
    w = r["objective"]["weights"]
    assert abs(sum(w.values()) - 1) < 1e-2


def test_life_planner_screens_what_does_not_fit():
    from app.services.life_planner import run
    r = run(ACC, {"income_fraction": 0.55, "shock_duration": 6}, store=False)  # no loan, no labelled bills
    rules = {x["rule"] for x in r["search"]["screens"]}
    assert "No running loan to refinance" in rules
    assert "A cheaper move with no housing bill on record" in rules
    assert not any(st["decision"] == "refinance" for p in r["plans"] for st in p["steps"])


def test_failing_plans_are_shown_for_contrast():
    from app.services.life_planner import run
    r = run(BORROWER, {"income_fraction": 0.55, "shock_duration": 6}, store=False)
    assert r["cautionary"], "a stretched account must show plans that fall short"
    for p in r["cautionary"]:
        assert p["role"] == "falls_short" and p["survives"] is False and "falls short" in p["fails_because"]


def test_long_term_mode_and_history():
    r = client.post("/api/agent/life-plans", json={"account_id": ACC, "mode": "long_term"}).json()
    assert r["plan_mode"] == "long_term" and r["horizon_months"] == 60 and r["shock"]["duration"] == 0
    assert "least_disruption" in {p["role"] for p in r["plans"]}
    client.post("/api/agent/life-plans", json={"account_id": ACC, "mode": "long_term"})
    h = client.get(f"/api/plans/history/{ACC}").json()["history"]
    assert len(h) == 2 and h[0]["changed"] and h[1]["changed"] == ["First plan of this kind."]


# ----------------------------------------------------------------------------- stage 3 from conversation
@pytest.mark.parametrize("text,key,timing", [
    ("I think I might lose my job next month", "layoff", "soon"),
    ("I just got laid off", "layoff", "now"),
    ("our rent is going up 10% in March", "rent_up", "now"),
    ("the car broke down and the repair is $2,400", "repair", "now"),
    ("should I take a second job?", "second_job", "soon"),
    ("we are thinking of moving to a cheaper city", "move", "soon"),
])
def test_detects_shocks_and_decisions(text, key, timing):
    from app.services.stage3 import detect
    d = detect(text)
    assert d and d["key"] == key and d["timing"] == timing


def test_detected_amounts_and_plain_chat_ignored():
    from app.services.stage3 import detect
    assert detect("the car broke down and the repair is $2,400")["one_off"] == 2400
    assert detect("our rent is going up 10% in March")["h"] == pytest.approx(0.10)
    assert detect("thanks, that helps") is None
    assert detect("twist:layoff") is None


def test_conversation_mentioning_a_shock_runs_stage_three(monkeypatch):
    from app.services import director as D, gemini_agent
    monkeypatch.setattr(gemini_agent, "chat", lambda *a: {"reply": "", "proposal": None})

    async def collect():
        return [(k, d) async for k, d in D.stage_stream(ACC, "I'm worried I might lose my job", use_ai=False)]
    events = asyncio.run(collect())
    kinds = [k for k, _ in events]
    assert "lifeplans" in kinds and "trace" in kinds
    plans = next(d for k, d in events if k == "lifeplans")
    assert plans["shock_starts_in"] == 3 and len(plans["plans"]) == 4
    board = [d for k, d in events if k == "storyboard"][-1]
    assert any("plans" in b["caption"] for b in board["beats"])


def test_conversation_updates_profile_directly_and_no_undoes(monkeypatch):
    from app.services import director as D, gemini_agent

    def chat(account_id, msg, *a):
        p = cm.propose(account_id, [{"field": "goals", "operation": "add", "value": {"type": "travel", "label": "Trip to Japan"}}],
                       rationale="You said you want to go to Japan")
        return {"reply": "", "proposal": p, "extraction": {"proposed_changes": p["changes"]}}
    monkeypatch.setattr(gemini_agent, "chat", chat)

    async def turn(text):
        return [(k, d) async for k, d in D.stage_stream(20133, text, use_ai=False)]
    events = asyncio.run(turn("I want to go to Japan next year"))
    prof = next(d for k, d in events if k == "profile")
    assert prof["changes"][0]["agent"] == "companion" and prof["changes"][0]["kind"] == "add"
    assert any(g["label"] == "Trip to Japan" for g in cm.summarize(cm.load_context(20133))["goals"])
    assert [d for k, d in events if k == "storyboard"][-1]["pending_proposal"] is None
    monkeypatch.setattr(gemini_agent, "chat", lambda *a: {"reply": "", "proposal": None})
    events = asyncio.run(turn("no"))
    assert next(d for k, d in events if k == "profile")["changes"][0]["kind"] == "undo"
    assert not any(g.get("label") == "Trip to Japan" for g in cm.summarize(cm.load_context(20133))["goals"])


def test_personas_registry_has_symbols_and_new_agents():
    ps = client.get("/api/agent/personas").json()["personas"]
    keys = {p["key"] for p in ps}
    assert {"persona_builder", "shock_generator", "life_planner", "schema_scout", "feature_forge"} <= keys
    assert all(p.get("symbol") and p.get("analogy") and p.get("stage") is not None for p in ps)


# ----------------------------------------------------------------------------- shock dealer
def test_dealer_keeps_official_slots_and_never_repeats():
    from app.services.shock_dealer import CHAR_BY_ID, deal
    for slot, key in ((1, "layoff"), (2, "furnace"), (3, "combined")):
        d = deal(ACC, slot, None, "manager", None, use_ai=False)
        assert d["card"]["key"] == key and d["character"]["id"] != "manager" and d["source"] == "local"
    prev_c = prev_s = None
    for i in range(8):
        d = deal(ACC, 4, None, prev_c, prev_s, use_ai=False, seed=i)
        assert d["character"]["id"] in CHAR_BY_ID and d["character"]["id"] != prev_c and d["card"]["key"] != prev_s
        assert d["card"]["key"] not in ("layoff", "furnace", "combined") and d["reason"]
        prev_c, prev_s = d["character"]["id"], d["card"]["key"]


def test_dealer_endpoint_falls_back_without_a_model():
    r = client.post("/api/agent/shock-dealer", json={"account_id": ACC, "slot": 4, "exclude_character": "manager"}).json()
    assert r["source"] == "local" and r["character"]["id"] != "manager" and r["ms"] < 3000
    assert len(client.get("/api/agent/characters").json()["characters"]) >= 10


def test_shuffle_in_chat_uses_dealer_and_replies(monkeypatch):
    from app.services import director as D

    async def collect(msg):
        return [(k, d) async for k, d in D.stage_stream(ACC, msg, use_ai=True)]
    ev1 = asyncio.run(collect("twist:random"))
    dealt = [d for k, d in ev1 if k == "trace" and d.get("agent") == "shock_dealer"]
    assert dealt and "local draw" in " ".join(dealt[0]["items"])
    board = [d for k, d in ev1 if k == "storyboard"][-1]
    assert board["reply"] and board["reply_source"] == "template" and board["card"].get("character")
    ev2 = asyncio.run(collect("twist:random"))
    d2 = [d for k, d in ev2 if k == "trace" and d.get("agent") == "shock_dealer"][0]
    assert d2["data"]["character"] != dealt[0]["data"]["character"] and d2["data"]["scenario"] != dealt[0]["data"]["scenario"]


def test_card_with_character_resolves_the_same_card():
    from app.services import director as D

    async def collect():
        return [(k, d) async for k, d in D.stage_stream(ACC, "twist:furnace@technician", use_ai=False)]
    board = [d for k, d in asyncio.run(collect()) if k == "storyboard"][-1]
    assert board["card"]["key"] == "furnace" and board["card"]["character"]["id"] == "technician"
    assert "The Technician" in board["reply"]


def test_offline_council_does_not_claim_a_strategist_handoff():
    from app.services import director as D

    async def collect():
        return [(k, d) async for k, d in D.stage_stream(ACC, "twist:layoff", use_ai=False)]
    hand = [d for k, d in asyncio.run(collect()) if k == "handoff"]
    assert not any(h.get("to") == "strategist" for h in hand)
    assert any(h.get("mode") == "offline" and h.get("to") == "ranker" for h in hand)


# ----------------------------------------------------------------------------- biggest discovery
@pytest.mark.parametrize("account,key", [(47788, "fragile_but_clean"), (20111, "timing_dips"), (88789, "weathered_before")])
def test_biggest_discovery_is_the_rare_non_obvious_finding(account, key):
    r = client.get(f"/api/customers/{account}/discovery").json()
    d = r["discovery"]
    assert d["key"] == key and d["evidence"] and d["action"] and d["rarity"]
    assert all(x["score"] <= d["score"] for x in r["runners_up"])


def test_intro_leads_with_the_discovery():
    from app.services import director as D

    async def collect():
        return [(k, d) async for k, d in D.stage_stream(20111, "__intro__", use_ai=False)]
    ev = asyncio.run(collect())
    board = [d for k, d in ev if k == "storyboard"][-1]
    assert board["beats"][0]["caption"].startswith("The biggest thing I found")
    assert any(k == "trace" and d.get("title", "").startswith("Biggest discovery") for k, d in ev)


# ----------------------------------------------------------------------------- personal goals
def test_persona_goals_are_personal_and_tied_to_records():
    from app.services.persona import get_persona
    p = get_persona(BORROWER, refine=False)
    labels = " | ".join(g["label"] for g in p["goals"])
    assert "loan-free" in labels and sum(1 for g in p["goals"] if g.get("personal")) >= 3
    assert all(g["evidence"] for g in p["goals"])


def test_goal_ideas_change_with_the_lens_and_can_be_added():
    bal = client.get(f"/api/profile/{BORROWER}/goal-ideas?lens=balanced").json()["ideas"]
    hab = client.get(f"/api/profile/{BORROWER}/goal-ideas?lens=habits").json()["ideas"]
    assert bal and hab and bal[0]["id"] != hab[0]["id"]
    assert hab[0]["family"] == "habit"
    client.get(f"/api/profile/{BORROWER}")
    idea = next(i for i in client.get(f"/api/profile/{BORROWER}/goal-ideas").json()["ideas"] if not i["in_profile"])
    doc = client.post(f"/api/profile/{BORROWER}/goals", json={"idea_id": idea["id"]}).json()
    assert doc["log"][0]["agent"] == "you" and any(g["label"] == idea["label"] for g in doc["goals"])
    assert client.post(f"/api/profile/{BORROWER}/goals", json={"idea_id": "nope"}).status_code == 404


def test_older_personas_get_personal_goals_once():
    from app.services.persona import get_persona
    get_persona(20133, refine=False)
    ctx = cm.load_context(20133)
    ctx["persona"]["goals_version"] = 1
    ctx["goals"] = [x for x in ctx["goals"] if not x["value"].get("personal")]
    cm.save_context(ctx)
    p = get_persona(20133, refine=False)
    assert p["goals_version"] == 2
    assert any(x["value"].get("personal") for x in cm.load_context(20133)["goals"])
    n = len(cm.load_context(20133)["profile_log"])
    get_persona(20133, refine=False)
    assert len(cm.load_context(20133)["profile_log"]) == n


# ----------------------------------------------------------------------------- life fit
def test_life_fit_rules_out_demanding_plans_for_an_older_shared_rural_household():
    from app.services.life_planner import run
    r = run(74916, {"income_fraction": 0.55, "shock_duration": 6}, store=False)
    fit_events = [e for e in r["trace"] if e["agent"] == "life_fit"]
    assert fit_events and "Age 58" in fit_events[0]["items"][0]
    fits = fit_events[1]["data"]["fit"]
    assert fits["consulting"] > fits["gig_during_6"] and fits["roommate"] < 0.7
    assert any(s["rule"].startswith("Does not fit this stage of life") and s["removed"] > 0 for s in r["search"]["screens"])
    for p in r["plans"]:
        assert all("Fit for you" in x["evidence"] for x in p["reasoning"])
        assert not any(st["decision"].startswith("gig") for st in p["steps"])


def test_life_fit_adds_stage_of_life_options():
    from app.services.life_planner import run
    young = {s["decision"] for p in run(47788, mode="long_term", store=False)["plans"] for s in p["steps"]}
    older = run(20111, {"income_fraction": 0.55, "shock_duration": 6}, store=False)
    titles = {s["decision"] for p in older["plans"] for s in p["steps"]}
    assert "cpp_at_60" in titles or "consulting" in titles
    assert "cpp_at_60" not in young


def test_a_bill_with_an_amount_is_a_one_off_cost_not_time_off():
    from app.services.stage3 import detect
    d = detect("if i get a hospital bill of 4000 tomorrow what will happen to me?")
    assert d["key"] == "bill" and d["r"] == 1.0 and d["one_off"] == 4000 and d["timing"] == "now"
    assert detect("I need surgery and will be off work")["r"] == 0.55


# ----------------------------------------------------------------------------- persona voice and world events
def test_goals_and_worries_carry_a_first_person_quote():
    d = client.get(f"/api/profile/{BORROWER}").json()
    assert all(g.get("quote") for g in d["goals"])
    assert all(w.get("quote") for w in d["persona"]["worries"])
    assert all(" I " in f" {g['quote']} " or " we " in f" {g['quote'].lower()} " or g["quote"].startswith(("I", "If", "When", "Every", "Some", "People", "The", "Repairs", "Seeing"))
               for g in d["goals"])


def test_model_quotes_cannot_add_numbers():
    from app.services.persona_voice import _digits
    assert not (_digits("I want 6 months covered") <= _digits("I want the bills covered"))


def test_world_events_are_in_the_personal_deck_and_ranked_for_the_life():
    from app.services.shocks import generate
    rural_cards, _ = generate(74916, None)
    cats = {c["category"] for c in rural_cards}
    assert {"disaster", "economy", "political"} <= cats
    wildfire = next(c for c in rural_cards if c["key"] == "p_wildfire")
    assert wildfire["likelihood"] == "medium" and wildfire["one_off"] > 0
    urban_cards, _ = generate(47788, None)
    assert next(c for c in urban_cards if c["key"] == "p_wildfire")["likelihood"] == "low"


@pytest.mark.parametrize("text,key", [("what if a recession hits next year", "recession"), ("tariffs are making everything more expensive", "tariffs"),
                                      ("we might have to evacuate for the wildfire", "wildfire"), ("what if there is another lockdown", "lockdown"),
                                      ("I might lose my job in the recession", "layoff")])
def test_world_events_are_recognised_in_conversation(text, key):
    from app.services.stage3 import detect
    assert detect(text)["key"] == key


# ----------------------------------------------------------------------------- replayable runs
def test_every_agent_run_is_recorded_and_replayable():
    from app.services import director as D
    client.get(f"/api/profile/{ACC}")                      # persona build
    client.get(f"/api/agent/deck?account_id={ACC}")        # personal deck
    client.post("/api/agent/life-plans", json={"account_id": ACC, "mode": "long_term"})

    async def turn():
        return [k async for k, _ in D.stage_stream(ACC, "I might lose my job", use_ai=False)]
    asyncio.run(turn())
    runs = client.get(f"/api/agents/runs/{ACC}").json()["runs"]
    titles = [r["title"] for r in runs]
    assert any(t.startswith("Persona built") for t in titles)
    assert any(t.startswith("Personal deck built") for t in titles)
    assert any(t.startswith("Plan search") for t in titles)
    assert "I might lose my job" in titles and runs[-1]["id"] == "stage1"
    turn_run = client.get(f"/api/agents/runs/{ACC}/{next(r['id'] for r in runs if r['title'] == 'I might lose my job')}").json()
    assert turn_run["stage"] == 3 and turn_run["events"][0]["agent"] == "you"
    assert any(e["agent"] == "life_fit" for e in turn_run["events"]) and turn_run["events"][-1]["title"] == "Pulp's reply"
    s1 = client.get(f"/api/agents/runs/{ACC}/stage1").json()
    assert s1["stage"] == 1 and len(s1["events"]) > 10
    assert client.get(f"/api/agents/runs/{ACC}/nope").status_code == 404


# ----------------------------------------------------------------------------- explain
@pytest.mark.parametrize("topic", ["typical_month", "cushion", "runway", "discovery", "shock?r=0.55&d=6", "prepare_now?r=0.55&d=6",
                                   "if_it_happens?r=0.55&d=6", "shock_numbers?r=0.55&d=6", "plan", "finalists", "plan_search", "goals", "persona", "quartiles",
                                   "loan_check", "demographics", "agents", "stage1", "stage2", "stage3"])
def test_every_explain_topic_answers_in_plain_words(topic):
    from app.services import director as D

    async def go():
        return [d for k, d in [(k, d) async for k, d in D.stage_stream(ACC, f"explain:{topic}", use_ai=False)] if k == "storyboard"][-1]
    board = asyncio.run(go())
    assert board["reply"] and len(board["reply"]) < 600 and board["beats"][0]["visual"] == "none"


def test_explain_inside_a_spoken_sentence():
    from app.services import director as D

    async def go():
        return [d for k, d in [(k, d) async for k, d in D.stage_stream(ACC, "Please explain this simply: explain:cushion", use_ai=False)] if k == "storyboard"][-1]
    assert "cushion" in asyncio.run(go())["reply"]


def test_every_angle_offers_its_own_goal_ideas():
    tops = {lens: [i["id"] for i in client.get(f"/api/profile/88789/goal-ideas?lens={lens}").json()["ideas"][:3]]
            for lens in ("balanced", "safety", "ambitious", "life", "habits")}
    assert len({tuple(v) for v in tops.values()}) == 5
    fams = {"safety": "safety", "ambitious": "growth", "life": "life", "habits": "habit"}
    for lens, fam in fams.items():
        first = client.get(f"/api/profile/88789/goal-ideas?lens={lens}").json()["ideas"][0]
        assert first["family"] == fam
