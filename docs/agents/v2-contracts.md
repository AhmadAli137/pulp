# PULP v2 agent contracts

The rule stays: **agents interpret, code calculates.** Every number below is produced by Python; model roles choose,
phrase and propose. TypeScript shapes live in `frontend/src/services/api.ts` (section "v2 contracts").

## New agents

| Key | Name | Stage | Kind | Symbol | Analogy | Job |
|---|---|---|---|---|---|---|
| `persona_builder` | Persona Builder | 1 | ai | `id-card` | a biographer | Builds a realistic but fictional life for the account: occupation guess, household, story, goals (small/large, short/medium/long, importance), worries, first questions. |
| `shock_generator` | Shock Generator | 3 | ai | `storm` | a risk officer | Proposes shocks that fit this life (a client loss for a cash earner, a rate reset for a borrower). Numbers set by code from the account. |
| `life_planner` | Life Planner | 3 | code + ai | `route` | a route planner | Builds multi-step plans from real decisions (second job, move, delay a purchase, refinance, invest), scores them month by month against resilience and weighted goals. |

Existing agents get `stage`, `symbol` and `analogy` in `/api/agent/personas`:
schema scout (1, `map`, a surveyor), feature forge (1, `anvil`, a lab), pattern hunter (1, `magnifier`, a detective),
archetype namer (1, `tags`, a librarian), profile narrator (1, `quill`, a storyteller), companion (2, `ear`, a note-taker),
director (2, `compass`, a show director), engine (0, `gear`, a calculator), strategist (3, `knight`, a chess player),
challenger (3, `shield`, a sceptic), validator and ranker (3, `scales`, a referee).

## Storage (per account context document, `context_manager.load_context`)

| Key | Shape | Written by |
|---|---|---|
| `persona` | `LifePersona` | Persona Builder (once, on first profile load) |
| `persona_trace` | `TraceEvent[]` (stage 1) | Persona Builder |
| `profile_log` | `ProfileChange[]` | every change: persona seed, companion auto-updates, user edits, undo |
| `deck` | `{cards: PersonalShock[], source, trace: TraceEvent[]}` | Shock Generator |
| `life_plans` | latest `LifePlanResult` (includes `trace`) | Life Planner |
| goals / concerns / constraints / ... | unchanged lists; goal values gain `size`, `horizon`, `importance`, `weight` | persona seed and conversation |

Agents update the profile **directly** (no confirmation step). Each change is logged with the agent, reason, before
and after, and can be undone (`POST /api/profile/{id}/undo/{change_id}`). Saying "no, that's wrong" right after an
update undoes it.

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/profile/{id}` | `ProfileDoc`; builds and seeds the persona on first call |
| POST | `/api/profile/{id}/undo/{change_id}` | `ProfileDoc` |
| GET | `/api/agent/deck?account_id=` | `{account_id, cards: PersonalShock[], source}`; without `account_id`, the generic deck |
| POST | `/api/agent/life-plans` | `LifePlanResult` |
| GET | `/api/agent/personas` | registry with `stage`, `symbol`, `analogy` |
| GET | `/api/agents/trace/{id}` | `AgentTrace` (stage 1 distillation, stage 2 updates, stage 3 planning) |
| GET | `/api/report/stage1?account_id=` | `Stage1Report` (plain-language and technical) |

## Stream events on `/api/agent/stage` (voice: `pipeline_event` with the same `event` name)

Existing: `agent`, `handoff`, `memory`, `storyboard`, `done`, `error`. New:

- `profile` → `StageProfileEvent` whenever an agent changed the profile this turn (`spoken` is the sentence Pulp says about it).
- `lifeplans` → `LifePlanResult` whenever Stage 3 ran (twist cards, a shock mentioned in conversation, a decision question).
- `trace` → `TraceEvent` for each observable agent step (feeds the workflow column and the Agents page).

Stage 3 runs automatically when the conversation mentions a current or future shock ("I might lose my job", "rent is
going up 200", "the car broke down") or a big decision ("should I take a second job", "we are thinking of moving").

## Objective (Life Planner)

```
score = w_res x resilience + w_goal x sum_i(goal_weight_i x progress_i) - w_dis x disruption
resilience = 0.6 x min(1, months_covered / shock_duration) + 0.4 x min(1, end_cash / (6 x S))
progress_i = min(1, saved_for_goal_i at its deadline / target_i)
goal_weight_i = importance_i x urgency(horizon_i) / sum ; urgency: short 1.0, medium 0.75, long 0.5
disruption = sum of each step's disruption cost (second job 0.25, move 0.3, cut spending 0.15 per 10% of S, ...)
weights default 0.5 / 0.4 / 0.1, shifted by stated preferences (safety vs speed) and worries
```

Plans on the Pareto frontier of (resilience, goal score) are marked `pareto: true`.
