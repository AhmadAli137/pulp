# Methodology

## 1. Data used

| File | Rows | Use |
|---|---|---|
| `monthly_summary.csv` | 185,326 (4,500 accounts, 12–72 months each, 2020-01 to 2025-12) | All official metrics, history charts, cohort matching, simulation calibration, discovery |
| `loans.csv` | 682 | Active loan payment P (status C or D) |
| `accounts.csv`, `districts.csv` | 4,500 / 77 | ID validation, district name shown on the profile |
| `standing_orders.csv` | 6,471 | Recurring obligations shown on the twin (snapshot only) |

Checks performed (`scripts/inspect` logic in the data store and tests): no missing values; every account has at
least 12 monthly rows; the parts of `money_in` and `money_out` sum exactly to the totals; 14 accounts have a
zero median inflow and are excluded from cohort and discovery analyses (they still get a profile and shock
calculation). `transactions.csv` is not loaded by the API; the monthly summary is derived from it.

## 2. Official metrics

Implemented in `backend/app/services/tangerine_metrics.py` exactly as the event README defines them. Medians
are taken over all available months; the buffer uses the last six rows sorted by month with quiet months kept.
The population table (`financial_profiles.py`) recomputes the same quantities with vectorised pandas and is
cross-checked against the per-account function in tests.

## 3. Shock and plans

See the README formulas. Verdicts use unrounded runway. Plans:

- Goal plan: `need = C + T × max(0, gap)`; `additional = max(0, need − B)`; months to target = additional ÷ (I − S)
  when the surplus is positive, otherwise reported as not reachable from surplus alone.
- Backup plan: `immediate = max(0, C − B)`; recurring gap = `max(0, gap)`; monthly improvement =
  `max(0, gap − buffer_left / T)` when the buffer survives the one-off, otherwise the whole recurring gap plus
  the immediate need. Unresolved gap over the horizon = `max(0, gap × T − buffer_left) + immediate`.
- Tipping point: `h_max = (buffer_left / T − (S − r × I)) / H`, with explicit cases for `H = 0`, `buffer_left ≤ 0`
  and a baseline that already fails.

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

Month-by-month projection (`scenario_engine.py`). Monte Carlo paths resample historical months of the same
account (money in and money out jointly) scaled so the typical month equals I and S; shocks apply over a
window; the one-off cost is charged at the shock start; strategy knobs are explicit dollar rules. The
deterministic path reproduces the official runway: with a 55% shock covering the horizon, cash first goes
negative in month ⌊runway⌋ + 1 (tested). Seeds make results reproducible.

## 7. Strategy comparison

Four explicit strategies (stay the course, buffer first, goal first, balanced) run under a stress scenario shaped
by confirmed concerns. Score = w_res × (1 − P(shortfall)) + w_goal × goal progress at the deadline, with weights
from stated preferences (default 50/50; safety 70/30; speed 30/70; +10% resilience when income loss or irregular
income is a concern). Infeasible strategies (no surplus and nothing stated as freeable) are shown as such.

## 8. Context, confirmation and replanning

Proposals are staged in `context_manager.py` and applied only on confirmation; each item records source,
timestamps and confirmation. `feedback_loop.py` reruns the comparison, stores a snapshot and diffs it against
the previous one, with explicit materiality thresholds (strategy change, goal change, ≥ 5 points of shortfall
probability, ≥ 10% change in the emergency target, stress change). If nothing material changed, it says so.

## 9. Testing

`backend/tests/` contains 47 tests: the synthetic arithmetic check from the brief, edge cases (exhausted
buffer, no shortfall, capped runway, exact horizon, unrounded vs displayed runway), per-account recomputation
against pandas for 12 sampled accounts, population-table consistency, the loan rule, API validation and 404s,
simulation reproducibility and the official-runway reproduction, the full propose → confirm → replan → diff
loop, the no-material-change case, the offline companion extraction and the signature replanning scenario, and
survival of a simulated Gemini outage.
