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

## Plan search and the four finalists (added after user feedback)

The Life Planner does not hand-pick a few plans. Each run:

1. **Generate** (Life Planner, code): combinations of 1 to 4 decisions from the catalog, each with timing variants
   (start now, start at the shock, start after it), typically 120 to 400 candidates. The Strategist (model) may add
   up to 6 candidates built from the profile; they go through the same pipeline.
2. **Simulate** (Engine): every candidate month by month under the shock.
3. **Screen** (Validator, code): remove infeasible or implausible candidates, counted per rule (conflicting decisions,
   second job for a household that already works two incomes, a move with no housing bill, spending cut beyond 25% of S,
   a goal delayed past its horizon, negative cash with no credit).
4. **Arbitrage** (Ranker, code): keep the Pareto set over (shortfall covered, resilience, weighted goals); dominated
   candidates are marked with the candidate that beats them.
5. **Finalists**: four plans that are each best on one axis plus one best trade-off by the weighted score:
   `best_shortfall`, `best_resilience`, `best_goals`, `best_tradeoff`. Finalists must differ: decision sets with
   Jaccard similarity >= 0.5 to an earlier finalist are skipped for the next best.
6. **Justify** (Challenger + Director): each step gets `reasoning` (the Stage 1 insight it rests on, its evidence and
   what it moves in the objective), and each finalist gets `versus` (why it beat the runners-up for its role).

`shortfall` component = 1 - min(1, shortfall_total / (duration x monthly gap at baseline)); higher is better.
`LifePlanResult.search` carries the counts, the screens, the rounds and up to 400 compact candidates for the
screening visual. `plans` holds the four finalists in role order; `recommended` is the `best_tradeoff` id.

## Demographic and location insights

`GET /api/insights/demographics/{id}` → `Demographics`: age band, household (owners, joint, card), the district
(salary, unemployment trend, urban ratio, entrepreneurs, crime per 1,000), insights the person would not have thought
of (each with plain and technical wording and a strength), and layoff survival by group. Built from `clients.csv`,
`dispositions.csv`, `districts.csv`, `cards.csv` and `accounts.csv`. Descriptive, not causal; small groups are flagged.

## Long-term plans and plan history

`POST /api/agent/life-plans` takes `mode`: `shock` (default; the shock starts in `shock_starts_in` months, default 3,
or 1 when the conversation says it already happened) or `long_term` (no shock, `horizon_months` default 60, the same
search over the same decisions, optimised mainly for goals and cushion). In long-term mode the four finalist roles are
`best_resilience`, `best_goals`, `least_disruption` ("Easiest to live with") and `best_tradeoff`, since there is no gap
to cover. Every run appends a `PlanHistoryEntry` to the context key `plan_history` (last 30) with the trigger, the
profile version, the goal weights at the time, the finalists, and `changed` (plain sentences on what moved since the
previous run of the same mode: a new finalist, a goal weight change, a score change). `GET /api/plans/history/{id}`
returns them newest first.

## Shock Dealer and the four face-down cards

`POST /api/agent/shock-dealer` `{account_id?, slot 1-4, exclude_character?, exclude_scenario?, use_ai, pool}` returns
`{slot, character {id, name, role}, card, reason, source, ms}`. Slots 1-3 keep the brief's official scenarios (layoff,
furnace, combined); slot 4 and the chat's Shuffle also pick the scenario (from the personal deck when one exists). The
model (Gemini on ADK) chooses IDs only from the allowed lists and never the excluded ones, with a one-line reason that may
not contain amounts; anything else, a slow model (9 s cap) or no key falls back to a local draw that prefers the
scenario's natural messenger (the Manager for a layoff, the Technician for the furnace). The Shocks page prefetches the
next deal so a reveal never waits on the model. `GET /api/agent/characters` lists the cast.

A card resolved on the Shocks page is carried into the conversation as `twist:<key>@<character>`, so Pulp explains the
same card. Twist storyboards carry `reply` (one or two sentences, from the model when available and grounded against the
engine's numbers, else a template), `reply_source` and `council_mode`. Offline council runs no longer emit an engine to
Strategist handoff: they emit `engine -> ranker` titled "Offline run: engine grid only" with `mode: "offline"`.
