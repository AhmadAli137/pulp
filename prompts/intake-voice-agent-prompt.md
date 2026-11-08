# Prompt: upgrade Pip, the PULP intake voice agent (Stage A)

Copy everything below the line into your coding agent, in the PULP repo root.

---

You are working in the PULP repository (FastAPI backend in `backend/`, React frontend in `frontend/`). Read, in
order: `docs/agents/README.md`, `docs/agents/01-unified-agentic-workflow.md`, `docs/agents/02-intake-voice-agent-blueprint.md`,
`docs/agents/04-contracts.md`, `docs/agents/05-testing-and-acceptance.md`. Then read what exists and must be reused:
`backend/app/services/gemini_agent.py` (`chat`, `gemini_turn`, `offline_extract`, `QUESTION_BANK`, `next_question`,
`AgentExtraction`), `vultr_inference.py`, `context_manager.py`, `feedback_loop.py`, `frontend/src/pages/Home.tsx`,
`frontend/src/hooks/useSpeech.ts`, and the optional Gemini native-audio relay in `backend/app/api/voice.py`,
`frontend/src/voice.js`, `frontend/public/pcm-worklet.js`.

Upgrade **Stage A: the intake voice agent** so that a judge can speak three sentences and end with a confirmed
context and a ready handoff to the planning council. Implement exactly what `02-intake-voice-agent-blueprint.md`
specifies:

1. `backend/app/services/intake.py`: `REQUIRED_SLOTS`, `slot_status(summary)`, `is_complete(summary)`, `suggested_shock(summary)` (income_loss → r 0.55 T 6; rising_costs or rent_increase → h 0.15; unexpected_expense with an amount → C; combinations allowed), `build_handoff(account_id)` returning the `IntakeHandoff` from `04-contracts.md` with pending proposals excluded.
2. Extend `AgentExtraction` with optional `suggested_shock` and `intake_complete`; keep the server as the authority on completeness. Update the Gemini extraction prompt and the Vultr JSON schema path so both emit the new fields; the offline extractor sets `suggested_shock` from its concern patterns.
3. Add the `twist`, `replacement_months` and `review` questions to `QUESTION_BANK` with the relevance rules in the blueprint. Keep the one-question-per-turn and repetition rules.
4. `POST /api/agent/chat` response gains `intake: {complete, filled, missing, suggested_shock}`; add `GET /api/context/{account_id}/handoff`.
5. Frontend `Home.tsx`: progress chips for slots; "Review my plan" button when complete that calls `POST /api/council/plan` with the suggested shock (if the council endpoint does not exist yet, call `POST /api/shocks/calculate` with the suggested shock and show the verdict card, and leave a TODO); voice yes/no detection client-side for pending proposals (regex, never sent to the model); auto-speak replies when the last message was spoken; Pip reads `diff.reasons[0]` after each confirm.
6. Voice stack: keep browser speech as the default. Behind a "Live voice" toggle, wire the existing Gemini native-audio relay (`startVoice` in `voice.js`) and add a `propose_context_update` tool to `api/voice.py` that calls `context_manager.propose`; any socket error closes the session and falls back to browser speech with a visible notice. Document that websockets do not run on Vercel.
7. `backend/tests/test_intake.py` covering the intake rows of `05-testing-and-acceptance.md`, using `prefer_offline=True` so tests need no key. Keep the existing 50 tests green.

Constraints you must not break:

- Nothing enters memory without a confirm; the voice "yes" must map to `POST /api/context/confirm`, not to a direct edit.
- Every number Pip speaks comes from the calculator (`run_official_shock` tool, `offline_reply`, or the handoff), never from the model.
- At most one question per turn; never repeat a key in `asked_questions`; stop after six questions or when the user asks to see the plan.
- The person may be role-playing an anonymized account; never say the record is theirs.
- Offline mode must still complete the full intake (slots, handoff, suggested shock).

Work in this order and report after each step with what you implemented, what you tested, what passed and what remains: (a) `intake.py` + handoff endpoint + tests, (b) extraction and question bank changes on all three providers, (c) `Home.tsx` progress, voice yes/no, auto-speak and "Review my plan", (d) optional live-voice toggle only if (a) to (c) are green, (e) the two-minute manual test script from the blueprint on account 47788, recorded as a checklist in the final report. Do not stop after planning; implement and run the tests.
