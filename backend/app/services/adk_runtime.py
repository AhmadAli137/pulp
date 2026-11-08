"""Small wrapper around Google ADK so every PULP agent runs the same way.

One call = one fresh in-memory session, one user message, collected final texts per agent, the session state
(output_key values), and the list of tool calls the agents made. The ADK is optional at import time so the slim
Vercel function still boots; `adk_available()` tells callers whether a model role can run.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

from .. import config

try:
    from google.adk.agents import LlmAgent, ParallelAgent, SequentialAgent  # noqa: F401  (re-exported for callers)
    from google.adk.runners import InMemoryRunner
    from google.genai import types as gtypes

    ADK_AVAILABLE = True
except Exception:  # pragma: no cover - environment dependent
    ADK_AVAILABLE = False
    LlmAgent = ParallelAgent = SequentialAgent = None  # type: ignore[assignment]


def adk_available() -> bool:
    return ADK_AVAILABLE and bool(config.GEMINI_API_KEY)


async def run_agent_async(root: Any, payload: str, *, user_id: str, app_name: str = "pulp") -> dict:
    os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")
    runner = InMemoryRunner(agent=root, app_name=app_name)
    session = await runner.session_service.create_session(app_name=app_name, user_id=user_id)
    msg = gtypes.Content(role="user", parts=[gtypes.Part(text=payload)])
    texts: dict[str, list[str]] = {}
    tool_calls: list[dict] = []
    try:
        async for ev in runner.run_async(user_id=session.user_id, session_id=session.id, new_message=msg):
            for call in ev.get_function_calls() or []:
                tool_calls.append({"agent": ev.author, "tool": call.name, "args": dict(call.args or {})})
            if ev.content and ev.content.parts:
                for p in ev.content.parts:
                    if getattr(p, "text", None):
                        texts.setdefault(ev.author or "?", []).append(p.text)
        final = await runner.session_service.get_session(app_name=app_name, user_id=session.user_id, session_id=session.id)
        state = dict(final.state) if final else {}
    finally:
        try:
            await runner.close()
        except Exception:
            pass
    return {"state": state, "texts": texts, "tool_calls": tool_calls}


def run_agent(root: Any, payload: str, *, user_id: str, app_name: str = "pulp") -> dict:
    """Synchronous entry point (FastAPI sync routes run in a worker thread, so a fresh loop is fine)."""
    return asyncio.run(run_agent_async(root, payload, user_id=user_id, app_name=app_name))


def json_block(text: Any) -> dict | None:
    """Pull the first JSON object out of a model reply (fenced or bare); dicts pass through."""
    if isinstance(text, dict):
        return text
    if not text or not isinstance(text, str):
        return None
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    raw = fenced.group(1) if fenced else None
    if raw is None:
        start, end = text.find("{"), text.rfind("}")
        raw = text[start:end + 1] if start >= 0 and end > start else None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def agent_output(result: dict, name: str) -> dict | None:
    """The agent's structured output: state[output_key] first, else the last text it produced."""
    state_val = result["state"].get(name)
    parsed = json_block(state_val)
    if parsed is not None:
        return parsed
    texts = result["texts"].get(name) or []
    return json_block("\n".join(texts)) if texts else None
