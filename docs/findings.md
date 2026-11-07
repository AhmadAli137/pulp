# Findings

All numbers below are produced by `backend/scripts/analyze_population.py` from `monthly_summary.csv`
(4,500 accounts) using the sponsor definitions, and are stored in `docs/findings.json`. They are
**simulated outcomes** of a scenario applied to historical records, not observed events. The synthetic
fixture used in the calculation tests (I = $4,000, S = $3,600, H = $1,000, B = $6,200) is not part of
any finding.

## The first-minute finding

> We matched 2,238 pairs of accounts with near-identical inflows and hit both with the same six-month
> layoff at 55% income. In 78 pairs the account with **more** cash ran out **first**. Across all 4,486
> accounts, the cash buffer quartile told us almost nothing about who survives (rank correlation −0.02),
> while the spending-to-income ratio told us almost everything (rank correlation −0.75).

Chart: `docs/findings_chart.png` (left: survival by buffer quartile versus spending-ratio quartile;
right: the matched-pair outcomes). The same chart is rendered live on the Insights screen.

## Research question

Under the same income shock, how often does the account with more cash still run out first, and what
explains it?

## Population results (4,486 accounts with positive typical inflow; 14 excluded for I = 0)

| Measure | Result |
|---|---|
| Accounts with no monthly shortfall at baseline (S ≤ I) | 73.7% |
| Accounts that last 6 months at 55% income (layoff twist) | 64.4% (2,891) |
| Accounts with no shortfall even at 55% income | 5.0% |
| Median finite runway under the layoff twist | 8.0 months |
| Accounts that last 6 months under layoff **and** bills +15% (combined twist) | 61.0% (2,735) |
| Layoff survivors pushed below 6 months by the +15% bill increase | 156 of 2,891 (5.4%), median loss 0.9 months of runway |
| Accounts that ever had a negative end-of-day balance (observed) | 6.4% |

### Survival by quartile (six-month layoff at 55%)

| Quartile | By cash buffer B | By spending ratio S / I | By buffer in months of spending B / S |
|---|---|---|---|
| Q1 (lowest) | 69.8% | 99.2% | 2.6% |
| Q2 | 57.4% | 81.7% | 55.0% |
| Q3 | 57.9% | 51.7% | 98.0% |
| Q4 (highest) | 72.7% | 25.2% | 100.0% |

The dollar size of the buffer does not rank accounts by resilience (the pattern is U-shaped and flat).
The buffer **relative to spending** does, and within a given inflow the spending ratio is what moves it.

### Spending-ratio bands

| S / I | n | Last 6 months |
|---|---|---|
| under 0.7 | 897 | 99.9% |
| 0.7 to 0.8 | 454 | 95.4% |
| 0.8 to 0.9 | 703 | 82.6% |
| 0.9 to 1.0 | 1,255 | 54.6% |
| 1.0 and over | 1,177 | 25.1% |

### Variance decomposition

Among the 4,239 accounts with a shortfall under the layoff twist, log(runway) = log(B) − log(gap).
The monthly gap's variance accounts for 121% of the variance of log-runway, the buffer's for 25%, with
a −45% covariance term (log B and log gap are positively correlated, ρ = 0.42, because both scale with
account size). In plain terms: differences in the monthly gap, not in cash on hand, drive differences
in runway.

## Matched-pair results

Matching rule (fixed before inspecting outcomes): eligible accounts (I > 0) sorted by I, ties by
account id; adjacent accounts are paired when |I_a − I_b| / max(I_a, I_b) ≤ tolerance; accounts are
never reused; the walk is greedy and deterministic. A reversal is a pair with unequal buffers where the
larger-buffer account fails six months and the smaller-buffer account survives. Outcomes are
classified with full precision (unrounded runway ≥ 6).

| Run | Eligible | Pairs | Unmatched | Reversals | % of pairs | % of discordant pairs | Median buffer gap in reversals |
|---|---|---|---|---|---|---|---|
| 5% tolerance, layoff | 4,486 | 2,238 | 10 | 78 | 3.5% | 10.8% | $3,869 |
| 2% tolerance, layoff | 4,486 | 2,220 | 46 | 76 | 3.4% | 10.6% | $4,603 |
| 1% tolerance, layoff | 4,486 | 2,202 | 82 | 77 | 3.5% | 10.6% | $4,459 |
| 5% tolerance, combined | 4,486 | 2,238 | 10 | 80 | 3.6% | 10.7% | $3,660 |
| 2% tolerance, combined | 4,486 | 2,220 | 46 | 78 | 3.5% | 10.5% | $4,079 |
| 5% tolerance, layoff, ≥ 24 months of history | 3,651 | 1,818 | 15 | 52 | 2.9% | 9.0% | $4,583 |
| 2% tolerance, combined, ≥ 24 months | 3,651 | 1,806 | 39 | 53 | 2.9% | 8.8% | $5,906 |

No pair had exactly equal buffers. Reversals are **uncommon but stable**: 3.4 to 3.6% of all pairs
and roughly one in nine of the pairs where exactly one account survives, across every tolerance and
both twists; excluding short histories lowers it slightly to 2.9%.

**What explains the reversals.** In all 78 primary reversals the smaller-buffer account spends less
than its partner (median spending gap $3,940 a month) and has the smaller monthly gap. The median
spending ratio is 1.08 for the account with more cash and 0.79 for the one with less. The account with
more cash has a median 4.6 months of runway; its leaner partner has 9.0.

### Representative pair (primary run, closest to the median buffer gap)

| | Account 47788 (more cash) | Account 88789 (less cash) |
|---|---|---|
| Typical inflow I | $11,493 | $11,486 |
| Typical spending S | $10,927 | $9,555 |
| Buffer B | $25,792 | $21,219 |
| Income at 55% | $6,321 | $6,317 |
| Monthly gap | $4,606 | $3,237 |
| Runway | 5.6 months (fails) | 6.6 months (lasts) |

Account 47788 has $4,573 more in the bank but spends $1,372 more every month. Over six months that is
$8,235 of extra outflow, nearly twice the cash advantage.

## Practical consequence

For a customer, the number to watch is the monthly gap under the shock, not the balance. A $1,000 cut
in monthly spending is worth $6,000 of buffer over a six-month layoff. PULP's goal plan therefore
reports the gap-based need (C + 6 × gap) and the backup plan reports what must be freed per month.

## Observed distress versus simulated outcomes

Observed negative-balance days are rare (6.4% of accounts ever had one). Among those accounts, 74.9%
fail the simulated layoff; among accounts that never went negative, 32.9% still fail it. The simulation
flags vulnerability that the historical record does not show, which is the point of a stress test, but
it should not be read as a prediction that those accounts will experience distress.

## What we did not find or claim

- Reversals are not common; most pairs behave as expected or fail together. We do not generalize from the
  representative pair; it illustrates the mechanism the population numbers already show.
- We infer nothing about occupation, salary, net worth, household composition or veteran status.
- The strong inflow-quartile gradient (95.5% of the lowest-inflow quartile lasts six months versus 32.4%
  of the highest) reflects that high-inflow accounts in this dataset run spending ratios near 1; it is not
  evidence about real-world income groups.
