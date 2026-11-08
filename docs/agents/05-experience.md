# Voice, frontend, and visualization blueprint

## Ownership boundaries

The **voice-intake agent** listens, transcribes, clarifies, and stages structured input. The **planning workflow** evaluates an approved scenario. The **presentation surface** renders and explains a validated result. The same Gemini voice session may provide intake and later presentation, but its tool permissions and instructions must switch explicitly; it must not silently become the planning authority.

No raw audio is sent to the planning workflow or written to disk. Keep transient transcript fragments out of long-lived planning snapshots. Preserve only necessary source references and approved context according to the application's retention controls.

## Intake behavior

1. Bind the selected account on the server before voice begins. The anonymized record does not prove the speaker's identity.
2. Let the user explain the concern without displaying a long financial form up front.
3. Extract candidate values with source-turn references. Preserve corrections: "Actually, make that two months" supersedes the previous candidate, not the confirmed scenario in a running plan.
4. Ask one material question at a time. Do not ask about a goal budget if the immediate request is only an income-shock calculation and that budget is unnecessary.
5. Display a small editable scenario card showing income retained, bill change, one-off expense, start, duration, and horizon.
6. The user selects **Review this scenario**. This creates the server-issued scenario approval receipt and starts planning. A vague spoken acknowledgment is not enough for v1.
7. If planning discovers a missing essential constraint, return a targeted question to intake. The reply creates an updated candidate and a new reviewed run after any changed scenario is approved.

Keep "Remember this about me" separate from "Use this in a hypothetical scenario." A transcript can contain a hypothetical example, a concern, and an instruction simultaneously; classification must preserve those distinctions. Store proposed personal details only through the existing explicit confirmation flow.

## Example conversation

These are illustrative messages, not real account results:

```text
User: What if my income falls to 70% for three months and I need a repair?
Pip: How much should we allow for the repair?
User: Nine hundred dollars.
Pip: Should the income change start this month?
User: Yes. Show me the next six months.
UI: Editable scenario summary -> Review this scenario
UI: Preparing your plan -> Checking your priorities and stress cases
UI: Final result with calculator-backed figures and a review-change card
Pip: The review changed one recommendation because of your confirmed priority.
     Here is the revised plan and the condition that would make us revisit it.
```

Do not narrate exact numeric results until the result validator has supplied them. If the provider cannot guarantee grounded streamed audio, use a prepared validated summary for the financial explanation. A live session can continue taking questions after playback.

## React integration

Existing entry points: `frontend/src/pages/AgentHome.tsx`, `frontend/src/pages/ShockLab.tsx`, `frontend/src/services/voice.ts`, and `frontend/src/components/PulpMascot.tsx`. Add focused components rather than continuing to expand the monolithic screens.

Suggested components:

| Component | Input / behavior |
|---|---|
| `IntakeScenarioCard` | Candidate fields, provenance labels, errors; explicit approval |
| `PlanningProgress` | Actual run events; cancel action; no invented completion percentages |
| `ReviewedPlanCard` | Validated result; concise outcome and actions |
| `ReviewChanges` | Server-generated draft/final diff; optional reviewer details |
| `EvidenceDrawer` | Evidence IDs, assumptions, scenario and source math |
| `ClarificationCard` | One required question with affected field |
| `PlanAcceptance` | Enabled only when result eligibility and versions are current |
| `PlanningVisual` | Allowlisted component with validated data references |

Initial state shape: active account, candidate ID/version, approval receipt, active run ID, last event sequence, run status, result, and pending clarification. Keep session secrets out of browser storage. Session storage may hold non-sensitive UI navigation state, not the trusted scenario receipt authority.

On account change: stop voice, cancel or detach the current run explicitly, clear visible context/results, and ignore late events from the previous account/run. On input edit: mark the old result superseded immediately; do not leave its acceptance button enabled while a replacement is calculating. On reconnect: replay events by sequence and fetch the final result; do not start another run automatically.

## Progress and copy

Use concise, user-oriented statuses: "Calculating your scenario," "Checking your priorities," "Testing what could change," and "Updating the plan." Detailed role names and evidence are available in an expandable review section. Do not expose prompt names, token counts, or internal workflow nodes in the primary flow.

Incomplete result: "The calculation is ready, but one review could not finish. You can explore the numbers or retry the review." Stale result: "Your inputs changed. Review the updated scenario before using this plan." Missing context: ask the specific question; avoid generic "tell me more" loops.

Every metric needs a label, CAD/month unit where relevant, and scenario context. Display observed metrics as historical observations. A recommended change is proposed, not executed. Confirming a plan does not move money or enroll the user in benefits.

## Visual storytelling, phase one

Use existing React chart capabilities and local SVG/CSS first. Render one useful visual next to the response rather than reopening a dashboard.

1. **Runway card:** official metric, assumptions, no-shortfall/capped indicator, source-math link.
2. **Monthly balance timeline:** deterministic balance points, shock window, one-off expense marker, negative balances, and immediate funding gaps.
3. **Alternatives comparison:** same scale and horizon, explicit changed variables, distinguish baseline from challenge cases.
4. **Review-change card:** proposed action before/after and the evidence-backed reason.
5. **Contingency card:** trigger condition, source evidence, and a proposed next step.

Pip's juice cup can echo the savings buffer, but it cannot replace the labeled chart or conceal negative balances. Define a fixed comparison scale, represent depletion explicitly, and show the numerical amount alongside it. Do not animate financial success merely because a model reply completed. Thinking/listening animations reflect interaction state, not inferred emotion or a financial verdict.

## Future A2UI and Rive

The result should carry neutral visualization descriptors such as `{kind, evidence_ids, title}`. The initial renderer maps them to an allowlisted React component. A later A2UI adapter can emit approved components from the same descriptors. Never accept arbitrary JSX, HTML, scripts, CSS, or network destinations from the model.

Rive can later map validated interaction states and numeric display values to Pip animations. Keep the semantic content in accessible HTML and supply a static reduced-motion alternative. Remotion recaps are a later export feature, not part of the calculation/review path.

## Accessibility and resilient interaction

- Keyboard-accessible scenario editing, approval, cancellation, and evidence controls.
- Announce stage changes politely; do not announce every streamed token.
- Restore focus after review and confirmation dialogs.
- Text remains available if microphone access fails or voice disconnects.
- Pair color with labels/icons; chart information has a textual equivalent.
- Reduced-motion preferences disable decorative movement without hiding results.
- Avoid autoplaying a spoken result over an active user utterance. Cancel narration when the user interrupts, changes account, or changes scenario.
- A voice error must not lose the current approved scenario or prevent manual planning.

## Integration handoff

The frontend owner can build against the example JSON while backend work proceeds. Mock adapters must be visibly labeled in development and excluded from live-demo claims. Once the API exists, run the exact same journeys against the real local service with disposable context. Do not implement different math or acceptance rules in frontend mocks.
