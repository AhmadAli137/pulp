# PULP (Planning Under Life's Pressures)

**Elevator pitch:** Financial security isn't how much you earn. It's how ready you are when income changes. PULP reads
your bank records, tests life's shocks and hands you a plan.

**Live:** https://askpulp.com · **Code:** https://github.com/AhmadAli137/pulp

---

## Inspiration

Most people find out how fragile their money is the day something goes wrong. Their bank records could have told them
months earlier.

## What it does

Pick any account. PULP answers three questions:

- **How am I doing?** Money in, money out, how long your cushion lasts, and the one thing in your records you'd never
  spot yourself.
- **What if life happens?** Flip a card (a layoff, a broken furnace, a recession) and see month by month when the money
  runs out.
- **What should I do?** PULP tries about 300 real plans, drops the ones that don't fit your life, and gives you four
  clear options with steps and dates.

Ask Pulp, our tangerine companion, anything by text or voice.

## Our biggest finding

**Spending, not savings, decides who makes it.** Across 4,500 accounts facing the same six-month layoff, how much cash
people held barely changed who made it (57% to 73%). How much of their income they spent changed everything (99% down
to 25%). And it matches real life: accounts our engine flagged later had their loans go bad three times as often.

## How we built it

PULP is three stages of agents on top of one rule: **agents interpret, code calculates.** Every number comes from a
tested Python engine that implements the judges' exact definitions. Sixteen agents (eight on Gemini through Google's
Agent Development Kit, eight in code) decide what to look at, what to ask and how to say it, and every number they say
is checked against the engine before it is shown.

**Stage 1 · From records to a person.** Before anyone asks anything, PULP profiles every account:

- **Schema Scout** maps the bank's columns to roles (money in, money out, bills, balance), so the rest reads roles, not
  column names.
- **Feature Forge** turns months of records into about 78 behavioural signals per account: income regularity, payday and
  bill dates, penalty interest, recurring transfers, spending drift, past income drops and how the household responded.
- **Pattern Hunter** searches all 4,500 accounts for patterns with statistical tools, and its strongest findings are
  checked against recorded loan outcomes.
- **Archetype Namer** labels six behavioural groups found by clustering.
- **Profile Narrator** writes the few sentences worth hearing about one account.
- **Persona Builder** imagines a realistic, clearly fictional person who fits the records: occupation guess, household,
  goals weighted by importance and time horizon, worries, and a one-line quote in their own voice. Amounts come from
  code.

**Stage 2 · Getting to know you.** Pulp talks by text or live voice (Gemini Live, relayed through our server so voice
and text share one pipeline):

- **Companion** turns what you say into profile updates, applied straight away and logged; saying "no" undoes them.
- **Director** decides what to show and say each turn, explains any section in plain words, and starts Stage 3 when it
  hears a shock ("a hospital bill of 4,000", "what if a recession hits") or a big decision.

**Stage 3 · When life happens:**

- **Shock Generator** builds a deck of shocks that fit this life, from a lost client to a wildfire evacuation.
- **Shock Dealer** (Gemini) picks who brings the next card and why.
- **Life Planner** builds about 300 multi-step plans from real decisions and simulates each month by month.
- **Life Fit Assessor** rules out what doesn't suit the person's age, health, time and household.
- **Validator and Ranker** keep the plans no other plan beats on every axis.
- **Strategist and Challenger** (Gemini) propose and stress-test options.
- Four distinct finalists come out, scored on one stated objective: gap covered, cushion and weighted goal progress,
  minus disruption and poor fit.

The **Engine** sits under all three: the official formula, the month-by-month simulator and the plan search.

$$\text{runway} = \frac{B - C}{(S + hH) - rI}$$

**Infrastructure.**

- **Backend:** FastAPI and pandas, with Google ADK and Gemini 3.5 Flash for the model roles. Gemini 3.8 Live native
  audio runs through a WebSocket relay, and every model role has a deterministic offline fallback.
- **Frontend:** React 19, TypeScript and Vite, with Zustand, Framer Motion and Recharts.
- **Hosting:** one Docker image (API, built frontend and voice relay) on Vultr, behind Caddy with automatic HTTPS.
- **Deployment:** GitHub Actions runs the tests and redeploys on every push.
- **Tests:** 232 backend tests, 13 browser tests and a voice-client test.
- **Agent runs:** every run is recorded and can be replayed step by step on the Agents page. Every endpoint is documented
  at /developers.

## Challenges we ran into

- **Keeping AI honest.** Models love to invent numbers. Every caption, quote and explanation is checked against the
  engine's figures, and a rewrite that adds a number is thrown out.
- **Simulations that look like findings.** Some patterns are just the formula restated: "fails a layoff" is defined by
  the formula itself. We excluded those, labelled every result as simulated or recorded, and validated the layoff test
  against real loan outcomes before trusting it.
- **Real, messy data:**
  - The dataset is 1990s Czech banking, relabelled to Canadian dollars and shifted to 2020 to 2025.
  - A quarter of accounts have no labelled household bills, so a bills shock can't move them; PULP says so instead of
    reporting "no change".
  - Cash deposits are the norm in this bank, so every threshold had to be retuned.
  - The account's branch and the owner's home district differ for 9% of people.
  - The 100 MB transaction file couldn't ship, so its signals are precomputed.
- **Speed against a three-minute live twist.** A Gemini call takes 5 to 8 seconds and a full agent council 15 to 40.
  - The official numbers never wait on a model.
  - Card picks are fetched before you click.
  - Persona refinement runs in the background.
  - When no model runs, the agents say so on screen.
- **Running out of model quota mid-build.** The free tier stopped at 20 requests a day, so every AI role got a
  deterministic fallback that still works.
- **Voice is a different animal.** Gemini Live calls our tools mid-sentence, so voice and text had to share one pipeline,
  one memory and one set of visuals, and a server restart can drop a live call.
- **Understanding people from anonymous records.** We can't know who someone is, so personas are fictional and labelled
  as such. Amounts come from their own numbers, and every change they make to the profile can be undone.
- **Plans that fit a life, not a spreadsheet.** Our first planner told a 58-year-old in a rural district to take up
  delivery work and get a lodger. Fixing that took four things:
  - an explicit objective with weighted goals;
  - Pareto ranking;
  - forcing the four finalists to differ;
  - the Life Fit Assessor.
- **Hearing a shock in plain speech.** "A hospital bill of 4,000 tomorrow" first read as four months off work. Amounts,
  timing words ("tomorrow", "might") and world events all needed their own handling.
- **Too much information.** Each version showed more than people could take in. We cut it back again and again, to one
  sentence per page, a Simple view, symbols, and an "Explain this" button that gives the plain version with your
  numbers.
- **Many hands, one codebase.** Several teammates and AI coding agents built in parallel, across merged branches and
  rewrites. Keeping 245 tests green on every push is what let us move fast without breaking the live twist.

## Accomplishments that we're proud of

This was a lot of firsts for our whole team.

- **Our first time deploying AI agents.** We went from never having built an agent to sixteen of them working together
  on Google's Agent Development Kit: tool-calling agents that run statistical tests, agents that review each other's
  proposals, and a live voice agent that calls our own tools mid-conversation. Every run is recorded and can be replayed
  step by step, so we can show exactly what each agent did.
- **Our first time hosting on cloud compute.** We took the app from a laptop to a public HTTPS site at askpulp.com:
  - packaged it as one Docker image;
  - provisioned a Vultr server;
  - put Caddy in front for automatic HTTPS;
  - wired a GitHub Actions pipeline that tests and redeploys on every push.

  When serverless hosting couldn't carry live voice, we moved to our own server.
- **Our first time doing serious data processing.** We reconciled a million transactions to the cent against the monthly
  summaries, engineered about 78 behavioural signals per account, clustered 4,500 accounts into six groups, and ran
  matched-pair and quartile studies.
- **A finding that holds up against real outcomes,** not just a simulation: the accounts our engine flags later had
  their loans go bad three times as often.
- **The judges' numbers, exactly:** the official formula implemented and tested, with a live twist answered in about a
  second, with or without AI.
- **Plans you could actually follow:** about 300 options searched per shock, four distinct finalists, each step dated
  and explained, and checked against the person's age, household and goals.
- **A codebase we trust:** 245 automated tests across the backend, the browser and voice, running on every push.

## What we learned

"Do I have enough saved?" is the wrong question. "How fast does my money leave when income drops?" is the one that
matters, and it's one you can change this month.

## What's next

Live bank feeds, real benefit rules, and plans you can follow month by month.

## Built with

`python` `fastapi` `pandas` `gemini` `google-adk` `gemini-live` `react` `typescript` `vite` `vultr` `docker`

## Sources

- PKDD'99 Discovery Challenge Financial dataset, CTU Prague Relational Dataset Repository:
  https://relational.fel.cvut.cz/dataset/Financial (via the Tangerine track)
- Government of Canada, Employment Insurance (55% income replacement):
  https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html
- Personas in the app are fictional. Other shock amounts are illustrative, sized from each account's own spending.
