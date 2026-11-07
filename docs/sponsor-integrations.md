# Sponsor integrations

Eligibility rules live on the event Devpost; nothing here claims eligibility for a prize. These are the
integrations as built.

## Tangerine (primary)

Real dataset integration (`monthly_summary.csv`, `loans.csv`, `accounts.csv`, `districts.csv`,
`standing_orders.csv`), official formulas with "show the math", live shocks with exact inputs, personalized
goal and backup plans, historical analysis (cash flow, liquidity, vulnerability), cohort comparison and a
reproducible population discovery.

## Gemini API

`backend/app/services/gemini_agent.py` uses `google-genai` with:
- a conversational turn that can call narrow backend tools (profile, history, context, official shock,
  simulate, compare strategies, propose context update, replanning diff) via automatic function calling;
- a second, temperature-0 extraction call with a Pydantic response schema producing validated proposals
  (goal, concern, constraint, preference, event), retried once and falling back to the offline extractor;
- a system prompt that forbids invented numbers, limits questions to one per turn, and states the
  anonymized-account rule.
Adaptive question selection is a stated heuristic shared by both engines. Set `GEMINI_API_KEY` in `.env`.
Verified live with `gemini-3.5-flash`: a turn takes about 12 seconds, calls the profile, context, strategy and official-shock
tools, and returns a validated proposal. Without a key, the app is fully functional in offline mode, which is what the automated tests use.

## Best Data Visualization & Storytelling

Fan chart with uncertainty bands and baseline comparison, branching paths, strategy comparison, replanning
before/after, the two-panel discovery chart, cohort histogram, and an accessible table view for every chart.
Every chart uses computed values.

## Voice (browser)

Microphone button, start/stop, live transcript, spoken replies via `speechSynthesis`, text fallback, and clear
error states for unsupported browsers or denied permission. ElevenLabs is not integrated. A separate
Gemini-native audio relay (`backend/app/api/voice.py`, `frontend/src/voice.js`, `public/pcm-worklet.js`) was
added to the repository by a parallel contributor and is not wired into the PULP UI or tests.

## Entire

Not used in this build.
