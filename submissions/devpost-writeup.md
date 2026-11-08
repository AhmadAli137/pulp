# PULP: Planning Under Life's Pressures

**Tagline (Devpost, 60 characters):** Squeezing a plan for what comes next out of your bank records

**Track:** Tangerine, Resilience Rewired · Sheridan Datathon 2026
**Live demo:** https://askpulp.com · **Code:** https://github.com/AhmadAli137/pulp

Paste each section below into the matching Devpost field. Every number comes from the engine or the research scripts in
the repository; simulated results and recorded outcomes are labelled as such.

---

## Inspiration

Most people find out how fragile their money is on the day something goes wrong. A bank already holds the evidence:
years of what comes in, what goes out and how the balance moved. Nobody reads it for you, and nobody turns it into a
plan before you need one.

We wanted a bank customer to open one page and know three things in a minute: how am I doing, what happens if life
hits me, and what exactly should I do about it.

## What it does

Pick any account. PULP reads its records and answers in plain words, with the judges' exact formulas behind every
number.

**1. How am I doing?** Overview shows money in, money out, the cushion and how long it lasts, and **the single most
important thing PULP found in your records**, ranked by how serious it is, how rare it is across all 4,500 accounts and
how unlikely you are to notice it yourself.

> Account 74916: $12,406 comes in and $12,159 goes out in a typical month. Biggest discovery: *"Never negative, yet
> fails a layoff."* The record looks spotless, but six months on EI would empty the $16,682 cushion. 31% of accounts
> share this blind spot.

**2. What if life happens?** Shocks deals four face-down cards: the brief's three twists, plus a deck dealt for this
person. A recession or a lost client for a cash earner, a payment reset for a borrower, a wildfire evacuation in a
rural district. Every card gives the official runway, a month-by-month cushion chart, a **Prepare now** plan and an
**If it happens** plan.

> Layoff at 55%: $5,336 short every month, the cushion is empty after 3.1 months, $15,334 short by month 6.

**3. What should I do?** For any shock, or for the next five years, PULP's agents build about **300 multi-step plans**
from real decisions: a weekend job, paid advice in your field, moving bill dates after payday, refinancing, delaying a
goal, starting CPP at 60. They throw out the ones that don't fit this person's life and keep **four distinct
finalists**: the one that covers the gap best, the strongest cushion, the furthest toward your goals, and the best
balance. Every step says which insight from your records it rests on and what it changes. Plans that still fall short
are shown too, for contrast.

> For account 74916: 320 plans tried, 237 screened out (120 because they don't suit a 58-year-old in a shared rural
> household, such as gig delivery work or a lodger). All four finalists get her through the layoff without running
> short.

**4. Talk it through.** Pulp, a tangerine companion, answers by text or **live voice (Gemini Live)**. Mention something
that might happen ("I might lose my job", "a hospital bill of 4,000", "what if a recession hits") and the planners run
on it. Tell Pulp a goal and the profile updates straight away; every change is logged and one tap undoes it. Every
section has an **Explain this** button: the simplest, most relatable version, with your numbers.

### What you get from it

| | |
|---|---|
| **Time** | Years of statements read in seconds, instead of hours with a spreadsheet. |
| **Money** | Avoidable costs found in your own records (overdraft interest, above-normal fees, a December that costs 1.5x), and the shortfall a plan prevents if a shock hits. |
| **Perspective** | The one thing your records reveal that you would not see yourself, and how you compare with people of your age, household and district. |
| **Control** | You see any shock before it happens, choose between four real plans, and nothing changes in your profile that you cannot undo. |

## Our biggest finding

**Spending, not savings, decides who makes it.**

We ran the same six-month layoff (income at 55%) on all 4,500 accounts. Grouped by how much cash they hold, survival
barely moves: **70%, 57%, 58%, 73%** by quartile. Grouped by how much of their income goes back out, it falls from
**99% to 25%**. In this bank, the size of the cushion is almost unrelated to the size of the leak. The leak is what
matters.

**It holds up against what really happened.** These are simulations, so we checked them against outcomes that were
actually recorded. Among the 682 accounts with a loan, those our engine says would not last a six-month layoff later
had the loan go bad **14.3%** of the time, against **4.8%** for those it says would. Uneven income: 20.5% against 5.3%.
A sliding balance: 28.4% against 8.8%.

**And more cash can still run out sooner.** In 78 of 2,238 pairs of accounts with near-identical income, the one with
more cash ran short first under the same shock, because it spent more each month.

Method, denominators and caveats: [docs/findings.md](https://github.com/AhmadAli137/pulp/blob/master/docs/findings.md).

## How we built it

**Agents interpret, code calculates.** No model ever produces a number. The engine is deterministic Python tested
against the judges' definitions (I, S, F, H, B, P, runway, the 120-month cap, rounding). The agents decide what to look
at, what to ask and how to say it, and every number in their words is checked against the engine before it is shown.

Sixteen agents work in three stages, all visible and replayable step by step on the **Agents** page:

- **Stage 1, from records to a person:** a Schema Scout maps the columns, a Feature Forge computes about 78 behavioural
  signals per account (payday and bill dates, penalty interest, recurring transfers, past income drops and how the
  household responded), a Pattern Hunter tests patterns across all accounts with statistical tools, an Archetype Namer
  labels six behavioural groups, and a Persona Builder imagines a realistic, clearly fictional person who fits the
  records, with goals weighted by importance and time horizon and a one-line quote in their own voice.
- **Stage 2, getting to know you:** the Companion turns what you say into profile updates, and the Director decides
  what to show and say, and starts Stage 3 when you mention a shock or a decision.
- **Stage 3, when life happens:** the Shock Generator and Shock Dealer pick shocks that fit this life, the Life Planner
  searches hundreds of plans, the Life Fit Assessor rules out what doesn't suit the person's age, health, time and
  household, the Validator and Ranker keep the Pareto set, and the Strategist and Challenger propose and stress-test
  options.

The planner optimises one stated objective, printed with every result: gap covered, cushion and weighted goal progress,
minus disruption and poor life fit.

**Stack:** FastAPI and pandas; Google Agent Development Kit with Gemini 3.5 Flash for the model roles; Gemini 3.8 Live
native audio through a server-side WebSocket relay; React 19, TypeScript, Vite, Zustand, Framer Motion and Recharts.
Hosted on Vultr in one Docker image behind Caddy, deployed on every push by GitHub Actions. 229 backend tests and 12
browser tests run on every change. Without an AI key, everything still works: the calculator, plans and cards are
deterministic, and the agents are labelled offline.

## Challenges we ran into

- **Keeping models honest.** Captions, quotes and explanations are checked against the engine's numbers; a model
  rewrite that adds a number is rejected.
- **Making simulations credible.** We validated the layoff test against recorded loan outcomes before trusting it.
- **Plans that fit a life, not just a spreadsheet.** A first version suggested a weekend delivery job to a 58-year-old
  in a rural district. The Life Fit Assessor now checks every decision against age, physical capacity, household time
  and place.
- **A quarter of accounts have no labelled household bills,** so a bills shock cannot move their spending. PULP says so
  instead of reporting a misleading "no change", and turns price shocks into extra spending for those accounts.

## Accomplishments we're proud of

- The official numbers match the judges' definitions exactly, and a live twist runs in about a second.
- A discovery that holds up against real outcomes, not just a simulation.
- Agents a judge can watch: every run is recorded and replayable with its full log.
- A plan you could actually follow, with dates, reasons and the insight behind each step.

## What we learned

The question people ask, "do I have enough saved?", is the wrong one. "How fast does my money leave when income drops?"
predicts survival far better, and it is something a person can change this month.

## What's next

Live bank feeds instead of historical records; benefits eligibility (EI weekly maximum, CPP timing) from official
sources; and letting the customer accept a plan and track it month by month.

## Built with

`python` `fastapi` `pandas` `numpy` `google-adk` `gemini` `gemini-live` `react` `typescript` `vite` `zustand`
`framer-motion` `recharts` `docker` `caddy` `vultr` `github-actions` `pytest` `playwright`

## Sources

- **Data:** PKDD'99 Discovery Challenge Financial dataset (real anonymized bank data), CTU Prague Relational Dataset
  Repository: https://relational.fel.cvut.cz/dataset/Financial, supplied via the Tangerine track (amounts in CAD).
- **Government of Canada, Employment Insurance** (55% income replacement used for the layoff, sickness and parental
  cards): https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html ·
  https://www.canada.ca/en/services/benefits/ei/ei-sickness.html ·
  https://www.canada.ca/en/services/benefits/ei/ei-maternity-parental.html
- No Statistics Canada tables were used. District figures come from the dataset's own district table (Czech
  districts). Other deck amounts (repairs, rent and bill rises, world events) are illustrative multiples of each
  account's own spending, not values from a published source. Personas and their quotes are fictional.
