# Current architecture

Reconciled with the implementation on November 8, 2026. For proposed future orchestration, see the separately labeled [agent blueprint package](agents/README.md).

## Runtime boundaries

| Layer | Main source | Responsibility |
|---|---|---|
| React workspace | `frontend/src/App.tsx`, `components/workspace.tsx`, `pages/Stage.tsx` | Shared navigation, conversation and supporting pages |
| Browser voice | `frontend/src/services/voice.ts` | Microphone/PCM audio, live transcripts, text within voice, mute and cleanup |
| Voice relay | `backend/app/api/voice.py` | Gemini Live socket and `conversation_turn` delegation |
| Conversation | `backend/app/services/director.py` | Shared turn, questions, memory handoffs, bounded tool use and optional storyboards |
| Extraction | `gemini_agent.py`, `intake.py` | Validated proposals, offline fallback, confirmations and question heuristics |
| Records | `data_store.py`, `features.py`, `resilience_history.py` | Mapped CSVs, behavioral signals, historical patterns and flags |
| Interpretation | `decision_profile.py`, `narrator.py`, `archetypes.py`, `hunter.py` | Evidence-linked questions, prose, clusters and research findings |
| Arithmetic | `tangerine_metrics.py`, `financial_profiles.py`, `scenario_engine.py` | Official formulas and reproducible scenario calculations |
| Planning | `council.py`, `life_actions.py` | Candidate generation, validation, review, ranking and conditional life-language actions |
| Persistence | `context_manager.py`, `planning_session.py`, `feedback_loop.py` | Context versions, active plan, snapshots and replanning |

Paths without a directory prefix in this table are under `backend/app/services/`.

## Shared conversation

```text
Typed message -> GET /api/agent/stage (SSE) ----------+
                                                    +-> director.stage_stream
Voice/text in live session -> Gemini Live tool ------+      |
                                                          +-> confirm pending context or ask
                                                          +-> extract proposed personal details
                                                          +-> Director tools / deterministic fallback
                                                          +-> conversation beats + optional figures
```

The public voice route is `WS /api/agent/voice/{account_id}`. The Live model delegates planning through `conversation_turn`; it does not own a second financial planning pipeline. Events include transcripts, audio, `pipeline_event`, context proposals, state changes and turn completion. Native Live is the only speaking voice on the active home page. Legacy browser-speech code is not the main experience.

`stage_stream` records shared history. Extraction can run without generating a second conversational answer. Questions are recorded as asked when presented, not merely when proposed internally. A repeated affirmative with no pending proposal continues from known context rather than producing an empty visual promise.

## From records to a question

The feature table uses explicit semantic column mappings. Transaction-derived features are built offline when raw transactions are available; serving the app does not require loading the large transaction file on each request. Stage 1 artifacts and caches are not live bank feeds.

`decision_profile.py` computes recent paired monthly net flow and its low point, then joins relevant observed patterns with confirmed context. Each observation has evidence, a source period, a possible life effect, a question and the decision it informs. Goal timing/budget gaps and relevant unanswered profile questions feed intake selection. `narrator.py` returns this profile alongside flags, archetypes and narrative. Its narrative cache signature includes flag evidence values.

The Director's `compare_purchase` tool checks a supplied positive cost against available input evidence and returns illustrative buy/keep-money effects. It does not establish affordability. Recurring comparisons require a monthly-cost indication. Personal-goal council tool calls ask for missing budget/date rather than silently substituting them. These guards are narrower than a complete provenance-based financial reasoning validator.

## Planning sequence

```text
Frozen metrics + scenario + confirmed context + decision profile
  -> deterministic grid, scored by the scenario engine
  -> optional Strategist proposals
  -> code clamps and re-scores those proposals
  -> optional Challenger reviews the actual scored candidate set
  -> flags, deterministic ranking and conditional life-language explanations
  -> version-checked publication of active_plan
```

Strategist and Challenger are sequential in this workflow, not an ADK `ParallelAgent`. The grid can run without either model. Confirmed spending limits constrain grid and model candidates. `needs_context` and `feasibility` distinguish missing personal-fit information from a modeled result. Numeric ranking alone does not mean a person can carry out an option.

`GET /api/agent/session/{account_id}` supplies the shared plan. Conversation and the planning route publish it; Goals and Roadmap consume it; the shock page can compare practical options against its current inputs. The former Explore UI is retired and redirects to the shock page; simulation APIs remain available. Confirming context reruns the same active scenario when one exists. Publication checks the context version; stale results are marked rather than silently treated as current.

## API map

| Surface | Routes |
|---|---|
| Status and account selection | `GET /api/health`, `GET /api/accounts/sample` |
| Recorded profile | `GET /api/customers/{id}`, `/history`, `/cohort`, `/insights` beneath that customer |
| Financial overview | `GET /api/customers/{id}/overview`, `GET /api/customers/{id}/briefing?period=daily` (or `weekly`) |
| Conversation and trace | `GET /api/agent/stage`, `GET /api/agent/personas`, `GET /api/agent/deck`, `WS /api/agent/voice/{id}` |
| Shared planning | `POST /api/agent/plan`, `GET /api/agent/session/{id}` |
| Calculation | `POST /api/shocks/calculate`, `POST /api/scenarios/simulate`, `GET /api/scenarios/branches/{id}` |
| Goals and roadmap | `POST /api/strategies/compare`, `GET /api/roadmap/{id}`, `POST /api/replan`, `GET /api/replan/{id}/diff` |
| Context | `GET/DELETE /api/context/{id}`, `POST /api/context/propose`, `/confirm`, `/edit` |
| Research | `GET /api/research/summary`, `/archetypes`, `/hunter`, `/features`, `/validation` |
| Retained supporting APIs | `POST /api/agent/chat`, `/api/agent/explain`, `GET /api/agent/run` |

Consult `/docs` and [`routes.py`](../backend/app/api/routes.py) for request schemas; the old handbook fixtures are not these API contracts.

## Persistence and hosting

The backend reads `.env` at the repository root. Context is stored as per-account JSON or through optional Redis REST support. Conversation history, proposals and active plans are separate from the immutable source records. The Docker service uses one worker and a context volume. Process-local locking is not a distributed transaction, and the public demo does not provide per-user account authorization. See [deployment](deployment.md) and [limitations](limitations.md).

`financial_overview.py` combines dated, validated `financial_position` constraints, confirmed goals (`saved_amount`, `saved_as_of`), historical account aggregates and the saved plan. Balance entry validation also applies to partial context updates. It never derives outstanding debt from original loan principal. Briefings filter the latest saved item timestamps by UTC calendar date; there is no background scheduler or transaction-feed polling.

`life_profile.py` supplies the evidence-linked financial story nested at `decision_profile.life_profile`. It is rebuilt from source monthly records, the loan row and confirmed context rather than cached as inferred memory. `loan_purpose` constraints require a loan ID matching the selected account and a nonblank bounded purpose. The narrator, council and Director profile tool share this interpretation; `PersonProfile` renders it and refreshes after context changes.
