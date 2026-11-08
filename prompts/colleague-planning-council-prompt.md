# Prompt: build the PULP planning council (Stage B, Google ADK)

Copy everything below the line into your coding agent, in the PULP repo root.

---

You are working in the PULP repository (FastAPI backend in `backend/`, React frontend in `frontend/`), a
financial resilience engine for the Tangerine track at Sheridan Datathon 2026. Read, in order:
`docs/agents/README.md`, `docs/agents/01-unified-agentic-workflow.md`, `docs/agents/03-planning-council-blueprint.md`,
`docs/agents/04-contracts.md`, `docs/agents/05-testing-and-acceptance.md`. Then read the services you will wrap:
`backend/app/services/tangerine_metrics.py`, `scenario_engine.py`, `strategy_optimizer.py`, `roadmap.py`,
`context_manager.py`, `feedback_loop.py`, and the existing single-agent companion `gemini_agent.py` so you reuse
its conventions (provider selection, validated extraction, offline fallback).

Build **Stage B: the planning council**, exactly as specified in `03-planning-council-blueprint.md`:

1. `backend/app/agents/snapshot.py`: `build_snapshot(account_id, shock)` computed once in Python from the existing services. Strip chart arrays.
2. `backend/app/agents/tools.py`: thin tool functions `run_shock`, `simulate_paths`, `tipping_point`, `compare_strategies_tool`, `check_constraints`, `alternate_shocks`. They only call existing services and return dicts. No tool writes memory.
3. `backend/app/agents/evidence.py`: the deterministic parts of `check_constraints` (compare proposed monthly amounts with typical surplus and the confirmed `can_free_up_per_month`, `expected_rent`, `startup_budget`, `income_replacement`) and `alternate_shocks` (official runway under baseline, layoff 55%, bills +15%, repair = one month of S, combined, income 70%, plus horizons 3/6/9/12).
4. `backend/app/agents/schemas.py`: `NumberRef`, `Action`, `DraftPlan`, `AdvocateReview`, `ChallengerReview`, `FinalPlan`, `CouncilResult` as in the blueprint. Enforce the parity rule: drop any `NumberRef` whose `value` does not occur verbatim in the serialized snapshot or the tool log, and set `mode="partial"` when that happens.
5. `backend/app/agents/prompts.py`: the four instruction strings from the blueprint, verbatim, with `{snapshot_json}` injection.
6. `backend/app/agents/council.py`: `build_council()` as `SequentialAgent([consultant_draft, ParallelAgent([advocate, challenger]), consultant_revise])` using `google-adk`; `run_council(snapshot, budget_s=45)` with `asyncio.wait_for`, tool logging, JSON parse with one retry per agent (agents with tools cannot use `output_schema`; the reviser can).
7. `backend/app/agents/fallback.py`: `fallback_council(snapshot)` in pure Python producing a complete `CouncilResult` with `mode="fallback"`.
8. `backend/app/api/council.py`: `POST /api/council/plan` and `GET /api/council/{account_id}/last`, registered in `backend/app/main.py`. 404 for unknown accounts before any agent runs. Store the last five results in the account's context document under `council_results` without changing `context_version`.
9. `frontend/src/pages/Goals.tsx`: a "Council review" panel with three columns (Consultant, Advocate, Challenger), the final plan with `changes_made` and `unresolved`, a `mode` chip, elapsed time, NumberRef chips with their source in a tooltip, and a "Read aloud" button for `summary_spoken` using `useSpeech`. Add a compact card on `Home.tsx` that appears after the intake posts to the council.
10. `backend/tests/test_council.py` covering every row of the council section in `05-testing-and-acceptance.md`. Keep the existing 50 tests green.

Constraints you must not break:

- LLMs explain; Python calculates. No number reaches the UI unless it came from a service or a tool result.
- The council never writes life context. If the Advocate has a question, return it; the UI sends it to the chat for consent.
- Degrade, never block: with no `GEMINI_API_KEY` the endpoint still returns a full `CouncilResult` with `mode="fallback"` in under 3 s.
- Monte Carlo numbers always carry the disclaimer string from `scenario_engine.simulate`.
- Add `google-adk` to `backend/requirements.txt` only (not the root Vercel `requirements.txt`); map `GEMINI_API_KEY` to `GOOGLE_API_KEY` in `backend/app/config.py`; use `ADK_MODEL` defaulting to `GEMINI_MODEL`.
- Follow the repo's style: type hints, docstrings on tools, `_clean()` for NaN before returning JSON, Pydantic request models.

Work in this order and report after each step with what you implemented, what you tested, what passed and what remains: (a) snapshot + fallback + endpoint + tests (judge-safe), (b) ADK consultant draft and revise with parity checks, (c) advocate and challenger in parallel, (d) UI panel, (e) full test matrix and a three-run latency measurement on account 47788 with the layoff shock. Do not stop after planning; implement and run the tests.
