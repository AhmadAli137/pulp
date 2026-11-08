# PULP

**Planning Under Life’s Pressures.** Prepare for what comes next.

PULP is a financial resilience engine for real bank customers, built for the Tangerine track (“Resilience Rewired”) at the Sheridan Datathon 2026. Pick any account from the supplied anonymized bank data and PULP shows what typically comes in and goes out, tests what a shock would do, and gives a plan for before it hits and a backup plan for when it does. Pulp, a tangerine companion, can talk it through with you by text or voice.

**Live:** [askpulp.com](https://askpulp.com)

## What it does

The track asks for three things. All three run on the judges’ exact definitions and need no AI service.

| Requirement | In PULP |
|---|---|
| **Know the customer** | Type any `account_id`. Overview shows typical money in and out, fixed costs, the cash buffer and baseline runway. |
| **Take a shock** | Shocks lets you draw one of the three twist cards from the brief, shuffle a deck of twelve realistic Canadian shocks, or set income retained, household bills change, a one-time cost and the duration yourself. |
| **Make a plan** | Every shock returns a **Prepare now** plan (the cash target and how long it takes to save) and an **If it happens** plan (cash needed today and what to free up each month). |

## The workspace

| Page | What you can do |
|---|---|
| **Overview** | See the typical month, the cash buffer, fixed costs and baseline runway, with an optional picture of how money flows in and out. |
| **Shocks** | Draw or shuffle a twist card, or enter your own. See the verdict, your cushion month by month, cash over time, both plans, and whether an optional purchase can wait. Ask the planning council what you could change. |
| **My Plan** | Revisit both plans for the current shock, and the council’s top options written as decisions you could actually make. Mark a shock as already happened to see the backup plan first. |
| **Insights** | The account’s recorded patterns and the questions they raise, plus the dataset-wide findings and the check against real loan outcomes. |
| **Account tools** | Account details, goals, next steps, briefings and settings. |

**Pulp** lives in the bottom-right corner on every page. Open it to:

- ask about your money or a decision in plain words, or press **Talk** for a live voice conversation (Gemini native audio);
- deal a twist card in the conversation, then open its official numbers in Shocks;
- confirm or correct what Pulp learned about you. Nothing is saved until you say yes, by button or out loud;
- open **Agents** to watch which agent ran, what it was given and what it handed on.

Sign out of the demo to clear the account from your browser. The demo is not connected to a live bank.

## How the numbers work

Everything is computed from `monthly_summary.csv` and `loans.csv` with the judges’ definitions:

| Number | Definition |
|---|---|
| Typical money in (I) | Median of `money_in` |
| Typical spending (S) | Median of `money_out` |
| Fixed costs (F) | Median of `household_bills + insurance + loan_payments` (shown, not added again) |
| Household bills (H) | Median of `household_bills` |
| Buffer (B) | Mean of `avg_daily_balance` over the account’s last six months |
| Loan payment (P) | `monthly_payment` if the loan is still running at the end of 2025 |

A shock sets income after to r × I and spending after to S + h × H. Runway is the buffer left after any one-off cost divided by the monthly gap: 0 when the buffer is used up, “no shortfall (120+)” when income still covers spending, otherwise capped at 120 and shown to one decimal. Verdicts use the unrounded value.

Two things to know when reading results. The layoff card applies 55% to all of typical money in, with no EI weekly maximum. About a quarter of accounts have no labelled household bills, so a bills change cannot move their spending; the result says so when that happens.

## What we found

- **Spending, not savings, decides who makes it.** Under the same six-month layoff at 55% of income, survival barely moves when accounts are split by cash buffer (70%, 57%, 58%, 73% by quartile). Split by how much of income goes back out, it falls from 99% to 25%. In this bank, how much cash people hold is almost unrelated to how much of their income they spend.
- **It holds up against what really happened.** Among the 682 accounts with a loan, those our engine says would not last a six-month layoff later had the loan go bad 14.3% of the time, versus 4.8% for those it says would. Uneven income: 20.5% versus 5.3%. A sliding balance: 28.4% versus 8.8%.
- **More cash can still run out sooner.** In 78 of 2,238 pairs of accounts with near-identical income, the one with more cash ran short first under the same shock.

Methods, caveats and reproduction: [docs/findings.md](docs/findings.md).

## Agents interpret, code calculates

No model ever produces a number. The engine is deterministic Python, tested against the definitions above; the agents decide what to look at, what to ask and how to say it, and every number in their words is checked against the engine before it is shown.

| Agent | Role |
|---|---|
| **Engine** (code) | The official formula, a Monte Carlo simulator and a grid of options. The only source of numbers. |
| **Companion** | Turns what you say into things PULP may remember. Only proposes; you confirm. |
| **Profile Narrator** | Writes the few sentences worth hearing about an account, one per flag the engine raised. |
| **Director** | Decides what to show for each turn and writes what Pulp says, calling the engine for numbers. |
| **Strategist** | Proposes options from your own life and spending (pause a transfer, take extra hours) and has the engine score them. |
| **Challenger** | Flags options you are unlikely to follow, given what you told Pulp. Cannot change scores or memory. |
| **Validator and Ranker** (code) | Clamps and re-scores every proposal, then ranks them by one stated objective. |

Model roles run on Gemini through Google’s Agent Development Kit, with Vultr Serverless Inference as an optional fallback provider. Without a key, PULP keeps working: the calculator, twist cards and plans are deterministic, and the conversation falls back to an offline extractor.

Before you ask anything, PULP has already profiled each account from its records: about 78 behavioural signals (income regularity, payday and bill dates, penalty interest, recurring transfers, spending drift, past income drops and how the household responded), six behavioural archetypes, and a set of evidence-backed flags. Details in [docs/architecture.md](docs/architecture.md).

## Run locally

Use Python 3.12 and Node.js 22. From the repository root:

```sh
python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
```

Start the API and the frontend in two terminals:

```sh
python -m uvicorn app.main:app --app-dir backend --port 8000
```

```sh
npm --prefix frontend run dev
```

Open [http://localhost:5173](http://localhost:5173). The frontend proxies API calls and the voice websocket to port 8000. The summary CSVs load from `data/`; set `PULP_DATA_DIR` to use another folder. For the conversation and voice, copy `.env.example` to `.env` and add a `GEMINI_API_KEY`; everything else runs without it.

For a single-server build, run `npm --prefix frontend run build` and open [http://localhost:8000](http://localhost:8000).

## Verify

```sh
python -m pytest backend/tests -q
npm --prefix frontend run build
node frontend/tests/voice.test.mjs
npm --prefix frontend run test:e2e
```

The browser tests use an isolated API on port 8002 and need Chrome, or a Chromium executable set in `PULP_BROWSER_EXECUTABLE`.

## Deployment

[askpulp.com](https://askpulp.com) runs on a Vultr instance as one Docker image (API, built frontend and voice relay) behind Caddy with automatic HTTPS. Every push to `master` runs the tests and redeploys. See [docs/deployment.md](docs/deployment.md).

## More

[Demo walkthrough](demo/demo-script.md) · [Challenge and data dictionary](docs/tangerine-challenge.md) · [Methodology](docs/methodology.md) · [Limitations](docs/limitations.md) · [Architecture](docs/architecture.md)

## Credits and sources

**Data.** PKDD’99 Discovery Challenge Financial dataset (real anonymized bank data), from the CTU Prague Relational Dataset Repository: [relational.fel.cvut.cz/dataset/Financial](https://relational.fel.cvut.cz/dataset/Financial). Provided for the Tangerine track as monthly summaries, transactions, loans and account records, with amounts in Canadian dollars.

**Government of Canada.** The 55% income replacement used for the layoff, sickness and parental cards follows Employment Insurance:

- [EI regular benefits](https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html)
- [EI sickness benefits](https://www.canada.ca/en/services/benefits/ei/ei-sickness.html)
- [EI maternity and parental benefits](https://www.canada.ca/en/services/benefits/ei/ei-maternity-parental.html)

No Statistics Canada tables were used. The other amounts in the twist deck (rent and bill increases, repair, dental and vet costs, reduced hours) are illustrative round figures chosen to be plausible, not values taken from a published source.

**Built with** Google Agent Development Kit and Gemini, FastAPI, pandas, React, Vite and Vultr.
