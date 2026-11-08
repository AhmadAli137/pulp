# PULP agent layer: guides and blueprints

Read in this order.

| # | Document | Who it is for | What it settles |
|---|---|---|---|
| 1 | [01-unified-agentic-workflow.md](01-unified-agentic-workflow.md) | everyone | The one architecture: Stage A intake (voice) → handoff → Stage B planning council (three ADK agents) → response. Contracts, ownership, non-negotiables, rollout order. |
| 2 | [02-intake-voice-agent-blueprint.md](02-intake-voice-agent-blueprint.md) | whoever builds the voice intake (Ahmad) | State machine, slot schema, question policy, confirmation protocol, voice stack options, error handling, test script. |
| 3 | [03-planning-council-blueprint.md](03-planning-council-blueprint.md) | whoever builds the ADK council (colleague) | Directory layout, tool wrappers, full agent instructions, orchestration code, endpoint, UI panel, fallbacks, tests. |
| 4 | [04-contracts.md](04-contracts.md) | both | JSON contracts (`IntakeHandoff`, `PlanningSnapshot`, `CouncilResult`) with a worked example for account 47788. |
| 5 | [05-testing-and-acceptance.md](05-testing-and-acceptance.md) | both | Test matrix, acceptance criteria, demo rehearsal checklist. |

Prompts that hand this work to people:

- [prompts/colleague-planning-council-prompt.md](../../prompts/colleague-planning-council-prompt.md): give to the colleague building Stage B.
- [prompts/intake-voice-agent-prompt.md](../../prompts/intake-voice-agent-prompt.md): for the person building Stage A.

Ground rules that apply to every file here:

1. **LLMs explain; Python calculates.** Every dollar and month shown to a customer comes from `backend/app/services/*` and is passed to the model as data. A model never does arithmetic that reaches the screen.
2. **Nothing enters memory without confirmation.** Agents propose; `context_manager.confirm` is the only write path for life context, and the user clicks it.
3. **Degrade, never block.** If Gemini, Vultr or ADK is slow or down, the same endpoint returns the deterministic version of the answer with `mode` set accordingly. The judge flow must work with no AI service.
4. **Simulation is scenario output.** Monte Carlo probabilities are labelled as model output for a chosen scenario, never as the likelihood of a real event.
5. **Anonymized data, not identity.** The speaker may be role-playing an account. Never imply the record is theirs.
