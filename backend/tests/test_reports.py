"""Agent trace and Stage 1 report endpoints (docs/agents/v2-contracts.md)."""
import time

from fastapi.testclient import TestClient

from app.main import app
from app.services import context_manager as cm

client = TestClient(app)
ACCOUNT = 20160
KINDS = {"start", "tool_call", "tool_result", "handoff", "output", "note"}


def _check_event(e, stage):
    assert e["stage"] == stage
    assert e["kind"] in KINDS
    assert isinstance(e["t"], (int, float)) and isinstance(e["agent"], str) and e["title"]
    if e["kind"] == "handoff":
        assert e.get("to")


def test_trace_has_three_stages_with_handoffs():
    r = client.get(f"/api/agents/trace/{ACCOUNT}")
    assert r.status_code == 200
    doc = r.json()
    assert doc["account_id"] == ACCOUNT
    assert [s["stage"] for s in doc["stages"]] == [1, 2, 3]
    for s in doc["stages"]:
        assert s["title"] and s["summary"] and s["events"]
        assert len(s["events"]) <= 60
        for e in s["events"]:
            _check_event(e, s["stage"])
        ts = [e["t"] for e in s["events"]]
        assert ts == sorted(ts)
    s1 = doc["stages"][0]
    agents = {e["agent"] for e in s1["events"]}
    assert {"schema_scout", "feature_forge", "pattern_hunter", "archetype_namer", "narrator",
            "persona_builder", "shock_generator"} <= agents
    hand = [(e["agent"], e["to"]) for e in s1["events"] if e["kind"] == "handoff"]
    assert ("schema_scout", "feature_forge") in hand and ("narrator", "persona_builder") in hand
    assert any(e["kind"] == "tool_call" and e["agent"] == "pattern_hunter" for e in s1["events"])


def test_trace_with_empty_context_says_what_will_happen():
    doc = client.get(f"/api/agents/trace/{ACCOUNT}").json()
    s2, s3 = doc["stages"][1], doc["stages"][2]
    assert any(e["kind"] == "note" for e in s2["events"])
    assert any(e["kind"] == "note" for e in s3["events"])
    assert any(e["agent"] == "persona_builder" and e["kind"] == "note" for e in doc["stages"][0]["events"])


def _persona():
    return {"display_name": "Dana", "age": 41, "occupation": {"label": "Electrician", "confidence": 0.6},
            "story": "Works for a small contractor.",
            "goals": [{"label": "Emergency fund", "size": "small", "horizon": "short", "importance": 5, "weight": 0.6}],
            "worries": [{"label": "Irregular work"}],
            "questions": [{"key": "q1", "text": "How steady is work?", "why": "income"}]}


def test_trace_uses_profile_log_conversation_persona_deck_and_plans():
    ctx = cm.load_context(ACCOUNT)
    ctx["persona"] = _persona()
    ctx["persona_trace"] = [{"t": 0.5, "stage": 1, "agent": "persona_builder", "kind": "tool_call", "title": "occupation_guess()"}]
    ctx["profile_log"] = [
        {"id": "c1", "at": "2026-11-08T10:00:00Z", "version": 2, "agent": "persona_builder", "kind": "seed",
         "field": "goals", "label": "Emergency fund", "before": None, "after": {"label": "Emergency fund"}, "reason": "persona seed"},
        {"id": "c2", "at": "2026-11-08T10:02:00Z", "version": 3, "agent": "companion", "kind": "add",
         "field": "goals", "label": "Trip to Lisbon", "before": None, "after": {"label": "Trip to Lisbon"}, "reason": "you said so"},
    ]
    ctx["conversation"] = [{"role": "user", "text": "I want to go to Lisbon", "at": "2026-11-08T10:01:00Z"},
                           {"role": "assistant", "text": "Noted the trip.", "at": "2026-11-08T10:01:30Z"}]
    ctx["deck"] = {"cards": [{"title": "Client loss", "likelihood": "medium"}], "source": "offline",
                   "trace": [{"t": 0.2, "stage": 3, "agent": "shock_generator", "kind": "output", "title": "1 card"}]}
    ctx["life_plans"] = {"shock": {"label": "Layoff"}, "recommended": "p1", "plans": [{"id": "p1", "name": "Second job"}],
                         "trace": [{"t": 0, "stage": 3, "agent": "life_planner", "kind": "start", "title": "Plan"},
                                   {"t": 1, "stage": 3, "agent": "life_planner", "kind": "handoff", "title": "3 plans", "to": "validator"}]}
    cm.save_context(ctx)
    doc = client.get(f"/api/agents/trace/{ACCOUNT}").json()
    s1, s2, s3 = doc["stages"]
    titles1 = " ".join(e["title"] for e in s1["events"])
    assert "Dana" in titles1 and "occupation_guess()" in titles1
    assert any(e["kind"] == "handoff" and e["title"] == "1 goals" for e in s1["events"])
    t2 = [e["title"] for e in s2["events"]]
    assert "added goal: Trip to Lisbon" in t2 and "seeded goal: Emergency fund" in t2
    assert any(e["kind"] == "handoff" and e["agent"] == "user" and e["to"] == "companion" for e in s2["events"])
    assert any(e["kind"] == "handoff" and e["agent"] == "companion" and e["to"] == "director" for e in s2["events"])
    assert "Second job" in s3["summary"]
    for s in doc["stages"]:
        for e in s["events"]:
            _check_event(e, s["stage"])


def test_trace_survives_malformed_context():
    ctx = cm.load_context(ACCOUNT)
    ctx.update({"persona": "oops", "deck": [], "life_plans": {"trace": "x"}, "profile_log": [None, 3, {"kind": "add"}]})
    cm.save_context(ctx)
    r = client.get(f"/api/agents/trace/{ACCOUNT}")
    assert r.status_code == 200 and len(r.json()["stages"]) == 3


def test_unknown_account_is_404():
    assert client.get("/api/agents/trace/1").status_code == 404
    assert client.get("/api/report/stage1?account_id=1").status_code == 404


def _headings(half):
    return [s["heading"] for s in half["sections"]]


def test_dataset_report_has_both_halves():
    doc = client.get("/api/report/stage1").json()
    assert doc["account_id"] is None and doc["generated_at"]
    for half in ("plain", "technical"):
        h = doc[half]
        assert h["title"] and h["summary"] and len(h["sections"]) >= 5
        for s in h["sections"]:
            assert s["heading"] and s["body"]
            if "table" in s:
                assert s["table"]["headers"]
                assert all(len(r) == len(s["table"]["headers"]) for r in s["table"]["rows"])
    plain, tech = _headings(doc["plain"]), _headings(doc["technical"])
    assert "What we looked at" in plain and "What to keep in mind" in plain and "Does it match real life?" in plain
    assert "Data sources and coverage" in tech and "Behavioural archetypes" in tech
    assert "External validation against loan outcomes" in tech and "Limitations and threats to validity" in tech
    body = " ".join(s["body"] for s in doc["plain"]["sections"])
    assert "78 of 2,238" in body and "PKDD'99" in body


def test_account_report_adds_account_sections_and_persona():
    doc = client.get(f"/api/report/stage1?account_id={ACCOUNT}").json()
    assert doc["account_id"] == ACCOUNT
    assert doc["plain"]["sections"][0]["heading"] == f"Account {ACCOUNT} at a glance"
    assert f"Account {ACCOUNT}: official metrics" in _headings(doc["technical"])
    assert "What Pulp would ask first" in _headings(doc["plain"])
    assert not any("fictional" in h for h in _headings(doc["plain"]))  # no persona yet

    ctx = cm.load_context(ACCOUNT)
    ctx["persona"] = _persona()
    cm.save_context(ctx)
    doc = client.get(f"/api/report/stage1?account_id={ACCOUNT}").json()
    persona = next(s for s in doc["plain"]["sections"] if "fictional" in s["heading"])
    assert "Dana" in persona["body"] and persona["table"]["rows"][0][0] == "Emergency fund"
    ask = next(s for s in doc["plain"]["sections"] if s["heading"] == "What Pulp would ask first")
    assert "How steady is work?" in ask["body"]


def test_report_and_trace_are_fast_when_warm():
    client.get(f"/api/report/stage1?account_id={ACCOUNT}")
    client.get(f"/api/agents/trace/{ACCOUNT}")
    t = time.time()
    client.get(f"/api/report/stage1?account_id={ACCOUNT}")
    client.get(f"/api/agents/trace/{ACCOUNT}")
    assert time.time() - t < 2.0


def test_markdown_render():
    from app.services.stage1_report import build_report, to_markdown
    md = to_markdown(build_report(None))
    assert md.startswith("# What PULP learned") and "# Stage 1 technical report" in md and "|---|" in md
