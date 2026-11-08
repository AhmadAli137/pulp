# PULP

**Planning Under Life's Pressures. A considered financial life.**

[Live application](https://askpulp.com) ? [Documentation](docs/README.md) ? [Architecture](docs/architecture.md) ? [Run and deploy](docs/deployment.md)

Pulp is a conversation-first financial planning prototype. It connects anonymized banking records with the goals, constraints and priorities a person confirms, then helps them explore everyday choices, larger life decisions and financial setbacks. It does not move money or connect to a live bank account.

Voice and typed conversation share one workflow and one saved planning context. Visuals support a decision when useful or requested; they are not required for every answer. The rest of the workspace makes the evidence, assumptions and next steps available without turning every task into a chat.

## What is available

| Destination | Route | Purpose |
|---|---|---|
| Planning room | `/` | Talk or type; discuss small and big decisions; confirm personal details; open optional visuals and the agent flow |
| Your financial picture | `/twin` | Track reported assets and liabilities, actual goal savings, and historical spending allocation |
| Insights & evidence | `/insights` | Connect observed patterns to life implications, unanswered questions and research |
| Prepare for a setback | `/shock` | Enter a specific change in income, bills or upfront costs; review the official calculation and planning options |
| Compare possibilities | `/explore` | Change explicit assumptions and inspect simulated paths |
| Goals & choices | `/goals` | Review the saved goal, compare strategies and see what changed |
| Your next steps | `/roadmap` | Review suggested actions, trade-offs and assumptions by timeframe |
| Briefings & summaries | `/briefings` | Daily focus and seven-day review of saved updates, goals and next questions |
| Preferences & data | `/settings` | Accessibility, service status, saved-context controls and data limitations |

The profile interpretation layer explains **what the records show, why it may matter, what is unknown, and which decision it can inform**. It does not assume card spending is discretionary, a transfer is savings, or pension income means extra shifts are possible. Missing budgets, dates and spending flexibility lead to questions or conditional options.

Reported balances are entered explicitly; unknown balances and goal savings stay unknown. Daily and weekly briefings are generated inside Pulp when opened, with no email or scheduled notifications. Goal savings inform questions; strategy projections still use historical cash flow and do not assume reported assets are liquid.

## Run locally

Use Python 3.12 and Node.js 22 to match CI and Docker. Install dependencies from the repository root:

```sh
python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
```

Copy [.env.example](.env.example) to `.env` with your shell or editor. The supplied CSV directory must contain at least `monthly_summary.csv`, `loans.csv` and `accounts.csv`; other supplied tables and derived artifacts enrich the profiles. The loader checks `PULP_DATA_DIR` / `EVERPATH_DATA_DIR`, then `data/`, then recognized `data-*` export folders.

Start these in separate terminals:

```sh
python -m uvicorn app.main:app --app-dir backend --port 8000
```

```sh
npm --prefix frontend run dev
```

Open `http://localhost:5173`; Vite proxies `/api`, including WebSockets, to port 8000. Backend OpenAPI is at `http://127.0.0.1:8000/docs`.

The calculators, recorded profiles, simulations and grid planner work without AI credentials. Free-text interpretation then uses a limited offline fallback. Native voice requires Gemini credentials and an available Live model. Copy the repository's model defaults from `.env.example`; they are configuration defaults, not a promise of provider availability.

For a single-server build:

```sh
npm --prefix frontend run build
python -m uvicorn app.main:app --app-dir backend --port 8000
```

The backend serves `frontend/dist` when present. Production runs this application behind Caddy on Vultr at **askpulp.com**; the `.ca` domain redirects there. [Deployment guide](docs/deployment.md).

## How it fits together

1. Python computes official metrics, historical features, flags and scenario results from the mapped CSV data.
2. The decision profile combines those observations with confirmed context to identify useful questions and choices.
3. Typed SSE requests and Gemini Live's `conversation_turn` tool both call `director.stage_stream`.
4. New personal details become proposals. Confirmation applies them with a context-version check.
5. The council scores a grid, optionally gets Strategist proposals, validates and re-scores them, then lets the Challenger review the actual candidates before final ranking.
6. A versioned active plan is shared by conversation, goals, roadmap and the scenario explorer.

The system mixes deterministic components and model roles; it is not eight independent agents running on every message. [Current agent inventory and unfinished blueprint work](docs/agents/README.md).

## Verify

```sh
python -m pytest backend/tests -q
node frontend/tests/voice.test.mjs
npm --prefix frontend run build
npm --prefix frontend run test:e2e
python docs/agents/validate_examples.py
```

Browser tests require installed Chrome (or the configured Playwright channel), a built frontend and a free port 8002. They use an isolated API, temporary context and disabled live AI credentials. The last code verification on November 8, 2026 passed **137 backend tests, 15 browser tests and the voice client regression test**. Counts are a dated snapshot, not a fixed acceptance target. CI runs a smaller named backend subset, voice regression and the frontend build; it does not run the full local browser suite. [Testing and verification](docs/testing.md).

## Data and research

The organizer-supplied dataset contains 4,500 anonymized accounts and monthly records from January 2020 through December 2025. It is historical data, not the current finances or identity of the person using the app. The app uses explicit semantic column mappings; automatic interpretation of arbitrary Excel files is **not implemented**.

The original research matched 2,238 pairs of accounts with similar inflows under the same modeled layoff. In 78 pairs, the account with more cash exhausted its buffer first. These are simulated outcomes under stated assumptions, not observed layoffs or causal evidence. [Findings and denominators](docs/findings.md) ? [Methodology and formulas](docs/methodology.md).

## Boundaries

- Context questions are heuristics, not a learned or human-validated optimum.
- Simulations and ranked options are conditional calculations, not forecasts or proof of affordability.
- Native voice is one Gemini Live voice; text-only mode is silent. Offline mode does not provide native voice.
- The public account selector is a demo interface, not authenticated personal banking.
- File storage and current locking are a single-worker prototype; Redis support does not make multi-worker writes transactional.
- Schema Scout, the separate Consultant/Advocate review-and-acceptance protocol, live bank feeds and autonomous transactions remain unimplemented.

See [limitations](docs/limitations.md), [product and design guide](docs/product.md), and [the documentation index](docs/README.md). Original event briefs and research artifacts are retained separately from descriptions of shipped behavior.
