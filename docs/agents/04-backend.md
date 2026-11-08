# Backend implementation blueprint

## Repository integration map

Paths below are relative to the repository root. Existing modules should remain independently testable.

| Existing path | Responsibility | Required treatment |
|---|---|---|
| `backend/app/services/data_store.py` | CSV loading and account lookup | Reuse; compute dataset version once at startup |
| `backend/app/services/financial_profiles.py` | Account metrics | Reuse; bind account before model execution |
| `backend/app/services/tangerine_metrics.py` | Official shock, verdict, tipping point | Preserve formulas; wrap typed results as evidence |
| `backend/app/services/scenario_engine.py` | Seeded historical bootstrap and deterministic projection | Pass explicit timing and strategy; preserve seed |
| `backend/app/services/strategy_optimizer.py` | Strategy scoring from context | Accept explicit scenario; remove hidden default substitution on the new path |
| `backend/app/services/roadmap.py` | Action descriptions | Consume supplied comparison/evidence; eliminate independent default scenario recomputation on the new path |
| `backend/app/services/context_manager.py` | Versioned personal context | Read frozen context; keep mutations outside model tools |
| `backend/app/services/feedback_loop.py` | Compute and save replanning snapshot | Extract pure evaluator; preserve legacy wrapper behavior |
| `backend/app/services/gemini_agent.py` | Current chat and extraction | Keep fallback; route reviewed requests to planner |
| `backend/app/api/decision.py` | Scenario interpretation and deterministic comparisons | Preserve current endpoints; share scenario adapters |
| `backend/app/api/voice.py` | Live voice relay | Integrate separate intake handoff; do not duplicate planning logic |
| `backend/app/api/routes.py` | Current API and context endpoints | Keep backward compatibility |

The current Gemini chat exposes only a subset of the service functions declared in the module. Do not assume the existing `TOOLS` list is the active agent tool configuration; inspect the actual `GenerateContentConfig` used by `gemini_turn`.

## Proposed files

```text
backend/app/
  schemas/planning.py              # domain contracts; no ADK imports
  api/planning.py                  # request/status/events/accept endpoints
  agents/
    adapter.py                    # PlannerAdapter interface
    adk_planner.py                # pinned SDK integration
    workflow.py                   # orchestration and budgets
    prompts/                      # versioned role prompts
    tools.py                      # narrow, role-scoped wrappers
  services/
    planning_snapshot.py          # immutable inputs, versions, fingerprints
    planning_evidence.py          # typed registry and reference resolution
    planning_evaluation.py        # pure calculation pipeline
    planning_validation.py        # deterministic output gate
    planning_runs.py              # bounded run state, events, cancellation
    planning_acceptance.py        # explicit versioned persistence
backend/tests/
  test_planning_contracts.py
  test_planning_math.py
  test_planning_workflow.py
  test_planning_consent.py
  test_planning_api.py
```

Names are proposed ownership boundaries, not files already installed by this documentation.

## Canonical time and money semantics

Use zero-based interval indices internally. Display interval 0 as "Month 1". A projection of H months has H cash-flow intervals and H+1 balance points; point 0 is the initial balance. A shock applies over `[start, start + duration)`. The one-off expense is charged once at shock start, before that interval's regular cash flow, matching the existing simulator's funding-gap checks. A later recovery must not erase an earlier shortfall.

Map the approved scenario into both calculators explicitly:

- `income_fraction` -> official `r`, simulator `income_fraction`.
- `bills_increase` -> official `h`, simulator `bills_increase`.
- `one_off_cost_cad` -> Decimal expense for official math, validated numeric conversion at simulator boundary.
- `shock_duration_months` -> official duration verdict T for the constant shock calculation.
- `shock_start_month`, `shock_duration_months`, `projection_horizon_months` -> simulator window and horizon.

The official calculation is a constant-flow shock calculation from its stated starting buffer; it does not automatically model pre-shock savings or post-shock recovery. If a delayed shock needs a buffer-at-onset calculation, compute it as a separately named projection-derived result. Do not relabel it as the original official metric.

Keep `official_runway_from_snapshot` separate from `projected_first_shortfall_month`. Never assert general equality. Test parity only in aligned immediate-shock, constant-flow cases with identical starting buffer, cost timing, and horizon semantics. Fractional runway and discrete interval shortfall are related but not interchangeable.

Preserve official precedence: nonpositive remaining buffer produces zero runway; otherwise a nonpositive monthly gap produces no shortfall; positive-gap runway is capped and displayed according to the existing engine. Use unrounded values for verdicts. Do not add fixed costs to spending a second time, convert the dataset from Czech currency again, or call all inflows salary.

For paired bootstrap comparisons, use the same historical-month samples/seed across strategies where supported. That reduces noise in the comparison; it does not make the samples a forecast. A sampled shortfall frequency is always conditional on the specified scenario and bootstrap method.

## Refactor strategy and roadmap evaluation first

`compare_strategies` currently derives stress conditions from concerns and uses a default six-month income shock. Its goal emergency target also has scenario-specific assumptions. Add an explicit scenario argument on the reviewed path and derive targets from that scenario's duration, costs, and selected policy. Avoid formulas that still contain an unexplained hardcoded six or 55% after the signature changes.

The current legacy optimizer discloses extensions to the goal deadline in `projection_note`, `requested_horizon_months`, and `why`. This is not approval for extending a future reviewed request. Keep legacy default behavior in a named adapter for existing endpoints. New planning tools must require the scenario argument; do not make it optional and allow a missing parameter to recreate drift. Pass explicit horizon semantics into goal scoring. If a confirmed goal deadline extends beyond the requested projection, report that limitation or ask for a longer approved horizon; do not silently extend the run.

`build_roadmap` should receive the already-computed comparison and evidence references. It must not recompute a different default plan. Fixed-cost labels do not identify all essential spending: do not describe the remaining spending as freely cuttable.

Split replanning conceptually:

```python
# Illustrative interfaces, not existing executable functions.
evaluation = evaluate_plan(snapshot, scenario, simulation_settings)
candidate = review_with_agents(evaluation, snapshot)
validated = validate_result(candidate, evaluation.evidence)
# Only an explicit user acceptance endpoint may call:
receipt = accept_plan(validated, expected_versions, idempotency_key)
```

Legacy `replan()` may call the new pure evaluator and its existing persistence step to preserve current tests. The ADK tools call only the pure evaluator. Test both paths independently.

## Role-to-tool permissions

| Tool | Consultant | Advocate | Challenger | Mutation |
|---|---|---|---|---|
| `read_snapshot()` | Yes | Yes | Yes | None |
| `read_evidence(ids)` | Yes | Yes | Yes | None |
| `compare_approved_strategies(ids)` | Yes | Yes | No | Run evidence only |
| `draft_roadmap(strategy_id)` | Yes | No | No | None |
| `check_confirmed_constraints(action_ids)` | Yes | Yes | No | Run evidence only |
| `evaluate_alternative(delta, purpose)` | Bounded revision only | No | Yes | Run evidence only |
| `find_tipping_point(variable, bounds)` | No | No | Yes | Run evidence only |
| `confirm_context`, `accept_plan`, `save_context`, `replan` | No | No | No | Forbidden |

Tool arguments omit account ID and baseline snapshot. Closures bind them on the server. Reject unknown scenario variables, out-of-range deltas, and arbitrary code/URLs. `find_tipping_point` must use existing exact math where applicable; if a monotonic search is added, verify monotonicity and precision/bounds with tests. Do not pretend every threshold admits a binary search.

Each wrapper logs a sanitized call record: run ID, role, tool name, normalized argument hash, evidence ID, duration, cache hit, status. Do not log API keys, raw audio, full transcripts, or hidden model reasoning. Operational records still need retention limits because scenario/context summaries can be sensitive.

## Evidence and numeric rendering

Create evidence after domain validation, not from an agent's self-reported numbers. Financial claims in a candidate result reference evidence fields. The response assembler supplies display strings from those fields. Prefer narrative templates with typed placeholders for numeric sentences. A regex that merely checks whether a number occurred somewhere in tool output does not establish correct meaning.

Validate the relationship: unit, scenario ID, strategy ID, context/data versions, and metric definition. A correct amount associated with the wrong scenario is an invalid claim. Keep the original evidence available for the "Show the math" interaction.

## Workflow adapter and concurrency

First implement `FakePlannerAdapter` for deterministic tests. Then implement `AdkPlannerAdapter` after a compatibility spike. Pin dependencies, document the selected ADK API generation, and test Python compatibility with this repo's installed runtime. Existing environments use Python 3.14; do not assume every new package supports it. Use a supported isolated environment if needed and update setup instructions.

The adapter receives immutable domain data and returns schema-valid role outputs. It must not own permanent user memory. Shared ADK session state must not become a second source of truth for confirmed context. Use run-scoped session IDs and separate output keys per reviewer. Do not let concurrent tools mutate a shared unguarded dictionary or a common `.tmp` context file.

CPU-heavy simulation must not block the WebSocket/SSE event loop. Use bounded worker execution with admission control. Cancellation invalidates the run immediately; a running CPU task may finish, but its result cannot become an accepted plan or overwrite a newer run. Bound pending queues to avoid unlimited simulation jobs.

## Run lifecycle and fallback

Feature flag example: `PULP_REVIEWED_PLANNING_ENABLED=false` by default until tests and live smoke checks pass. Model names, prompt versions, time budgets and API settings stay in server configuration. Verify model access with a generic request before using financial context. A configured credential is not proof of a working model.

If ADK/provider initialization fails, existing chat/manual controls remain usable. If a run fails after a baseline is computed, return verified baseline evidence with incomplete status where possible. Do not label a single-agent fallback as a three-agent review. Never retry indefinitely or substitute different model families without recording the change.

## Acceptance transaction

On explicit acceptance: lock the account's planning/context state, reread versions, validate the run and all approval receipts, check an existing idempotency receipt, then write the accepted snapshot and receipt atomically. Either both persist or neither does. Separate file writes without crash recovery are not an atomic transaction; use a single journal/document or a transactional store when implementation requires multiple records.

The existing context manager supports Redis/Upstash with a local file fallback. Its read/modify/write flow is not an atomic compare-and-set transaction. Keep one worker for the local file-backed prototype. Before multi-worker/public deployment, add authentication, account authorization, durable run/idempotency storage, transactional persistence, and scoped event access. Those are deployment prerequisites, not optional agent prompt instructions.
