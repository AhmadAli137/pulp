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

## Vultr: hosting and Serverless Inference

Pip can run on **Vultr Serverless Inference** (OpenAI-compatible `https://api.vultrinference.com/v1`, default model
`deepseek-v4.1-flash-1017`, JSON-schema extraction validated by Pydantic). Set `VULTR_INFERENCE_API_KEY` (and
`AI_PROVIDER=vultr` to prefer it over Gemini). The backend injects the official numbers into the prompt so the model
quotes rather than computes; failures fall back to the offline engine. Tested with a mocked transport; a live key was
not available during the build.

### Hosting (with GoDaddy DNS)

The app ships as one Docker image (API + built frontend) behind Caddy, which issues HTTPS certificates for the
domain in `DOMAIN`. `deploy/vultr-setup.sh` bootstraps an Ubuntu Vultr instance; GoDaddy DNS points the domain at
it; `.github/workflows/deploy.yml` runs tests and redeploys over SSH on every push to `master`. Verified locally:
the image builds and serves the app and API with the data mounted. Details in `docs/deployment.md`. `pulp.ai`
and `pulp.app` are already registered; the domain is a setting.

## Entire

The repository was pushed once to `/et/sheridandatathon26/pulp` through the Entire CLI (kept as the `entire`
git remote); GitHub is the primary remote. Session tracking (`entire enable`) is not turned on.
