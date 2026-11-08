# PULP — Planning Under Life's Pressures. Prepare for what comes next.

**Draft updated November 8, 2026.** This local file has not been published to Devpost by this update.

**Track:** Tangerine, Resilience Rewired · Sheridan Datathon 2026

## The question we asked

Under the same income shock, how often does the customer with more cash still run out first, and what actually
decides who makes it?

## What we did

We built PULP, a financial resilience engine a bank could offer inside its app. A judge enters any
`account_id`; PULP shows the official Tangerine metrics (typical inflow, spending, fixed costs, household
bills, buffer, runway) with the math visible, applies any shock with exact inputs (income retained, bill
increase, one-time cost, duration) and returns the official runway, a verdict for the horizon, why it changed, a
goal plan before the shock and a backup plan if it hits. A Monte Carlo explorer calibrated on the account's own
months shows the range of futures and five branching paths. A conversational companion (Gemini with tools, or a
deterministic offline engine) learns goals, worries and constraints, proposes structured memory updates the
customer confirms, and then the plan engine reruns strategies and shows a before-and-after with reasons.

## What we found

We matched 2,238 pairs of accounts with near-identical inflows (within 5%) and applied the same six-month layoff
at 55% income. In 78 pairs (3.5%) the account with **more** cash ran out **first**; in every one of them the
leaner account spent less (median $3,940 a month less) despite holding $3,869 less cash. The result is stable
across 1%, 2% and 5% tolerances and the combined layoff-plus-bills shock, and drops to 2.9% when accounts with
fewer than 24 months of history are excluded.

The population view explains why. Across 4,486 accounts, survival of a six-month layoff by cash-buffer quartile is
70%, 57%, 58%, 73%: essentially flat (rank correlation −0.02). By spending-to-income quartile it is 99%, 82%,
52%, 25% (rank correlation −0.75). The variance of log-runway is driven by the monthly gap, not by cash on hand.
Practical consequence: over a six-month layoff, every $1,000 cut from monthly spending is worth $6,000 of buffer.
A 15% rise in household bills pushes 156 of 2,891 layoff survivors (5.4%) below six months.

All of these are simulated outcomes under the sponsor formula applied to historical records; observed
negative-balance days (6.4% of accounts) are reported separately.

## How it works

FastAPI + pandas backend with pure, tested implementations of the sponsor formulas; React + Recharts frontend;
structured JSON memory with confirmation and versioning; strategy comparison with explicit weights; Gemini
optional for deterministic calculation. The current workspace shares one native Gemini Live/text workflow and a versioned active plan. Strategist proposals are validated before Challenger review. Evidence-driven profiles ask about missing context rather than assuming transfers or card spending can be cut. The November 8 code verification passed 126 backend tests and 13 browser tests, plus a voice-client regression. Research scripts, assumptions and limitations are documented.

See the [current product guide](../docs/product.md) and [limitations](../docs/limitations.md). Arbitrary Excel ingestion, live bank feeds and autonomous financial actions are not implemented.

## Sources

- PKDD'99 Discovery Challenge Financial dataset (anonymized bank data), CTU Prague Relational Dataset
  Repository: https://relational.fel.cvut.cz/dataset/Financial (supplied via the Tangerine track)
- Government of Canada, EI regular benefits: https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit.html
  (55% replacement rate and 14–45 week duration note)
- No other external numerical values were used.
