# PULP — Planning Under Life's Pressures. Prepare for what comes next.

**Live: https://askpulp.com** (Vultr, HTTPS, Gemini voice and the ADK council). Static mirror without voice: https://pulp-mu-six.vercel.app.

Financial resilience engine for the **Tangerine track, Resilience Rewired** at Sheridan Datathon 2026.
A judge picks any `account_id`, reads a twist, and PULP shows the official runway, a verdict for the
horizon, a goal plan before the shock, a backup plan if it hits, and how the plan changes when the customer
tells it what they are living for.

> **Verified first-minute finding.** We matched 2,238 pairs of accounts with near-identical inflows and hit
> both with the same six-month layoff at 55% income. In 78 pairs (3.5%) the account with **more** cash ran out
> **first**. Across all 4,486 accounts, the cash-buffer quartile told us almost nothing about who survives
> (rank correlation −0.02, survival 70% / 57% / 58% / 73% by quartile) while the spending-to-income ratio told
> us almost everything (rank correlation −0.75, survival 99% / 82% / 52% / 25%). Details and sensitivity
> checks: [docs/findings.md](docs/findings.md).

## Canonical repository

Work only in this checkout and [AhmadAli137/pulp](https://github.com/AhmadAli137/pulp). The comparison checkout is retired and must not receive edits or pushes. GitHub is the source of truth; the Entire remote is historical.

The TypeScript frontend, native Gemini voice relay, Vultr provider, Redis/file context storage, and deployment configuration remain in place. The Stage 3 **planning council runs on Google ADK**: `POST /api/agent/plan` builds a grid of levers scored by the Monte Carlo engine, runs a Strategist and a Challenger (Gemini `LlmAgent`s in an ADK `ParallelAgent`) over the same frozen request, then clamps, re-scores and ranks everything in code ("Planning council" on Shock Lab). Stage 1 **inferred profiles** are in too: `features.py` computes about 58 behavioural signals per account from semantic roles and fires rule-based flags with evidence (timing dips, fee bleed, lifestyle creep, savings elsewhere, never-negative-but-fragile, ...); `archetypes.py` clusters accounts and a Gemini `LlmAgent` names each cluster from its statistics; `narrator.py` writes three or four grounded sentences per account (each tied to a flag, template fallback); `hunter.py` is an ADK hypothesis loop with statistical tools that records findings only above an evidence bar. `GET /api/customers/{id}/insights`, `/api/research/archetypes`, `/api/research/hunter`. The intake agent and Consultant role remain a blueprint. Start with the [colleague handbook](docs/agents/README.md) and [post-intake implementation prompt](docs/agents/IMPLEMENTATION_PROMPT.md).

## What it does

| Step | Screen | What you see |
|---|---|---|
| Ask Pip | Home | Agent-first screen: type an account number, a twist in plain words, or a goal; Pip (the tangerine mascot) answers with calculator numbers, a verdict card and memory proposals |
| Know the customer | Shock Lab, My Financial Twin | I, S, F, H, B, P with "show the math", history charts, observed distress, population percentiles |
| Take a shock | Home, Shock Lab, Explore Futures | Event presets and exact inputs; official runway; horizon verdict; why it changed; results table |
| Make a plan | Home, Shock Lab | Goal plan (buffer needed before the shock) and backup plan (immediate need and monthly gap), tipping point |
| Explore futures | Explore Futures | Monte Carlo fan chart calibrated on the account's own months; five branching paths |
| Personalize | Home, My Goals | Conversation (voice or text) extracts goals, worries, constraints; you confirm; strategies are compared and replanned |
| See what changed | My Goals | Before-and-after plan comparison with reasons |
| Act | Financial Roadmap | This week / month / quarter / year actions with amounts, effects, trade-offs, assumptions, review triggers |
| Learn | Insights | The dataset finding with chart, sensitivity checks, representative pair, and this account's cohort |

The official metrics, shock calculator, discovery and default plans work with **no AI service**. Gemini is
optional and only adds conversation quality.

## Run locally

Requirements: Python 3.11+ and Node 18+. The Tangerine CSVs go in `./data/` or any `./data-*/data/` folder
(the Google Drive export name is auto-detected), or set `EVERPATH_DATA_DIR`.

```bash
# backend
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000        # API docs at http://127.0.0.1:8000/docs

# frontend (second terminal)
cd frontend
npm install
npm run dev                                       # http://127.0.0.1:5173 (proxies /api to :8000)
```

Optional: copy `.env.example` to `.env` and set `GEMINI_API_KEY` (model `gemini-3.5-flash` by default; set `GEMINI_MODEL`
to change it) to enable the Gemini companion. Without it the companion runs an offline extractor that produces the same
structured proposals. The first visit plays a short intro (a tangerine picked, squeezed, juice and pulp into a cup, then the
logo); Settings has a Replay button.

Production build: `cd frontend && npm run build` produces `frontend/dist/`; the backend serves it at `/` when present.

**Hosting**: one Docker image behind Caddy with automatic HTTPS, a Vultr bootstrap script, a GoDaddy DNS recipe and a
GitHub Actions workflow that redeploys on every push to `master`. See [docs/deployment.md](docs/deployment.md).

## Tests and reproducibility

Run from the repository root:

```powershell
python -m pytest backend/tests -q                 # 84 backend regressions; AI providers mocked/disabled
python docs/agents/validate_examples.py           # handbook links and synthetic contract fixtures
python backend/scripts/analyze_population.py     # original research and denominator definitions
python backend/scripts/pulp_research.py          # supplementary research; distinct populations
python backend/scripts/validate_pulp_data.py --data-dir data-20261107T180312Z-1-001/data
cd frontend
npm ci
npm run build
npm run test:e2e                                  # 11 browser journeys; isolated API on port 8002; installed Chrome required
```

Use `--data-dir` to point the audit at the full organizer export containing `transactions.csv`; the deployment `data/` subset omits that large file. Browser tests use temporary context, no live AI keys, and no Redis. They refuse to reuse an occupied port. See [migration and verification notes](docs/consolidation.md).


The synthetic check from the brief (I = $4,000, S = $3,600, H = $1,000, B = $6,200 with the combined twist →
$2,200 inflow, $3,750 spending, $1,550 gap, **4.0 months**, six-month shortfall **$3,100**) is a unit test
(`tests/test_tangerine_metrics.py`) and is never presented as a dataset result.

## How the numbers are computed

Official definitions (event README), all from `monthly_summary.csv` and `loans.csv`:

| Quantity | Definition |
|---|---|
| I typical inflow | median of monthly `money_in` |
| S typical spending | median of monthly `money_out` |
| F fixed costs | median of per-month `household_bills + insurance + loan_payments` |
| H household bills | median of monthly `household_bills` |
| B buffer | mean `avg_daily_balance` of the last 6 rows sorted by month |
| P active loan payment | `monthly_payment` if the loan's status is C or D (running at end of 2025), else 0 |

Shock with retained income r, bill increase h, one-off cost C and horizon T:

```
income_after = r × I          spending_after = S + h × H          buffer_left = B − C
gap = spending_after − income_after
runway = 0 if buffer_left ≤ 0; "no shortfall (120+)" if gap ≤ 0; else min(buffer_left / gap, 120)
goal plan:   cash needed = C + T × max(0, gap); additional = max(0, needed − B); capacity = I − S (assumption)
backup plan: immediate = max(0, C − B); free up per month = max(0, gap − buffer_left / T)
tipping point: largest h with buffer_left / T ≥ S + h × H − r × I
```

Runway is displayed to one decimal; verdicts use unrounded values. Fixed costs are inside S and never added twice.

## How simulation works

`backend/app/services/scenario_engine.py` projects the buffer month by month. Each Monte Carlo path resamples
whole historical months of the account (money in and money out together) scaled so the typical month equals I
and S, applies the shock over a window, charges the one-off cost, and applies explicit strategy rules (free up
$X, contribute $Y to a goal fund, pause below an emergency floor). Seeds make results reproducible. The
deterministic path agrees with official calculations in aligned constant-flow cases; discrete month boundaries differ from fractional runway. Outputs are model probabilities for a chosen
scenario, not real-world probabilities. Upfront expenses are checked before later income; the starting negative balance is included. Historical cash flow resumes after the shock as an assumption. Strategy capacity first covers any existing deficit, unknown goal budgets remain unknown, and projections extended to a goal deadline are disclosed.

## How AI is integrated

`gemini_agent.py` runs Gemini (google-genai) with narrow backend tools (profile, history, context, official
shock, simulate, compare strategies, propose context update, replanning diff) and a second, schema-validated
extraction call (Pydantic). Proposed memory updates are staged; only user-confirmed items enter the structured
context (`context_manager.py`), after which `feedback_loop.py` replans and diffs the strategy against the
previous snapshot. Question choice is a stated heuristic (relevance − burden − repetition), not a trained model.
If Gemini is missing or fails, the offline engine produces the same structured proposals.

## Project layout

```
backend/app/services   tangerine_metrics (official), financial_profiles, cohort_analysis, scenario_engine,
                       strategy_optimizer, context_manager, feedback_loop, gemini_agent, roadmap, data_store
backend/app/api        routes.py (REST), schemas
backend/tests          formula, dataset, API, loop and resilience tests
backend/scripts        analyze_population.py (discovery, reproducible)
frontend/src           pages, components, charts (Recharts), stores (zustand), services, hooks (browser speech)
docs/                  findings, methodology, architecture, limitations, judging, sponsor-integrations
demo/                  demo script       submissions/   Devpost write-up
```

## Agent layer: guides for contributors

The two-stage agent design (voice intake → planning council of three Google ADK agents), its contracts, test matrix and
hand-off prompts live in [docs/agents/](docs/agents/README.md) and [prompts/](prompts/).

## Limitations (short)

See [docs/limitations.md](docs/limitations.md). Highlights: the bank data is a static 2020–2025 snapshot of
one anonymized bank; it does not label discretionary spending, wages or identity; EI replacement is applied as
a flat 55% without the weekly maximum or the 14–45 week duration; simulated outcomes are not forecasts.

## Credits and sources

- **PKDD'99 Discovery Challenge Financial dataset** (real anonymized bank data), CTU Prague Relational Dataset
  Repository: https://relational.fel.cvut.cz/dataset/Financial — supplied via the Tangerine track README.
- Sheridan Datathon 2026 Tangerine track brief (event README and Hacker Package).
- Government of Canada, EI regular benefits (55% replacement, 14–45 weeks):
  https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html — used for the 55% rate and the
  duration note. No other external numerical values were used in calculations.
