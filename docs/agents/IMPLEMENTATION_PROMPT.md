# Copyable implementation prompt: post-intake agentic planning

Paste the following into the implementing coding agent. It is a development task prompt; runtime role prompts are in [03-agent-prompts.md](03-agent-prompts.md).

---

You are implementing the PULP post-intake planning system in the existing `AhmadAli137/pulp` repository. Read `docs/agents/README.md` and its linked blueprints first. Inspect the actual code and tests before editing. Preserve the working FastAPI + React application and financial calculation contracts.

## Objective

Build a bounded Google ADK planning workflow that starts AFTER a separate voice-intake agent or typed intake has produced a candidate handoff. Do not merge voice intake into the planning Consultant. The user should experience one calm companion, supported by three distinct planning roles:

1. Financial Consultant: assemble a first plan from trusted calculator results.
2. Customer Advocate: identify conflicts with confirmed goals, essential spending, constraints, and preferences.
3. Scenario Challenger: test explicit alternate conditions and identify failure cases or contingency triggers.

The Consultant receives both independent reviews and revises the plan once. Deterministic server code validates the final result before presentation. Reviewers must be capable of causing a substantive change. An incomplete review must never be presented as completed approval.

## Required boundaries

- Voice intake owns audio interaction, transcript corrections, extraction, and targeted clarification. Planning consumes structured data, not raw audio.
- Intake output is untrusted candidate data. The server binds the account, loads actual financial records and confirmed context, verifies provenance, and issues the trusted PlanningRequest.
- The user explicitly approves hypothetical scenario assumptions before a reviewed run. Approval to model a scenario is distinct from permission to save personal context or accept a plan.
- All financial arithmetic comes from existing Python services or tested extensions. Agents choose actions, inspect evidence, and explain trade-offs; they do not invent or independently calculate financial results.
- Use one canonical scenario across the official calculator, deterministic projection, Monte Carlo simulator, strategy comparison, and roadmap. Never silently replace it with existing default stress presets.
- Preserve CAD units, official runway semantics, and explicitly separate shock duration from total projection horizon.
- Reviews are side-effect-free. Do not expose `context_manager.confirm`, `direct_edit`, `save_context`, `add_snapshot`, or persistent `feedback_loop.replan` as model tools.
- Bind account and request scope in server closures. Never let an agent choose an account ID, file path, SQL expression, URL, or arbitrary Python function to execute.
- Keep context and proposed plan acceptance versioned, idempotent, and explicit. Never infer permission from tone, an ambiguous spoken "yes," or a previous unrelated confirmation.
- Use a fixed workflow, not an unrestricted debate. Set timeouts, tool budgets, alternative-scenario limits, and cancellation behavior.

## Required implementation sequence

1. Define strict Pydantic contracts for IntakeHandoff, PlanningRequest, EvidenceRecord, DraftPlan, ReviewFinding, AgentReview, PlanningResult, and progress events. Reject unknown keys, non-finite numbers, boolean-as-number inputs, invalid time windows, and unknown evidence references. Share generated examples with the frontend owner.
2. Create an immutable, versioned planning snapshot and a common scenario adapter. Refactor strategy comparison/roadmap to consume that snapshot. Preserve legacy endpoint behavior through explicit adapters.
3. Separate pure evaluation from persistent snapshot creation. Add evidence IDs, units, scenario IDs, input fingerprints, and engine versions to calculator outputs.
4. Implement narrow, read-only wrappers for the Consultant and reviewers. Add tool-call allowlists, typed input validation, per-run cache keys, and budgets.
5. Prove the workflow with deterministic fake agents before making live model calls. Then integrate a pinned Google ADK version behind an adapter and feature flag.
6. Implement `POST /api/agent/plan` and run/status/event APIs specified in the contract guide. Keep existing chat and manual planning usable. Do not expose framework names as the product's public API.
7. Wire the existing text/voice surface to the same planning request/result. A clarification pauses planning, returns through intake, and creates a new versioned request after the user responds.
8. Return evidence-backed final claims, review resolutions, a draft-to-final diff, a concise spoken summary, and allowlisted visualization references. Do not return model-generated executable UI or raw hidden reasoning.
9. Implement explicit acceptance as a separate server operation, with stale-version rejection, idempotency, and revalidation. Review agents have no access to that operation.
10. Test scenario parity, consent boundaries, reviewer-driven revision, failure handling, account isolation, and text/voice convergence. Run existing relevant financial and browser tests. Document what was tested with mocks versus live credentials.

## Scope control

Do not rebuild CSV ingestion, replace the financial engine, add a database solely for this prototype, or add additional autonomous roles. A2UI, Rive, and narrated video are later presentation work, not dependencies for the first reviewed plan. Do not label simulated shortfall frequencies as real-world forecasts. Do not claim benefit eligibility or spending flexibility from anonymized bank records.

## Completion criteria

A typed intake produces a validated reviewed plan from the real dataset. The same approved handoff is usable by voice. A seeded bad draft is corrected for a specific confirmed constraint. Every displayed financial figure resolves to calculator evidence. Declining a proposal leaves personal context unchanged. Timeouts preserve a truthful incomplete status. Existing manual controls and official calculator tests still work.

Deliver coherent commits on a feature branch, a concrete API contract, migration notes, regression results, and a short demo script. List remaining limitations plainly. Never include credentials, raw audio, runtime user context, or source CSVs in Git. Coordinate contract changes with the frontend owner rather than silently renaming fields.

---
