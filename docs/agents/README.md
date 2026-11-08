# Agent inventory and proposal status

**Current implementation, reconciled November 8, 2026.** Pulp has one shared conversation workflow, model-assisted roles and deterministic calculation components. It is not eight autonomous agents running on every turn. Adding a role is useful only when its distinct output improves a decision and can be tested.

## What runs today

| Role or component | Implementation | Actual responsibility |
|---|---|---|
| Feature Forge | `features.py`, `resilience_history.py` | Deterministic behavioral features and evidence-bearing flags |
| Archetype naming | `archetypes.py` | Code clusters/describes accounts; optional ADK model names groups and tentative descriptions |
| Pattern Hunter | `hunter.py` | Offline/batch research using statistical tools and evidence gates, with a deterministic fallback |
| Profile Narrator | `narrator.py` | Evidence-linked prose with caching/template fallback; returns the decision profile too |
| Decision profile | `decision_profile.py` | Code connects observed patterns and confirmed context to implications, questions and decision starting points |
| Companion/intake | `gemini_agent.py`, `intake.py` | Extracts proposed personal details, handles confirmation and selects questions |
| Director | `director.py` | Shared turn orchestration, tools, response/visual selection and grounding checks |
| Engine | `tangerine_metrics.py`, `scenario_engine.py` | Official arithmetic and reproducible projections |
| Strategist | `council.py` | Optional ADK proposals over the frozen scenario and confirmed context |
| Challenger | `council.py` | Optional ADK review of actual validated/scored candidates |
| Validator/ranker | `council.py` | Code clamps/re-scores candidates, attaches flags and ranks by the explicit objective |
| Presenter and trace | `Stage.tsx`, `Backstage.tsx`, voice relay | One speaking voice, optional figures, actual activity and handoffs |

Backend filenames above are under `backend/app/services/`; frontend files are under `frontend/src/pages/` or `frontend/src/components/stage/`. The UI persona list is an explanatory subset, not a count of independent model calls.

## Current turn and council

Typed SSE and Gemini Live's `conversation_turn` both use `director.stage_stream`. A proposal is not a saved fact until confirmation. The current confirmation/version mechanism is implemented; the blueprint's separate scenario approval receipt and action acceptance transaction are not.

The council order is grid -> Strategist -> code validation/re-scoring -> Challenger -> ranking. Strategist and Challenger are **not parallel** in the shipped workflow: the Challenger sees the proposed candidates after they have been evaluated. Missing model access falls back to code-driven behavior; it must not be described as a completed model review.

For setup, actual APIs, transport and active-plan persistence, read [architecture](../architecture.md), [product behavior](../product.md), [testing](../testing.md) and [limitations](../limitations.md).

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

Schema Scout's automatic dataset mapping is not implemented. Neither is the separate Consultant revision loop with an Advocate review, provenance registry and explicit plan-acceptance protocol described in the proposal. The existing Challenger and versioned plan should not be presented as satisfying those separate contracts.

Prioritize measurable gaps: data ingestion validation, evidence freshness, question quality, user-specific feasibility, authenticated context ownership and atomic persistence. Define input/output contracts and evaluate a new role against the existing workflow before adding it.

## Validate the historical examples

```sh
python docs/agents/validate_examples.py
```

This checks the preserved synthetic fixtures, local links and arithmetic. Passing it does not mean the proposed APIs exist. Current runtime verification is documented in [testing](../testing.md).
