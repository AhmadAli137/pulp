# Judging map

| Criterion | Weight | Where it is in PULP |
|---|---|---|
| Discovery | 35% | Insights screen and `docs/findings.md`: research question, fixed matching rule, 2,238 pairs, 78 reversals (3.5%), quartile contrast (buffer 70/57/58/73% vs spending ratio 99/82/52/25%), rank correlations −0.02 vs −0.75, variance decomposition, seven sensitivity runs, representative pair, practical consequence |
| Data Use | 25% | Exact sponsor formulas with "show the math"; loan rule; population table cross-checked against per-account recomputation; cohort matching with stated denominator; observed negative-balance days kept separate from simulated outcomes; simulation calibrated on the account's own months; assumptions labelled on every plan |
| Communication | 25% | One finding in the first minute (Insights hero, chart with two panels); live twist on one screen with verdict, "why did this change", results table that needs no colour; before-and-after replanning with reasons |
| Impact | 15% | Goal plan (dollars and months) before the shock, backup plan (immediate need and monthly amount) if it hits, unresolved gap stated when neither covers the horizon; roadmap with amounts, effects, trade-offs and review triggers; context the customer controls and can delete |

## Live-twist checklist (three minutes)

1. Type the judge's `account_id` into Pip's box on Home (or the top-right box). Read the stats strip; Shock Lab has the five full tiles with show-the-math.
2. Read the twist card to Pip in plain words, or pick the preset / type exact values in Shock Lab (income %, bills %, one-time $, months).
3. Read the verdict line and the official runway; point at "why did this change".
4. Read the goal plan ("before") and backup plan ("if it happens") amounts; mention the tipping point if asked "how much more could bills rise?".
5. If time allows: Explore Futures for the fan chart, or Insights for where the account sits among peers.

## Definition-of-done evidence

- Any valid id: `GET /api/customers/{id}` works for all 4,500; unknown ids return a clear 404.
- Expected outputs for the presets are recomputed from the formula in tests and checked against the API.
- Covered edge cases: exhausted buffer, no shortfall, capped runway, one-off cost, combined shock, exact horizon, unrounded vs displayed runway, short history, zero household bills, zero surplus.
- Synthetic fixture check (4.0 months, $3,100) is a unit test, not a finding.
- 47 backend tests pass; frontend type-checks and builds; a Playwright run of every screen reports no console errors.
