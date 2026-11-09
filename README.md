# PULP

**Planning Under Life’s Pressures.** Prepare for what comes next.

PULP is a financial resilience engine for real bank customers, built for the Tangerine track (“Resilience Rewired”) at the Sheridan Datathon 2026. Pick any account from the supplied anonymized bank data and PULP shows what typically comes in and goes out, tests what a shock would do, and gives a plan for before it hits and a backup plan for when it does. Pulp, a tangerine companion, can talk it through with you by text or voice.

**Live demo:** [askpulp.com](https://askpulp.com)

## What it does

The track asks for three things. All three run on the judges’ exact definitions and need no AI service.

| Requirement | In PULP |
|---|---|
| **Know the customer** | Type any `account_id`. Overview shows typical money in and out, fixed costs, the cash buffer and baseline runway. |
| **Take a shock** | Shocks deals four face-down cards. The first three are the brief’s twist cards (laid off, the furnace dies, layoff and bills); the fourth deals a different shock each time, chosen for that account’s life. You can also set income retained, household bills change, a one-time cost and the duration yourself. |
| **Make a plan** | Every shock returns a **Prepare now** plan (the cash target and how long it takes to save) and an **If it happens** plan (cash needed today and what to free up each month). |

## The workspace

| Page | What you can do |
|---|---|
| **Overview** | Pulp’s biggest discovery about you first: the one finding most worth knowing, ranked by how serious it is, how rare it is across all 4,500 accounts and how unlikely you are to notice it yourself, with the evidence and one thing to do. Then the typical month, the cash buffer, fixed costs and baseline runway, with a picture of the month and what-if sliders. |
| **Profile** | The person behind the account: a fictional persona built from the records, goals weighted by importance and time horizon (most tied to something specific in the records, like a loan’s end date or a car lease), goal ideas you can re-rank by angle (safety, ambition, life events, money habits) or let Pulp choose, worries, the first questions Pulp asks, what makes you unusual and who you are like, and a timeline of every change the agents or you made, each one undoable. |
| **Shocks** | Flip a card to reveal who brings the shock and what it is, or enter your own. Each reveal shows a different character, and the Shock Dealer says in one line why it picked them. See the verdict, the cushion month by month, both official plans, and the plans the agents chose for this shock, or ask Pulp about the same card. |
| **My Plan** | Both official plans, a long-term plan with no shock, the four finalists for the current shock, plans that fall short for contrast, and how your plans changed over time. |
| **Insights** | The account’s patterns, what your age, household and district say about you, the dataset-wide findings and the check against real loan outcomes. Each chart has a simple juice-cup view with the same numbers, tagged **Recorded** (what actually happened) or **Simulated** (the engine’s test). |
| **Agents** | Every agent, its symbol and job, and the full flow for each stage: from records to a person, getting to know you, and when life happens. |
| **Stage 1 report** | Everything Stage 1 learned, as a plain-language report and a technical one, downloadable as Markdown or printable. |
| **Developer docs** | Every API endpoint with examples, a flowchart of the agents and how they hand work to each other, the tech stack and the infrastructure. |
| **Account details** | What you own and what you owe (update the balances yourself), goals with the savings you have set aside, where your money goes, and the details you told Pulp, each removable. |

**Pulp** lives in the bottom-right corner on every page. Open it to:

- text Pulp about your money or a decision, or press **Talk**: with a typed message it sends it, with an empty box it starts a live voice conversation (Gemini native audio) that appears in the same thread;
- mention something that happened or might happen (“I might lose my job”, “rent is going up 10%”, “should I take a second job?”), and the Stage 3 agents plan for it straight away;
- press **Shuffle** for a twist: a small picture of what it does to your cushion and a short reply about what it means for you, with its official numbers one tap away in Shocks;
- watch your profile update as you talk. Pulp says what it changed; say “no” to undo it, or undo any change on the Profile page;
- turn on **Agents** to see the workflow beside the chat: which agent ran, what it was given and what it handed on.

Sign out of the demo to clear the account from your browser. The demo is not connected to a live bank.

## How the numbers work

The official numbers are computed from `monthly_summary.csv` and `loans.csv` with the judges’ definitions. The profile, persona and Insights also read the client, household, card, district and standing-order files, plus transaction-derived features committed in `data/derived/`.

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

## How the plans are chosen

For a shock, or for the long term with no shock, the Life Planner builds about 300 candidate plans from real decisions: a weekend job or gig work, extra hours, moving for a better-paid job or to somewhere cheaper, a lodger, trimming day-to-day spending, pausing a recurring transfer, moving bill dates after payday, refinancing, building the cushion before goals, investing for long goals, a December budget, or delaying a goal. Each plan has one to three steps with start and end months.

1. The **Engine** simulates every plan month by month. Spare money fills the cushion, then goals by weight. A gap drains the cushion, then goal savings, then becomes shortfall.
2. The **Validator** screens out plans that do not fit this life, counted per rule: no loan to refinance, extra hours at a job you have lost, a cheaper move with no housing bill, cuts beyond a quarter of spending, or anything you told Pulp rules out.
3. The **Ranker** keeps the plans that no other plan beats on every axis.
4. The **Director** keeps four distinct finalists: the one that covers the gap best, the strongest cushion, the furthest toward your goals, and the best balance by the weighted score. Up to three sensible-looking plans that still run short are shown for contrast.

The objective is printed with every result:

```
score = w_short x gap covered + w_res x cushion + w_goal x sum(goal weight x progress) - w_dis x disruption
goal weight = importance x urgency (short 1.0, medium 0.75, long 0.5), normalised
life fit = the Life Fit Assessor's average fit of the plan's steps (0 to 1); a poor fit costs up to 0.15
```

Each step comes with the Stage 1 insight it rests on and what it moves, measured by rerunning the plan without it. Every run is kept, so you can see how your plans changed as your profile changed.

## Agents interpret, code calculates

No model ever produces a number. The engine is deterministic Python, tested against the definitions above; the agents decide what to look at, what to ask and how to say it, and every number in their words is checked against the engine before it is shown.

| Stage | Agent | Role |
|---|---|---|
| 1 | **Schema Scout** (code) | Maps the bank’s columns to roles (money in, money out, bills, balance), so the rest of the pipeline reads roles rather than column names. Today the map is fixed for this dataset. |
| 1 | **Feature Forge** (code) | Turns the records into about 78 signals per account. |
| 1 | **Pattern Hunter** | Searches all 4,500 accounts for patterns, testing each with statistical tools. |
| 1 | **Archetype Namer** | Names the six behavioural groups the clustering found. |
| 1 | **Profile Narrator** | Writes the few sentences worth hearing about an account, one per flag. |
| 1 | **Persona Builder** | Builds a realistic but fictional person for the account: occupation guess, household, weighted goals, worries and first questions, and a one-sentence quote in that person’s own voice for each goal and worry. Amounts come from code; the quotes may not add numbers. |
| 2 | **Companion** | Turns what you say into profile updates, applied directly and logged; “no” undoes them. |
| 2 | **Director** | Decides what to show each turn, writes what Pulp says, and starts Stage 3 when you mention a shock or a decision. |
| 3 | **Shock Dealer** | Picks who reveals each twist card and, for the open card, which shock, from a fixed list, with a one-line reason. Never sets an amount. |
| 3 | **Shock Generator** (code) | Picks shocks that fit this life: a lost client for a cash earner, a payment reset for a borrower, parental leave for a young family, and world events ranked for this person (a recession, tariffs, a conflict abroad raising prices, wildfire, flood or an ice storm, a lockdown, a strike, a market drop, fraud). |
| 3 | **Life Fit Assessor** (code) | Checks every decision against the person: age and physical capacity, the time a shared household leaves, whether a lodger or a move is realistic, whether gig work exists where they live. Rules out poor fits with the reason and adds options for their stage of life, such as paid advice in their field, work from home, or starting CPP at 60. |
| 3 | **Life Planner** (code) | Generates and simulates hundreds of multi-step plans. |
| 3 | **Strategist** and **Challenger** | Propose options from your life, and flag the ones you are unlikely to follow. |
| 3 | **Validator and Ranker** (code) | Screen, rank and keep the four finalists by one stated objective. |
| all | **Engine** (code) | The official formula and the month-by-month simulator. The only source of numbers. |

The personas are fictional and marked as such. They exist so a short demo can start from a plausible life instead of a long intake, and every goal or worry they add can be undone.

Model roles run on Gemini through Google’s Agent Development Kit, with Vultr Serverless Inference as an optional fallback provider. Without a key, PULP keeps working: the calculator, twist cards and plans are deterministic, the Shock Dealer falls back to a local draw, the conversation falls back to an offline extractor, and the Agents view labels those turns as offline instead of showing agents that did not run.

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

Developer docs are also in the app at `/developers` (every endpoint, the agent flowchart, stack and infrastructure).

[Stage 1 report](docs/stage1-report.md) · [Agent contracts](docs/agents/v2-contracts.md) · [Demo walkthrough](demo/demo-script.md) · [Challenge and data dictionary](docs/tangerine-challenge.md) · [Methodology](docs/methodology.md) · [Limitations](docs/limitations.md) · [Architecture](docs/architecture.md)

## Team

- [Ahmad Ali](https://github.com/AhmadAli137)
- [Ahmad Ayoub](https://github.com/Ahmad-Ayoub004)
- [Ayaan Malik](https://github.com/ayaanmalik934pmn-wq)
- [Martin Nguyen](https://github.com/mtnnguyen)

## Credits and sources

**Data.** PKDD’99 Discovery Challenge Financial dataset (real anonymized bank data), from the CTU Prague Relational Dataset Repository: [relational.fel.cvut.cz/dataset/Financial](https://relational.fel.cvut.cz/dataset/Financial). Provided for the Tangerine track as monthly summaries, transactions, loans and account records, with amounts in Canadian dollars.

**Government of Canada.** The 55% income replacement used for the layoff, sickness and parental cards follows Employment Insurance:

- [EI regular benefits](https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html)
- [EI sickness benefits](https://www.canada.ca/en/services/benefits/ei/ei-sickness.html)
- [EI maternity and parental benefits](https://www.canada.ca/en/services/benefits/ei/ei-maternity-parental.html)

No Statistics Canada tables were used. District figures (salary, unemployment, urban share, crime) come from the dataset’s own district table, which describes Czech districts. The other amounts in the twist deck (rent and bill increases, repair, dental and vet costs, reduced hours) are illustrative round figures chosen to be plausible, not values taken from a published source.

**Built with** Google Agent Development Kit and Gemini, FastAPI, pandas, React, Vite and Vultr.
