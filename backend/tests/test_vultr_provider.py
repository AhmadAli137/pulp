"""Vultr Serverless Inference provider: request shape and parsing, with a mocked HTTP transport (no network)."""
import json

import httpx
import pytest

from app.services import gemini_agent, vultr_inference
from app.services.data_store import get_store

ACCOUNT = get_store().sample_ids(1, seed=5)[0]


def _mock_client(calls: list):
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append({"url": str(request.url), "auth": request.headers.get("authorization"), "body": body})
        if body.get("response_format"):
            content = json.dumps({"intent": "update_goal", "requires_confirmation": True, "rationale": "mock",
                                  "follow_up_question": "When would you like to move?",
                                  "proposed_changes": [{"field": "goals", "operation": "add", "value": {"type": "move_out", "label": "Move out", "priority": 1}}]})
        else:
            content = "Moving out is a solid goal. Your buffer is quoted from the calculator."
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_vultr_turn_builds_requests_and_validates(monkeypatch):
    monkeypatch.setattr(vultr_inference, "VULTR_INFERENCE_API_KEY", "test-key")
    monkeypatch.setattr(vultr_inference, "VULTR_INFERENCE_MODEL", "deepseek-v4.1-flash-1017")
    calls: list = []
    reply, extraction, tools = vultr_inference.vultr_turn(
        ACCOUNT, "I want to move out.", {}, [{"role": "user", "text": "hi"}, {"role": "assistant", "text": "hello"}],
        gemini_agent.SYSTEM_PROMPT, "extract", gemini_agent.AgentExtraction, client=_mock_client(calls))
    assert reply.startswith("Moving out")
    assert extraction.proposed_changes[0].value["type"] == "move_out"
    assert tools[0]["result"]["provider"] == "vultr-serverless-inference"
    assert len(calls) == 2
    assert calls[0]["url"].endswith("/v1/chat/completions")
    assert calls[0]["auth"] == "Bearer test-key"
    assert calls[0]["body"]["model"] == "deepseek-v4.1-flash-1017"
    sys_msg = calls[0]["body"]["messages"][0]["content"]
    assert "AUTHORITATIVE NUMBERS" in sys_msg and "typical_inflow_I" in sys_msg
    assert calls[0]["body"]["messages"][-1] == {"role": "user", "content": "I want to move out."}
    assert calls[1]["body"]["response_format"]["type"] == "json_schema"


def test_vultr_failure_falls_back_to_offline(monkeypatch):
    monkeypatch.setattr(gemini_agent, "GEMINI_API_KEY", "")
    monkeypatch.setattr(gemini_agent, "VULTR_INFERENCE_API_KEY", "bad")
    monkeypatch.setattr(gemini_agent, "AI_PROVIDER", "auto")
    monkeypatch.setattr(vultr_inference, "VULTR_INFERENCE_API_KEY", "bad")

    def boom(*a, **k):
        raise httpx.ConnectError("no network in tests")
    monkeypatch.setattr(vultr_inference, "chat_completion", boom)
    r = gemini_agent.chat(ACCOUNT, "I want to buy a home in five years.")
    assert r["mode"] == "offline_fallback"
    assert any(c["value"].get("type") == "home_purchase" for c in r["extraction"]["proposed_changes"])


def test_provider_selection(monkeypatch):
    monkeypatch.setattr(gemini_agent, "GEMINI_API_KEY", "")
    monkeypatch.setattr(gemini_agent, "VULTR_INFERENCE_API_KEY", "")
    assert gemini_agent.active_provider() == "offline"
    monkeypatch.setattr(gemini_agent, "VULTR_INFERENCE_API_KEY", "k")
    assert gemini_agent.active_provider() == "vultr"
    monkeypatch.setattr(gemini_agent, "GEMINI_API_KEY", "g")
    assert gemini_agent.active_provider() == "gemini"
    monkeypatch.setattr(gemini_agent, "AI_PROVIDER", "vultr")
    assert gemini_agent.active_provider() == "vultr"
