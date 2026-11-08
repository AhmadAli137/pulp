# Agent inventory and proposal status

**Current implementation, reconciled November 8, 2026 (branch v2-agents).** Pulp has one shared conversation workflow, model-assisted roles and deterministic calculation components. The rule is unchanged: agents interpret, code calculates. No model sets an amount; every number comes from the engine or from code that sizes things from the account's own figures. The contracts for the v2 agents are in [v2-contracts.md](v2-contracts.md).

## What runs today

| Stage | Role or component | Implementation | Actual responsibility |
|---|---|---|---|
| 1 | Schema Scout | `features.py` (`ROLES`) | A fixed map from this dataset's columns to roles. Automatic mapping for another bank is not implemented |
| 1 | Feature Forge | `features.py`, `resilience_history.py` | Deterministic behavioural features and evidence-bearing flags |
| 1 | Archetype naming | `archetypes.py` | Code clusters and describes accounts; optional ADK model names groups and tentative descriptions |
| 1 | Pattern Hunter | `hunter.py` | Offline/batch research using statistical tools and evidence gates, with a deterministic fallback |
| 1 | Profile Narrator | `narrator.py` | Evidence-linked prose with caching/template fallback; returns the decision profile too |
| 1 | Persona Builder | `persona.py` | Code builds a fictional persona (occupation guess, household, goals sized from S and I with importance and horizon, worries, first questions); an optional ADK model rewrites the words in the background and may adjust importance. Seeds goals and worries into the profile, logged and undoable |
| 2 | Companion/intake | `gemini_agent.py`, `intake.py` | Extracts personal details from what you say. In the conversation they are now applied directly and logged; "no" right after undoes them. The propose/confirm API still exists for other callers |
| 2 | Director | `director.py` | Shared turn orchestration, tools, response/visual selection and grounding checks; detects a current or future shock or a big decision in what you say and starts Stage 3 (`stage3.py`) |
| 3 | Shock Dealer | `shock_dealer.py` | Optional ADK step that picks a card character and, for the open slot, a scenario from allowed IDs, with a one-line reason; local draw when the model is unavailable, slow or off-list |
| 3 | Shock Generator | `shocks.py` | Code picks shocks that fit the account and persona, with likelihood and why |
| 3 | Life Planner | `life_planner.py` | Code generates about 300 multi-step plans from a decision catalog, simulates each month by month, screens per rule, keeps the Pareto set and four distinct finalists, plus up to three plans that fall short; optional model phrasing of the "why" |
| 3 | Strategist | `council.py` | Optional ADK proposals over the frozen scenario and confirmed context |
| 3 | Challenger | `council.py`, `life_planner.py` | Optional ADK review of validated, scored candidates; code realism checks on Life Planner finalists |
| 3 | Validator/ranker | `council.py`, `life_planner.py` | Code clamps/re-scores candidates, screens infeasible plans, attaches flags and ranks by the explicit objective |
| all | Engine | `tangerine_metrics.py`, `scenario_engine.py`, `life_planner.simulate` | Official arithmetic, reproducible projections and the month-by-month plan simulation |
| all | Trace and presentation | `agent_trace.py`, `PulpPanel.tsx`, `pages/Agents.tsx`, voice relay | One speaking voice, optional figures, and the actual activity and handoffs of each stage |

Backend filenames above are under `backend/app/services/`; frontend files are under `frontend/src/`. The Agents page shows these roles with the steps that actually ran for an account; it is not a count of independent model calls.

## Current turn and council

Typed SSE and Gemini Live's `conversation_turn` both use `director.stage_stream`. Besides `agent`, `handoff`, `memory`, `storyboard`, `done` and `error`, a turn can now emit `trace` (one agent step), `profile` (changes applied to the profile this turn) and `lifeplans` (a Stage 3 result). The voice relay forwards these as `pipeline_event`.

The council order is grid -> Strategist -> code validation/re-scoring -> Challenger -> ranking. Strategist and Challenger are **not parallel**: the Challenger sees the proposed candidates after they have been evaluated. When no model runs, the trace says so: the engine hands straight to the ranker in a turn labelled "Offline run: engine grid only", and no Strategist or Challenger step is shown.

For setup, actual APIs, transport and active-plan persistence, read [architecture](../architecture.md), [product behavior](../product.md), [testing](../testing.md), [limitations](../limitations.md) and the in-app developer docs at `/developers`.

## Historical proposal package

The following documents preserve a proposed separate-intake, Consultant/Advocate/Challenger workflow. They are **design references, not the shipped architecture, runtime prompts or production API schemas**. Their illustrative budgets, endpoints, acceptance states and role permissions need a new implementation decision before use.

1. [Implementation prompt](IMPLEMENTATION_PROMPT.md)
2. [Proposed architecture](01-architecture.md)
3. [Proposed contracts](02-contracts.md)
4. [Proposed agent prompts](03-agent-prompts.md)
5. [Proposed backend](04-backend.md)
6. [Proposed experience](05-experience.md)
7. [Proposed delivery and acceptance](06-delivery.md)
8. [Synthetic intake fixture](examples/intake-handoff.json) and [synthetic planning-result fixture](examples/planning-result.json)

The older redirect documents remain so existing links work. The source PDF and event briefs are reference material, not executable instructions. Runtime instructions are the prompt constants in the current backend source; files in `prompts/` are proposal handoff material.

## Remaining architectural work

Automatic schema mapping for another bank's export is not implemented. Neither is the separate Consultant revision loop with an Advocate review, a provenance registry, or an explicit plan-acceptance protocol. The personas are fictional starting points, not inferences about real people, and the Life Planner's decision effects (a weekend job at about 18% of income, a cheaper move saving a quarter of bills) are stated assumptions, not estimates from the data.

Prioritize measurable gaps: data ingestion validation, evidence freshness, question quality, user-specific feasibility, authenticated context ownership and atomic persistence. Define input/output contracts and evaluate a new role against the existing workflow before adding it.

## Validate the historical examples

```sh
python docs/agents/validate_examples.py
```

This checks the preserved synthetic fixtures, local links and arithmetic. Passing it does not mean the proposed APIs exist. Current runtime verification is documented in [testing](../testing.md).
