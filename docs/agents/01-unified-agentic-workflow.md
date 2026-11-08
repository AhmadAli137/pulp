# 01. Unified agentic workflow

This merges the two plans that existed separately: the **companion / intake** flow already running in
`gemini_agent.py` (voice or text, extraction, confirmation, replanning) and the **three-agent ADK council**
from the architecture one-pager (Financial Consultant, Customer Advocate, Scenario Challenger). They are two
stages of one pipeline with one shared snapshot and one memory.

```
                 STAGE A: INTAKE (voice agent "Pip")                         STAGE B: PLANNING COUNCIL (ADK)
 ┌──────────────────────────────────────────────────────┐    ┌─────────────────────────────────────────────────────┐
 │ account_id ─▶ greet ─▶ adaptive questions (≤6)       │    │ PlanningSnapshot (Python, computed once)             │
 │   ▲            │  extraction (Gemini/Vultr/offline)   │    │   ├─▶ 1. Financial Consultant  → draft plan          │
 │   │            ▼                                      │    │   ├─▶ 2. Customer Advocate     → fit review  ┐ parallel
 │ follow-up   proposals ─▶ USER CONFIRMS ─▶ context v+1 │    │   ├─▶ 3. Scenario Challenger   → stress review┘       │
 │                │                                      │    │   └─▶ 4. Consultant revises once → CouncilResult      │
 │                ▼                                      │    └─────────────────────────────────────────────────────┘
 │      IntakeHandoff ───────────────────────────────────┼───────────────▶ POST /api/council/plan                      │
 └──────────────────────────────────────────────────────┘                        │
                                                                                  ▼
                                      RESPONSE: revised plan + evidence + "what changed" ─▶ UI panel + Pip reads the summary aloud
```

## Stage A: Intake (exists; to be upgraded)

Purpose: learn what the bank data cannot see and store it with consent. Today this is
`backend/app/services/gemini_agent.py` (`chat`, `next_question`, `offline_extract`, `AgentExtraction`),
`context_manager.py` (proposals, `confirm`, versions) and `feedback_loop.py` (`replan`, diff). The UI is
`frontend/src/pages/Home.tsx` (chat box, mic via `useSpeech`, inline proposals) and `Companion.tsx`.

What it must produce at the end of a session: an **IntakeHandoff** (see 04-contracts.md):

- confirmed context (`context_manager.summarize(...)` at the new version),
- a **suggested shock** derived from stated concerns (income_loss → r=0.55, T=6; rising_costs → h=0.15; unexpected_expense → C),
- the customer's **priority** (safety vs speed), their **capacity** statement (`can_free_up_per_month`), and
- **open questions** the intake could not resolve (so the council does not guess).

Rules carried over unchanged: at most one question per turn, question choice by the heuristic
`relevance − burden − repetition`, proposals need an explicit confirm, replan after every confirm, offline
extractor as the floor.

## Stage B: Planning council (new; ADK)

Purpose: turn the confirmed context plus a shock into a plan that has been **reviewed from two angles**
before the customer sees it. Three `LlmAgent`s with distinct jobs, running on one shared snapshot:

| Agent | Job | Python it may call (thin wrappers) | Returns (schema) |
|---|---|---|---|
| Financial Consultant (orchestrator) | Build the first plan from the official numbers; revise once after review | `get_snapshot`, `run_shock`, `compare_strategies`, `build_roadmap` | `DraftPlan` → `FinalPlan` |
| Customer Advocate | Check the draft against what the customer actually said: constraints, goals, risk preference, affordability | `get_context`, `compare_strategies`, `check_constraints` (deterministic) | `AdvocateReview` (conflicts, acceptable trade-offs, one question) |
| Scenario Challenger | Find assumptions that break the plan: alternate shocks, horizon sensitivity, tipping point, Monte Carlo | `simulate`, `tipping_point`, `alternate_shocks` (deterministic evidence pack) | `ChallengerReview` (failure cases, evidence, requested revisions) |

Orchestration: `SequentialAgent([consultant_draft, ParallelAgent([advocate, challenger]), consultant_revise])`.
One revision round, hard timeout 45 s, then the deterministic fallback (section "Degradation").

## The shared snapshot

Both stages read from one Python-built object so that no agent can disagree about a number:

```
PlanningSnapshot = {
  metrics:        financial_profiles.get_metrics(account_id).to_dict()  (minus history)
  shock_report:   tangerine_metrics.full_shock_report(m, r, h, one_off, T)
  context:        context_manager.summarize(load_context(account_id))
  comparison:     strategy_optimizer.compare_strategies(m, ctx)
  roadmap:        roadmap.build_roadmap(m, ctx, comparison)
  cohort:         cohort_analysis.cohort_for(account_id)        (optional, for "similar customers" evidence)
}
```

It is computed in `backend/app/agents/snapshot.py` once per request and injected into every agent's
instruction as JSON. Agents may call tools for *additional* evidence (alternate shocks, simulations) but never
recompute what the snapshot already holds.

## Handoff between stages

```
Intake confirm  ──▶ context_manager.confirm(...)  ──▶ feedback_loop.replan(...)  ──▶ IntakeHandoff
                                                                                     │
UI (Home.tsx) ── "Review my plan" ─────────────────────────────────────────────────▶ POST /api/council/plan {account_id, shock, handoff_id?}
                                                                                     │
                                                                           CouncilResult ──▶ Goals.tsx "Council review" panel
                                                                                     └──▶ Pip speaks council.summary_spoken (≤ 60 words)
```

The intake never calls the council directly; the user triggers the review (button, or the voice phrase "review
my plan"). That keeps consent explicit and keeps Stage A fast.

## API surface (final)

| Method | Path | Stage | Notes |
|---|---|---|---|
| POST | /api/agent/chat | A | exists; returns proposals, next question, mode |
| POST | /api/context/confirm | A | exists; applies, replans, returns diff |
| GET | /api/context/{id}/handoff | A | **new**: builds `IntakeHandoff` from confirmed context |
| POST | /api/council/plan | B | **new**: runs the council; always returns a `CouncilResult`, `mode` ∈ adk \| fallback |
| GET | /api/council/{id}/last | B | **new**: last result for the account (stored in context doc under `council_results`) |

`/api/agent/adk-chat` from the one-pager is folded into `/api/council/plan`; chat stays single-agent.

## Ownership

| Area | Owner | Files |
|---|---|---|
| Intake voice agent (Stage A) | Ahmad | `gemini_agent.py`, `Home.tsx`, `useSpeech.ts`, `api/voice.py` (optional Gemini Live), new `intake.py` |
| Planning council (Stage B) | colleague | new `backend/app/agents/*`, `api/council.py`, `Goals.tsx` panel |
| Contracts and tests | both | `04-contracts.md`, `backend/tests/test_council.py`, `test_intake.py` |

## Non-negotiables

1. Python calculates, LLMs explain. Tool wrappers return numbers; agent schemas carry text and references to those numbers, never new numbers.
2. Confirm before storing. The council may *recommend* a context change (for example "ask whether the $300/month is realistic") but may not write it.
3. Scenario, not forecast. Every simulated probability carries the disclaimer string from `scenario_engine.simulate`.
4. Degrade, never block. Both endpoints have a deterministic path and a time budget.
5. Anonymized account; no identity claims.

## Degradation ladder

| Condition | Stage A behaviour | Stage B behaviour |
|---|---|---|
| No AI key | `offline_extract` + templated reply (exists) | `fallback_council()` in Python: consultant = `full_shock_report` + `compare_strategies`; advocate = `check_constraints`; challenger = `alternate_shocks` + `tipping_point`; `mode="fallback"` |
| AI slow (> budget) | per-call timeouts already in `gemini_turn` / `vultr_turn`; falls back to offline | 45 s total budget; partial reviews are kept, missing ones replaced by the deterministic versions, `mode="partial"` |
| Model returns invalid JSON | retry once, then offline extraction (exists) | retry once per agent, then that agent's deterministic version |
| Unknown account | 404 with hint (exists) | 404 before any agent runs |

## Rollout order (fits the remaining hackathon time)

1. Contracts + snapshot builder + deterministic fallback council (no ADK yet). Endpoint returns `mode="fallback"`. UI panel renders it. **Judge-safe from this point.**
2. ADK consultant only (draft + revise with no reviews). Verify parity: every number in its text exists in the snapshot.
3. Advocate and challenger in parallel; one revision.
4. Intake handoff endpoint, "Review my plan" button and voice trigger, Pip speaks the summary.
5. Tests from 05, demo rehearsal.
