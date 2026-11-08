# Methodology

## 1. Data used

| File | Rows | Use |
|---|---|---|
| `monthly_summary.csv` | 185,326 (4,500 accounts, 12–72 months each, 2020-01 to 2025-12) | All official metrics, history charts, cohort matching, simulation calibration, discovery |
| `loans.csv` | 682 | Active loan payment P (status C or D) |
| `accounts.csv`, `districts.csv` | 4,500 / 77 | ID validation, district name shown on the profile |
| `standing_orders.csv` | 6,471 | Recurring obligations shown on the twin (snapshot only) |

The preserved data audit and regression checks report: no missing values; every account has at
least 12 monthly rows; the parts of `money_in` and `money_out` sum exactly to the totals; 14 accounts have a
zero median inflow and are excluded from cohort and discovery analyses (they still get a profile and shock
calculation). `transactions.csv` is not loaded by the API; the monthly summary is derived from it.

## 2. Official metrics

Implemented in `backend/app/services/tangerine_metrics.py` exactly as the event README defines them. Medians
are taken over all available months; the buffer uses the last six rows sorted by month with quiet months kept.
The population table (`financial_profiles.py`) recomputes the same quantities with vectorised pandas and is
cross-checked against the per-account function in tests.

## 3. Shock and plans

For retained income `r`, bill increase `h`, one-off cost `C`, and horizon `T`:

```text
income_after = r * I
spending_after = S + h * H
buffer_left = B - C
gap = spending_after - income_after
```

Official `I` and `S` are medians of monthly inflow and outflow. `F` is the median of each month's bills + insurance + loan payments; `H` is median bills; `B` is the mean average daily balance of the last six monthly rows; `P` is the payment on a running loan (status C or D). Fixed costs are already inside `S` and must not be added again.

Runway is zero if the remaining buffer is exhausted, no shortfall when the remaining buffer is positive and `gap <= 0`, otherwise `buffer_left / gap`, with a display cap of 120 months. Display rounding does not determine the horizon verdict. See [`tangerine_metrics.py`](../backend/app/services/tangerine_metrics.py) for all boundary cases.

Plans:

- Goal reserve: `need = C + T * max(0, gap)`; `additional = max(0, need - B)`. If additional reserve is needed and `I - S` is positive, months to build it is `additional / (I - S)`. Otherwise it cannot be built from that estimated surplus alone. This is the calculator's reserve calculation, not an invented personal goal budget.
- Backup: `immediate = max(0, C - B)` and `recurring = max(0, gap)`. If `buffer_left <= 0`, monthly improvement needed is `recurring`, separately from today's immediate need. Otherwise it is `max(0, gap - buffer_left / T)`.
- Total uncovered amount over the horizon: `max(0, recurring * T - max(0, buffer_left)) + immediate`. Do not count the upfront funding gap twice or treat later income as paying today's bill.
- Tipping point, when applicable: `h_max = (buffer_left / T - (S - r * I)) / H`. The implementation handles zero bills, exhausted buffer and a baseline that already fails explicitly.

## 4. Discovery

Rules were fixed before inspecting outcomes and are documented in `backend/scripts/analyze_population.py` and
`docs/findings.md`: eligibility I > 0; greedy adjacent pairing on inflow with tolerance 5% (sensitivity 2%, 1%)
using max(I_a, I_b) as the denominator, deterministic tie-breaking by account id, no reuse; survival = unrounded
runway ≥ 6 under r = 0.55; combined variant adds h = 0.15; a run with ≥ 24 months of history checks the effect
of short histories. The population-level analysis adds quartile tables, Spearman rank correlations and a
variance decomposition of log(runway) = log(B) − log(gap). Observed negative-balance days are reported
separately from simulated outcomes.

## 5. Cohort comparison

Peers are accounts with I within ±5% of the selected account's I (widened to 10% if fewer than 20 peers).
The screen shows medians, within-cohort percentiles and a runway histogram under the layoff twist.

## 6. Scenario simulation

`scenario_engine.py` projects month by month. Monte Carlo paths resample paired inflow/outflow months from the same account and scale them to the official typical-month values. The chosen shock applies over its specified window; one-off costs and strategy rules are explicit.

The deterministic path agrees with official calculations in aligned constant-flow cases. Discrete monthly boundaries differ from fractional runway. Upfront expenses and initially negative balances are checked explicitly; a plotted month-end balance can hide an earlier intramonth funding shortfall. Seeds make modeled results reproducible, not predictive.

## 7. Planning and personal feasibility

The shared active council plan is distinct from the retained four-strategy fallback comparison. The council freezes metrics, the explicit shock, goal, weights, confirmed context and decision profile; it scores a grid, optionally adds Strategist proposals, re-scores them in code, then has the Challenger review those actual candidates before ranking. The objective includes shortfall resilience, goal progress and disruption, with review penalties. Inspect `council.py` for current coefficients rather than copying them into a second implementation.

Confirmed spending limits bound grid and model proposals. Capacity must cover an existing deficit before it can fund a goal. Unknown non-emergency goal budgets remain unknown; a conversational council call asks for budget/date before substituting a personal goal. Legacy paths and modeled scenario defaults remain disclosed assumptions, not user-confirmed details.

`life_actions.py` translates levers into conditional choices. Card/cash totals do not establish cuttable spending. Unexplained transfers require a purpose, extra income requires realistic capacity, and reserve targets require life context. `needs_context` identifies unresolved feasibility questions. Numeric ranking is not a guarantee of suitability.

## 8. Evidence-driven questions

`decision_profile.py` computes the median of paired monthly `money_in - money_out` over up to the latest six recorded rows, plus the lowest monthly room. This is not necessarily equal to the difference of the all-history medians `I - S`. Both figures retain their own meaning.

The profile joins those observations with transfer, timing, pension and fee signals and confirmed goals/constraints. It returns evidence, source periods, possible life effects, the question needed and the decision it unlocks. Goal timing and budget gaps receive explicit attention; confirmed answers suppress corresponding unknowns. Intake uses heuristic relevance and repetition penalties. There is no claim of learned optimal question selection.

The deterministic purchase-comparison tool uses an explicitly supported price, describes retaining money versus the cost, and discloses historical cash-flow assumptions. It does not certify affordability. The Director is instructed to ask about present circumstances and protected costs.

## 9. Context and shared plans

`context_manager.py` stores proposals separately from confirmed structured facts, checks versions on confirmation and retains conversation history. `planning_session.py` publishes the active result against its context version. Conversation, Goals and Roadmap share it; Explore initializes from its scenario and levers. Confirmation can rerun the same scenario. Stale results need review.

`feedback_loop.py` retains before/after snapshots and materiality comparisons. Context confirmation, a computed plan and execution of a financial action are different things: the application never executes transactions. The historical approval-receipt/acceptance protocol is still a proposal.

## 10. Reproduction and validation

Use [testing](testing.md) for current commands and actual CI coverage. [Findings](findings.md) and the committed JSON artifacts retain their original denominators. Rebuilding features or research is an explicit batch operation, not evidence of a live bank feed.
