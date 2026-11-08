"""Vultr Serverless Inference provider for the companion (OpenAI-compatible chat completions).

Endpoint: POST {VULTR_INFERENCE_BASE_URL}/chat/completions with `Authorization: Bearer <key>`.
Default base URL https://api.vultrinference.com/v1; models such as deepseek-v4.1-flash-1017 or qwen3.8-flash-next.

The provider never computes money: the official profile and shock numbers are computed by the backend and
injected into the system prompt, and a second JSON-schema call extracts the structured profile updates, which
Pydantic validates. Any failure raises so the caller falls back to the offline engine.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from ..config import VULTR_INFERENCE_API_KEY, VULTR_INFERENCE_BASE_URL, VULTR_INFERENCE_MODEL

log = logging.getLogger("pulp.vultr")


def _headers() -> dict:
    return {"Authorization": f"Bearer {VULTR_INFERENCE_API_KEY}", "Content-Type": "application/json"}


def chat_completion(messages: list[dict], *, response_format: dict | None = None, temperature: float = 0.4,
                    max_tokens: int = 600, client: httpx.Client | None = None) -> str:
    body: dict[str, Any] = {"model": VULTR_INFERENCE_MODEL, "messages": messages, "temperature": temperature,
                            "max_completion_tokens": max_tokens, "stream": False}
    if response_format:
        body["response_format"] = response_format
    own = client is None
    client = client or httpx.Client(timeout=60.0)
    try:
        r = client.post(f"{VULTR_INFERENCE_BASE_URL.rstrip('/')}/chat/completions", headers=_headers(), json=body)
        r.raise_for_status()
        data = r.json()
        return (data["choices"][0]["message"]["content"] or "").strip()
    finally:
        if own:
            client.close()


def grounding_block(account_id: int) -> str:
    """Deterministic numbers for the prompt: profile, baseline, layoff and combined twists, confirmed context."""
    from .financial_profiles import get_metrics
    from .tangerine_metrics import compute_shock, horizon_verdict
    from . import context_manager as cm
    m = get_metrics(int(account_id))
    base = compute_shock(m.typical_inflow, m.typical_spending, m.household_bills, m.buffer)
    lay = compute_shock(m.typical_inflow, m.typical_spending, m.household_bills, m.buffer, r=0.55)
    comb = compute_shock(m.typical_inflow, m.typical_spending, m.household_bills, m.buffer, r=0.55, h=0.15)
    ctx = cm.summarize(cm.load_context(int(account_id)))
    facts = {
        "account_id": int(account_id), "months_of_history": m.months_available,
        "typical_inflow_I": round(m.typical_inflow, 2), "typical_spending_S": round(m.typical_spending, 2),
        "fixed_costs_F": round(m.typical_fixed_costs, 2), "household_bills_H": round(m.household_bills, 2),
        "buffer_B": round(m.buffer, 2), "typical_surplus_per_month": round(m.typical_surplus, 2),
        "baseline_runway": base["runway_label"],
        "layoff_55pct_6mo": {"runway": lay["runway_label"], "monthly_gap": round(lay["monthly_gap"], 2), "verdict": horizon_verdict(lay, 6)["verdict"]},
        "layoff_plus_bills_15pct": {"runway": comb["runway_label"], "monthly_gap": round(comb["monthly_gap"], 2), "verdict": horizon_verdict(comb, 6)["verdict"]},
        "confirmed_context": {k: ctx[k] for k in ("goals", "concerns", "constraints", "preferences", "upcoming_events")},
        "questions_already_asked": ctx["asked_questions"],
    }
    return json.dumps(facts)


def vultr_turn(account_id: int, text: str, summary: dict, history: list[dict], system_prompt: str, extract_prompt: str,
               extraction_model, client: httpx.Client | None = None) -> tuple[str, Any, list[dict]]:
    """One companion turn on Vultr. Returns (reply, AgentExtraction, tool_log)."""
    facts = grounding_block(account_id)
    sys = (system_prompt + "\n\nAUTHORITATIVE NUMBERS (computed by the bank's calculator; quote these, never invent or recompute): "
           + facts + "\nIf the user asks a what-if that is not covered, say you will run it in the calculator rather than estimating.")
    messages = [{"role": "system", "content": sys}]
    for h in history[-10:]:
        messages.append({"role": "user" if h["role"] == "user" else "assistant", "content": h["text"]})
    messages.append({"role": "user", "content": text})
    reply = chat_completion(messages, client=client)
    tool_log = [{"tool": "grounding_block", "result": {"source": "backend calculator", "provider": "vultr-serverless-inference"}}]

    schema = extraction_model.model_json_schema()
    ex_messages = [
        {"role": "system", "content": "You extract structured profile updates. Respond with JSON only, matching the provided schema."},
        {"role": "user", "content": extract_prompt},
    ]
    extraction = None
    last_err: Exception | None = None
    for attempt in range(2):
        try:
            raw = chat_completion(ex_messages, response_format={"type": "json_schema", "json_schema": {"name": "AgentExtraction", "schema": schema}},
                                  temperature=0.0, max_tokens=800, client=client)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.strip("`")
                raw = raw[raw.find("{"):raw.rfind("}") + 1]
            extraction = extraction_model.model_validate_json(raw)
            break
        except Exception as e:  # validation or transport
            last_err = e
            log.warning("Vultr extraction attempt %s failed: %s", attempt + 1, e)
    if extraction is None:
        raise RuntimeError(f"Vultr extraction failed: {last_err}")
    return reply, extraction, tool_log
