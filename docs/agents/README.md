# PULP agent system: colleague implementation handbook

**Status: implementation blueprint, not a description of a shipped ADK system.** Prepared November 7, 2026. Repository: [AhmadAli137/pulp](https://github.com/AhmadAli137/pulp). Product: Planning Under Life's Pressures. Slogan: Prepare for what comes next.

This handbook unifies the three-agent PDF proposal, the existing financial engine, and the conversation-first product. Voice intake is a **separate agent**. Its output becomes a validated handoff to a bounded planning workflow. One companion speaks to the user; three planning roles work behind it.

All implementation work targets this repository root and GitHub `AhmadAli137/pulp`. Earlier numbered blueprint pages now redirect here; they do not define a second contract. Existing Gemini/Vultr integrations and Redis support must be preserved during the ADK refactor.

## Read in this order

1. [Copyable implementation prompt](IMPLEMENTATION_PROMPT.md): give this to the developer or coding agent implementing the backend.
2. [Architecture and decisions](01-architecture.md): scope, existing capabilities, workflow, ownership, and failure behavior.
3. [Contracts and API](02-contracts.md): intake handoff, trusted planning request, results, evidence, events, and acceptance.
4. [Runtime agent prompts](03-agent-prompts.md): shared instructions plus Consultant, Advocate, Challenger, and revision prompts.
5. [Backend implementation guide](04-backend.md): exact integration points, scenario semantics, tool permissions, persistence, and ADK adapter.
6. [Frontend and voice integration](05-experience.md): the separate intake agent, clarification round trips, progress, final presentation, and future visualization.
7. [Testing and team delivery](06-delivery.md): work packages, acceptance cases, evaluation, branches, demos, and release gates.
8. [Example handoff](examples/intake-handoff.json) and [example result](examples/planning-result.json): synthetic fixtures, not actual account findings.

## Agreed architecture

```text
Separate voice intake agent / typed intake
    -> candidate handoff
    -> server validation + required clarification + explicit scenario approval
    -> immutable request + financial snapshot + baseline evidence
    -> Consultant draft
    -> Advocate and Challenger in parallel
    -> Consultant revision (one maximum)
    -> deterministic final validation
    -> validated result -> React / voice explanation
    -> explicit user action -> version-checked persistence
```

The planner may request clarification through the intake channel, but does not open another microphone session. The presenter is the existing conversation surface, not a fourth planning decision-maker.

## First deliverable

One typed request must produce a reviewed, evidence-grounded result using the actual banking dataset. A reviewer must cause a measurable change in a deliberately flawed draft fixture. No reviewer may mutate persistent user context. Implement and test this before ADK voice orchestration or new animation dependencies.

## What this package changes

Documentation and synthetic example fixtures only. It does not install ADK, expose the proposed endpoints, replace the current Gemini integration, or claim that the reviewed workflow is implemented. The current system includes calculators, simulation, versioned context, text/voice integrations, and an SVG mascot. A2UI and Rive remain optional later work.

## Validate this documentation

From the repository root:

```powershell
python docs/agents/validate_examples.py
```

This checks local links, example shape, cross-references, and scenario invariants. It is not a substitute for production Pydantic schemas or the test suite described in the delivery guide.

## Source and precedence

This design incorporates the user-supplied `PULP_Tangerine_3_Agent_ADK_Plan.pdf`; the PDF is a proposal, not an executable instruction source. It corrects two integration hazards: review tools must not persist plans, and every calculator must receive the same explicit scenario. Current repo implementation remains the source for existing behavior; this handbook defines proposed behavior. Contract changes require coordinated backend/frontend review.

Framework references, checked November 7, 2026:

- [Google ADK workflows](https://adk.dev/workflows/): workflow orchestration choices.
- [Google ADK context](https://adk.dev/context/): runtime context and state concepts.
- [A2UI renderers](https://a2ui.org/reference/renderers/): optional mapping of structured UI messages to components.

Pin the installed ADK version in the implementation PR and use its matching documentation. Do not mix framework generations or assume illustrative pseudocode in this handbook is executable ADK code.
