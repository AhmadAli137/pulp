# Architecture and design decisions

## Product intent

PULP helps a speaker explore the finances of an anonymized banking account. It does not identify the real account holder or connect to a live bank. The experience begins with conversation and only reveals the visualization needed for the current question. Pulp remains the single visible companion.

The planning workflow is a constrained review process. There are three planning roles, not three competing conversations. The separate voice-intake agent is upstream and is not counted among those three roles. An orchestration function controls execution; it is not another autonomous financial agent.

## Existing versus proposed

| Area | Existing implementation | Proposed change |
|---|---|---|
| Intake | Gemini text context extraction; native voice can stage scenario values | Explicit separate intake agent and versioned handoff |
| Numbers | Official metrics/shocks, historical simulation, strategy scoring | Shared scenario and evidence contract |
| Context | Redis/Upstash or local JSON storage, proposal confirmation, context versions | Stable request snapshots and consent receipts |
| Planning | Single-agent responses and deterministic comparison | Consultant plus two independent reviews |
| Replanning | `replan()` computes and stores a snapshot | Pure calculation plus separate persistence |
| Voice | Native audio relay and proposal review | Intake-to-planner handoff, progress, validated result narration |
| UI | React home, SVG Pulp, detailed financial views | Review/diff cards and shared result renderer |
| Frameworks | `google-genai`; no ADK requirement installed | Pin ADK after compatibility spike; A2UI/Rive optional later |

## Workflow phases

1. **Candidate intake:** collect a bounded, relevant utterance summary and explicit scenario candidates. Do not infer amounts or durations from vague words.
2. **Clarification:** ask one question at a time for missing scenario values. The planner returns a typed clarification request and does not guess.
3. **Scenario approval:** show an editable scenario summary. The user approves this hypothetical calculation, not permanent memory.
4. **Snapshot:** server loads account metrics, immutable confirmed context, dataset version, approved scenario and assumptions. It generates a request ID and fingerprint.
5. **Baseline:** compute official shock results and deterministic projection. Precompute strategy candidates where bounded and useful. Optional bootstrap simulation produces separately labeled evidence.
6. **Draft:** Consultant proposes actions and selects evidence-backed claims.
7. **Review:** Advocate and Challenger receive the same snapshot and draft. They cannot see each other's review until revision. Their tools share a run-scoped evidence registry but write distinct review records.
8. **Revision:** Consultant returns a final candidate and a resolution for every finding. It may request a bounded recalculation. It cannot rewrite the original baseline.
9. **Validation:** code verifies references, units, scenario scope, allowed actions, budget constraints, and finding resolution. Blocking unresolved issues prevent acceptance.
10. **Presentation:** render a completed, incomplete, clarification-needed, or failed result truthfully. Only validated figures are exposed.
11. **Optional acceptance:** explicit user action persists a version-checked plan. Separate controls confirm any proposed personal-context changes.

## Routing

Use quick mode for greetings, navigation, clarification, explaining an existing result, and a simple read-only metric lookup. Use reviewed mode for new scenario comparisons, substantive goal changes, or a user request to review a plan. Code validates a proposed route; an LLM's route choice is not permission to mutate state.

Fast calculator previews may be shown during slider edits. They are labeled previews and are not promoted to reviewed plans. Debounce inputs; a full review starts after an explicit request. Material changes invalidate the old review.

## State machine

| State | Allowed next states | User-facing interpretation |
|---|---|---|
| received | awaiting_clarification, snapshotting, failed | Checking the request |
| awaiting_clarification | terminal for this run | One question needs an answer |
| snapshotting | calculating, failed | Reading the selected account |
| calculating | drafting, incomplete, failed | Computing the scenario |
| drafting | reviewing, incomplete, failed | Preparing a draft |
| reviewing | revising, incomplete, cancelled | Checking fit and stress cases |
| revising | validating, incomplete, cancelled | Incorporating review findings |
| validating | complete, incomplete, failed, stale | Checking the final result |
| complete | stale | Result ready for optional acceptance |
| incomplete/failed/cancelled/stale | terminal | Do not claim full approval |

A clarification response starts a new request with `supersedes_run_id`. Cancellation is idempotent. A client disconnect alone should not silently accept or restart anything. A restart in the initial in-memory prototype marks interrupted runs unavailable; it must not replay model calls automatically.

## Execution policy: initial engineering budgets

These are starting configuration limits, not measured performance promises:

- One Consultant draft, two parallel reviews, one Consultant revision.
- Maximum one schema-repair attempt per role, charged to the same run deadline.
- Maximum 12 tool requests per run; cached calls count toward the request budget but do not recompute.
- Maximum three alternate scenarios from the Challenger.
- Default 500 simulation paths; server maximum 2,000 for reviewed interactive runs; fixed seed.
- Initial wall-clock deadline 90 seconds, role timeout 25 seconds; child work uses the remaining global deadline.
- No retry of a persistent operation after an ambiguous result without querying its receipt.
- Emit a progress heartbeat while waiting, with no invented percentage or fake reasoning trace.

Measure these settings on actual models before release. Do not represent four logical role stages as four guaranteed model API requests: tool loops and repairs may cause more calls. Budget and log the actual count.

## Trust and consent

An intake agent's `source` or `approved` field is only a claim. Only server-issued receipt IDs attached to exact input hashes establish approval. Session/account selection supplies scope; `account_id` in a payload must match it. Until multi-user authentication exists, keep this prototype local. An account ID is not authorization.

Reviewed runs may write bounded operational records to a separate run store for polling and diagnostics. This is distinct from writing user preferences or accepted-plan history. Apply retention/deletion controls to run records; they can contain sensitive context. Do not expose transcripts or hidden reasoning in event streams.

## Why this design

The Advocate checks personal fit; the Challenger searches explicit failure conditions. Neither role verifies arithmetic by reasoning. Code does that. The final Consultant cannot erase a blocking issue by declaring it fixed: the server requires evidence or a clarification. Shared models can share blind spots; evaluate against a single-agent baseline rather than claiming independence guarantees.

## Framework boundary

ADK manages role execution, tool invocation, and events behind `PlannerAdapter`. Domain contracts must not import ADK types. Use one pinned framework version and a minimal compatibility test for structured outputs, tool calls, async cancellation, and parallel state isolation. Framework class names are an implementation decision; this guide specifies behavior. [ADK workflow reference](https://adk.dev/workflows/).

## Non-goals for the first milestone

Live bank aggregation; autonomous transfers; product sales; tax/benefit eligibility decisions; SQL/MCP migration; additional agents; full public deployment; automatic learning from user acceptance; AI-generated financial chart values. The adaptive loop means recomputing after confirmed context changes, not retraining a model.
