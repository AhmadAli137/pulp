# What PULP learned

PULP read 4,500 real, anonymized bank accounts, worked out about 79 signals for each, grouped them into 6 kinds of customer and tested every one against the same layoff. The clearest lesson: how much of your income you spend decides how long you last, far more than how much cash you hold.

## What we looked at

Real but anonymized records from a bank: 4,500 accounts, followed month by month from 2020-01 to 2025-12 (72 months). That is about 1.3 million rows across 9 tables, covering accounts, the people on them, cards, loans, regular payments, regions and every transaction. Amounts are shown in Canadian dollars. The data comes from the PKDD'99 Discovery Challenge, published by CTU Prague, and was supplied for the Tangerine track.

| Table | Rows | What it holds |
|---|---|---|
| Accounts | 4,500 | one row per account: branch district, opening date, statement frequency |
| Clients | 5,369 | people linked to accounts: birth year, gender, home district |
| Dispositions | 5,369 | who may use each account (owner or authorised user) |
| Cards | 892 | debit and credit cards issued, with card type |
| Loans | 682 | one loan per borrower: amount, term, monthly payment, status at end of 2025 |
| Standing orders | 6,471 | recurring payment instructions: amount, purpose, recipient bank |
| Districts | 77 | regional context: average salary, unemployment, population |
| Monthly summaries | 185,326 | one row per account per month: money in and out by type, balances, days below zero |
| Transactions | 1,056,320 | every individual transaction (used offline to build payday, bill and penalty signals) |

## What PULP works out for every account

Before anyone says a word, PULP turns each account's history into about 79 signals. They answer simple questions: how much comes in and goes out, how steady the income is, whether bills arrive before payday, whether fees and penalty interest show up, what happened the last time income fell, whether there is a loan, and how the account compares with its region. The {sum(g[1] for g in grows)} main ones fall into seven groups.

| Group | Signals | What it tells us |
|---|---|---|
| Money in and out | 18 | how much arrives, how much leaves and where it goes |
| Regularity and timing | 10 | how steady income is and whether bills land before payday |
| Habits and fees | 10 | slow drifts in spending and the cost of running short |
| History of income drops | 6 | what happened the last times income fell, and how the household reacted |
| Loans | 3 | running loans, their weight and whether they are in trouble |
| People and place | 15 | who holds the account, where, and who they pay regularly |
| Resilience under the official shocks | 4 | the judges' runway formula applied to every account |

## 6 kinds of customers

Accounts fall into 6 groups that behave alike. The groups are found by the data, then named. 'Retired Pension Earners' is the safest: 99% would get through a six-month layoff. 'Irregular High Cash Earners' is the most exposed at 36%. Life stage and job are educated guesses from behaviour, not facts about anyone.

| Group | Accounts | Share | Last a 6-month layoff | Likely life stage |
|---|---|---|---|---|
| Regular Cash Wage Earners | 1,721 | 38% | 62% | Mid-career / Working age |
| Retired Pension Earners | 740 | 16% | 99% | Retirement / Senior |
| Digital Transfer Low Earners | 720 | 16% | 69% | Working age |
| Irregular High Cash Earners | 631 | 14% | 36% | Mid-career / Working age |
| High Earners With Loans | 434 | 10% | 36% | Mid-career / Working age |
| Young Deficit Cash Handlers | 254 | 6% | 91% | Young adult / Student |

## What we found: spending matters more than savings

We hit every account with the same six-month layoff, keeping 55% of income. Sorting people by how much cash they hold barely changes who makes it (70% of the lowest-cash quarter versus 73% of the highest). Sorting them by how much of their income they spend changes everything: 99% of the leanest spenders make it, against 25% of the heaviest. And in 78 of 2,238 pairs of people with almost the same income, the one with more cash ran out first, because they also spent more.

| Quarter of accounts | Sorted by cash: make it 6 months | Sorted by share of income spent: make it 6 months |
|---|---|---|
| Group 1 (lowest) | 70% | 99% |
| Group 2 | 57% | 82% |
| Group 3 | 58% | 52% |
| Group 4 (highest) | 73% | 25% |

## What the Pattern Hunter noticed

An AI analyst was given tools to query the signals (it cannot invent numbers) and made 31 queries. Its strongest observation: Pension-dependent households show near-total six-month layoff survival. Each finding below is backed by one of those queries; the technical report lists the evidence and the caveat for each.

| Finding | How strong |
|---|---|
| Every borrower flagged 'Goes negative on timing, not shortage' saw the loan go bad | strong |
| No borrower flagged 'Never negative, yet fails a layoff' saw the loan go bad | strong |
| Loans went bad 3.2x as often with 'Balance trending down' | strong |
| Loans went bad 3.9x as often with 'Uneven income' | strong |
| Failing the simulated layoff lines up with real loan trouble | strong |
| Balance sliding flag predicts significantly reduced layoff survival | strong |
| Prior weathered income drop strongly predicts layoff survival | strong |
| Inflow volatility negatively correlates with layoff runway and survival | strong |
| Fee bleed flag counterintuitively associates with high layoff survival due to low base spending | strong |
| Pension-dependent households show near-total six-month layoff survival | strong |
| Loan stress drastically reduces layoff survival despite average buffer size | strong |
| Older account owners demonstrate higher six-month layoff survival | strong |
| Historical maximum drawdown share strongly predicts layoff survival | strong |

## Does it match real life?

The simulations are a model, so we checked them against something that actually happened: loans. Of 682 accounts with a loan, 76 had the loan go bad. Where PULP says an account would not last a six-month layoff, 14.3% of loans went bad, against 4.8% where it says the account would. The table shows how often loans went bad with and without each warning sign: 9 of 11 signs came with more bad loans. Groups are small and the causes overlap, so this is support, not proof.

| Warning sign | Accounts with it | Loan went bad: with | Loan went bad: without |
|---|---|---|---|
| Goes negative on timing, not shortage | 19 | 100% | 9% |
| Uneven income | 264 | 20% | 5% |
| Uneven cash income | 265 | 20% | 5% |
| Balance trending down | 81 | 28% | 9% |
| Has been through an income drop and stayed above zero | 18 | 22% | 11% |
| Spending close to income | 388 | 14% | 7% |
| Cuts spending fast when income drops | 45 | 20% | 10% |
| Spending growing faster than income | 126 | 18% | 10% |
| Bills taking a growing share | 62 | 13% | 11% |
| Regular transfer out | 230 | 8% | 13% |
| Never negative, yet fails a layoff | 389 | 0% | 26% |

## What to keep in mind

- The shocks are simulations: they show what the records imply, not what will happen.
- Some checks reuse the same numbers they test, so agreement is partly built in.
- Loan status is a single snapshot, not a full history.
- Names, jobs, families and goals in personas are made up to make the numbers relatable. They describe no real person.
- About a quarter of accounts have no labelled household bills, so a bills increase cannot change their spending.

# Stage 1 technical report

Stage 1 pipeline: schema mapping → 79-column feature table → agentic pattern search (31 tool calls, 13 findings) → k-means archetypes (k=6) → flag rules → narrative. All statistics deterministic (pandas); models only choose tools and phrase findings.

## Data sources and coverage

Source: PKDD'99 Discovery Challenge Financial dataset (CTU Prague Relational Dataset Repository, relational.fel.cvut.cz/dataset/Financial), re-expressed by the organisers as monthly summaries in CAD. Coverage: 4,500 accounts, 185,326 account-months, 2020-01 to 2025-12 (72 calendar months). The engine reads monthly_summary.csv and loans.csv; the other tables feed behavioural signals. transactions.csv (1,056,320 rows) is processed offline into payday, bill-date, penalty-interest and recurring-partner features (backend/scripts/build_tx_features.py) and is not needed at run time.

| File | Rows | Shipped in data/ | Contents |
|---|---|---|---|
| accounts.csv | 4500 | yes | one row per account: branch district, opening date, statement frequency |
| clients.csv | 5369 | yes | people linked to accounts: birth year, gender, home district |
| dispositions.csv | 5369 | yes | who may use each account (owner or authorised user) |
| cards.csv | 892 | yes | debit and credit cards issued, with card type |
| loans.csv | 682 | yes | one loan per borrower: amount, term, monthly payment, status at end of 2025 |
| standing_orders.csv | 6471 | yes | recurring payment instructions: amount, purpose, recipient bank |
| districts.csv | 77 | yes | regional context: average salary, unemployment, population |
| monthly_summary.csv | 185326 | yes | one row per account per month: money in and out by type, balances, days below zero |
| transactions.csv | 1056320 | no (offline) | every individual transaction (used offline to build payday, bill and penalty signals) |

## Official definitions (judges' formulas)

Every number in PULP comes from these definitions, computed in Python. No model produces or edits a number.

| Symbol | Name | Definition |
|---|---|---|
| I | Typical money in | median of monthly money_in |
| S | Typical spending | median of monthly money_out |
| F | Fixed costs | median of household_bills + insurance + loan_payments (shown, not added again) |
| H | Household bills | median of monthly household_bills |
| B | Cash buffer | mean of avg_daily_balance over the last six months |
| P | Loan payment | monthly_payment if the loan is still running at the end of 2025 |
| Shock | Income and spending after | income = r x I; spending = S + h x H; one-off cost taken from B first |
| Runway | Months the buffer lasts | (B - one-off) / (spending after - income after); 0 if the buffer is gone, 'no shortfall (120+)' if income still covers spending, otherwise capped at 120 |

## Feature engineering

The feature table (backend/app/services/features.py, get_features) has 79 columns per account, 66 of them documented below, built from monthly summaries, account, client, card, district, loan and standing-order tables plus offline transaction features. Shares are fractions of typical inflow or outflow; trends are per-month slopes; history features detect months where income fell at least 30% below its trailing median and follow the response (resilience_history.py).

| Signal | Group | Definition |
|---|---|---|
| I | Money in and out | typical monthly inflow (median money_in) |
| S | Money in and out | typical monthly spending (median money_out) |
| H | Money in and out | median household bills |
| B | Money in and out | cash buffer (mean avg_daily_balance, last 6 months) |
| P | Money in and out | running loan payment |
| months | Money in and out | months of history |
| spending_ratio | Money in and out | S / I |
| surplus | Money in and out | I - S |
| income_cv | Regularity and timing | inflow volatility (std / mean) |
| inflow_regular_share | Regularity and timing | share of months with inflow within 20% of the median |
| pension_share | Money in and out | share of inflow that is pension |
| cash_deposit_share | Money in and out | share of inflow deposited as cash |
| transfer_in_share | Money in and out | share of inflow arriving as transfers |
| bills_share | Money in and out | household bills / outflow |
| insurance_share | Money in and out | insurance / outflow |
| loan_share | Money in and out | loan payments / outflow |
| fee_share | Money in and out | bank fees and penalty interest / outflow |
| cash_wd_share | Money in and out | cash withdrawals / outflow |
| card_wd_share | Money in and out | card spending / outflow |
| transfer_out_share | Money in and out | unlabelled transfers out / outflow |
| fee_months_share | Habits and fees | share of months with any bank fee |
| neg_months_share | Regularity and timing | share of months with a negative-balance day |
| neg_days | Regularity and timing | total days below zero |
| timing_dip_share | Regularity and timing | of negative months, share where inflow still covered outflow (timing, not shortage) |
| spending_drift_pm | Habits and fees | monthly trend of spending over the last 24 months, as a share of S |
| income_drift_pm | Habits and fees | monthly trend of inflow over the last 24 months, as a share of I |
| lifestyle_creep | Habits and fees | spending drift minus income drift (positive = spending growing faster than income) |
| balance_trend_pm | Habits and fees | monthly trend of the average balance over the last 12 months, as a share of B |
| bills_share_trend | Habits and fees | bills share in the last 12 months minus the prior 12 months |
| december_spend_ratio | Regularity and timing | December spending / S |
| max_drawdown_share | Habits and fees | largest fall in month-end balance from its running peak, as a share of B |
| regular_transfer_out | People and place | recurring unlabelled transfer out most months with a stable amount |
| regular_transfer_out_amount | People and place | median monthly amount of that recurring transfer |
| loan_payment_share | Loans | running loan payment / I |
| has_running_loan | Loans | loan running at end of 2025 |
| loan_in_debt | Loans | loan status D |
| owner_age | People and place | account owner's age at end of 2025 |
| n_authorized_users | People and place | authorized users on the account |
| card_rank | People and place | 0 none, 1 junior, 2 classic, 3 gold |
| account_age_years | People and place | years since the account was opened |
| district_salary | People and place | average monthly salary in the branch district |
| inflow_vs_district_salary | People and place | I / branch district average salary |
| district_unemployment | People and place | branch district unemployment rate 2023 (%) |
| n_standing_orders | People and place | standing orders on the account |
| so_unlabelled_amount | People and place | monthly standing orders with no stated purpose |
| shock_episodes | History of income drops | times inflow fell at least 40% below the account's own trailing six-month median |
| worst_income_drop | History of income drops | deepest observed income fall, as a share of the norm |
| spending_response | History of income drops | how much spending fell relative to income in those months (1 = fully, 0 = not at all, negative = spent more) |
| episode_dipped_negative | History of income drops | an observed income fall ended with a negative-balance day |
| recovery_months | History of income drops | months after an episode until the average balance was back to its pre-episode level |
| last_episode_months_ago | History of income drops | months since the last observed income fall |
| payday_dom | Regularity and timing | day of the month the main inflow usually lands (from transactions.csv) |
| payday_regular_share | Regularity and timing | share of months where the main inflow landed within two days of that day |
| bill_dom | Regularity and timing | day of the month labelled bills usually leave |
| bills_before_pay_share | Regularity and timing | share of months where the first bill left before that month's pay arrived |
| penalty_events | Habits and fees | penalty-interest postings for a negative balance |
| penalty_total | Habits and fees | total penalty interest paid |
| penalty_months | Habits and fees | months with penalty interest |
| recurring_partner_amount | People and place | stable monthly transfer to one other account (>= 6 months, steady amount) |
| recurring_partner_months | People and place | months that transfer occurred |
| recurring_partner_purpose | People and place | recorded label on that transfer, such as loan payment, household bills, or insurance |
| n_partners_out | People and place | distinct accounts money is sent to |
| runway_layoff | Resilience under the official shocks | official runway under the 55% layoff (months; inf = no shortfall) |
| survives6_layoff | Resilience under the official shocks | runway_layoff >= 6 |
| runway_combined | Resilience under the official shocks | official runway under layoff + bills +15% |
| survives6_combined | Resilience under the official shocks | runway_combined >= 6 |

## Behavioural archetypes

Method: k-means on standardised behavioural features (n_init=10, seed 42), clusters relabelled by size. Inputs (16 standardised features): pension_share, cash_deposit_share, transfer_in_share, income_cv, inflow_regular_share, spending_ratio, bills_share, card_wd_share, cash_wd_share, transfer_out_share, neg_months_share, log_I, buffer_months, has_running_loan, owner_age, account_age_years. Names, descriptions, life stage and occupation guesses: google-adk/gemini-3.5-flash, constrained to the cluster medians; confidence is the namer's own estimate. Survival uses the official runway with r=0.55, h=0, six-month horizon.

| ID | Name | Size | Share | Survive 6m layoff | Median runway | Occupation / life stage | Confidence | Most distinguishing (z vs population) |
|---|---|---|---|---|---|---|---|---|
| 0 | Regular Cash Wage Earners | 1721 | 38.2% | 61.6% | 7.2 | Salaried employee or cash trade worker / Mid-career / Working age | 0.85 | B z=0.28; inflow_vs_district_salary z=0.28; I z=0.27 |
| 1 | Retired Pension Earners | 740 | 16.4% | 98.8% | 35.4 | Retired / Retirement / Senior | 0.95 | pension_share z=2.7; cash_deposit_share z=-2.14; owner_age z=1.63 |
| 2 | Digital Transfer Low Earners | 720 | 16.0% | 69.2% | 21.0 | Part-time worker or supported dependent / Working age | 0.8 | transfer_in_share z=2.64; cash_deposit_share z=-2.13; fee_share z=1.82 |
| 3 | Irregular High Cash Earners | 631 | 14.0% | 35.8% | 4.7 | Self-employed or cash business owner / Mid-career / Working age | 0.85 | inflow_regular_share z=-2.14; income_cv z=1.63; cash_wd_share z=1.14 |
| 4 | High Earners With Loans | 434 | 9.6% | 36.4% | 4.8 | Self-employed or high-earning cash worker / Mid-career / Working age | 0.85 | has_running_loan z=3.34; S z=0.88; I z=0.87 |
| 5 | Young Deficit Cash Handlers | 254 | 5.6% | 90.9% | 28.2 | Student or casual worker / Young adult / Student | 0.9 | income_cv z=3.05; log_I z=-1.89; inflow_regular_share z=-1.74 |

## Population findings under the 55% layoff

4,486 accounts with positive inflow (excluded: 14 with zero inflow); horizon 6 months. Six-month survival 64.4% (n=2891); with a bills shock as well 61.0%. Spearman rho, buffer vs runway: -0.02; spending ratio vs runway: -0.75. Quartile tables below (survival %, median of the sorting variable).

| Quartile | Buffer B: n | Buffer B: survive % | Buffer B: median | S/I: n | S/I: survive % | S/I: median |
|---|---|---|---|---|---|---|
| Q1 (lowest) | 1122 | 69.8% | $11,253 | 1122 | 99.2% | 0.66 |
| Q2 | 1121 | 57.4% | $17,923 | 1121 | 81.7% | 0.85 |
| Q3 | 1121 | 57.9% | $27,936 | 1121 | 51.7% | 0.96 |
| Q4 (highest) | 1122 | 72.7% | $42,629 | 1122 | 25.2% | 1.07 |

## Matched-pair reversals

Matching rule: sort by I; greedy adjacent pairing with |Ia-Ib|/max(Ia,Ib) <= tol; no reuse; ties by account_id (tolerance 0.05, minimum 12 months). Of 2,238 pairs with unequal buffers, 78 (3.49%) are reversals where the larger buffer fails first; that is 10.85% of the 719 discordant pairs. In every reversal the smaller-buffer account spends less (median S/I 0.79 vs 1.08). Variance decomposition of log runway: buffer share 0.25, gap share 1.21.

| Spending ratio band | Accounts | Survive 6 months |
|---|---|---|
| 0.0-0.7 | 897 | 99.9% |
| 0.7-0.8 | 454 | 95.4% |
| 0.8-0.9 | 703 | 82.6% |
| 0.9-1.0 | 1255 | 54.6% |
| >= 1.0 | 1177 | 25.1% |

## Pattern Hunter (agentic exploration)

Mode adk, model gemini-3.5-flash, 31 tool calls over 4500 accounts in 63.0 s. The agent calls deterministic tools (list_features, group statistics, correlations, default validation); every statistic in a finding is the output of a tool call. Ground-truth findings use real loan outcomes rather than simulation.

| Finding | Statement | Evidence (tool) | Strength | Caveat |
|---|---|---|---|---|
| Every borrower flagged 'Goes negative on timing, not shortage' saw the loan go bad | Real outcomes, not simulation: among the 682 accounts with a loan, 100% of the 19 flagged 'Goes negative on timing, not shortage' ended with the loan in trouble (status B or D) versus 9% of the other 663. | default_validation(timing_dips) on loans.csv status | strong | Small groups for some flags; loan status is a snapshot at end of 2025; flags and loan trouble share causes. |
| No borrower flagged 'Never negative, yet fails a layoff' saw the loan go bad | Real outcomes, not simulation: among the 682 accounts with a loan, 0% of the 389 flagged 'Never negative, yet fails a layoff' ended with the loan in trouble (status B or D) versus 26% of the other 293. | default_validation(fragile_but_clean) on loans.csv status | strong | Small groups for some flags; loan status is a snapshot at end of 2025; flags and loan trouble share causes. |
| Loans went bad 3.2x as often with 'Balance trending down' | Real outcomes, not simulation: among the 682 accounts with a loan, 28% of the 81 flagged 'Balance trending down' ended with the loan in trouble (status B or D) versus 9% of the other 601. | default_validation(balance_sliding) on loans.csv status | strong | Small groups for some flags; loan status is a snapshot at end of 2025; flags and loan trouble share causes. |
| Loans went bad 3.9x as often with 'Uneven income' | Real outcomes, not simulation: among the 682 accounts with a loan, 20% of the 264 flagged 'Uneven income' ended with the loan in trouble (status B or D) versus 5% of the other 418. | default_validation(income_volatile) on loans.csv status | strong | Small groups for some flags; loan status is a snapshot at end of 2025; flags and loan trouble share causes. |
| Failing the simulated layoff lines up with real loan trouble | Borrowers who fail the simulated six-month layoff saw the loan go bad 14% of the time (454 accounts) versus 5% for those who survive it (228). | default_validation(survives6_layoff) | strong | The runway formula counts the loan payment inside spending, so part of this is mechanical. |
| Balance sliding flag predicts significantly reduced layoff survival | Accounts flagged with balance_sliding (n = 493) have a six-month layoff survival rate of 34.7% compared to 68.2% for accounts without the flag, representing a 33.5 percentage point reduction in survival. | compare_flag(flag='balance_sliding') | strong | Accounts with sliding balances also have lower median cash buffers (13,748 vs 24,223) and higher spending ratios (0.997 vs 0.910), which partly drives the lower survival. |
| Prior weathered income drop strongly predicts layoff survival | Accounts flagged as weathered_before (n = 113) achieve a 92.0% six-month layoff survival rate compared to 63.8% for unflagged accounts, a 28.2 percentage point advantage. | compare_flag(flag='weathered_before') | strong | Accounts with the weathered_before flag also maintain lower median spending ratios (0.782 vs 0.921) and higher cash buffers (29,236 vs 22,133). |
| Inflow volatility negatively correlates with layoff runway and survival | Inflow volatility (income_cv) has a Spearman correlation of -0.227 with layoff runway, with accounts in the lowest volatility quartile (<= 0.176, n = 1125) reaching an 85.2% layoff survival rate compared to 54.6% for the highest quartile (> 0.446, n = 1125). | correlation(feature_a='income_cv', feature_b='runway_layoff_capped') and survival_by_quantile(feature='income_cv', shock='layoff') | strong | Income volatility correlates with higher spending ratios (spearman = 0.324), which contributes to reduced runway. |
| Fee bleed flag counterintuitively associates with high layoff survival due to low base spending | Accounts flagged with fee_bleed (n = 310) achieve a 96.8% layoff survival rate compared to 62.1% for unflagged accounts, representing a 34.7 percentage point increase in survival. | compare_flag(flag='fee_bleed') | strong | This counterintuitive result occurs because fee_bleed accounts have low absolute monthly spending (median S = 1,395 vs 8,144) and a low spending ratio (0.658 vs 0.930), so bank fees form a larger share of outflow while their buffer covers many months of spending. |
| Pension-dependent households show near-total six-month layoff survival | Accounts flagged as pension_dependent (n = 740) achieve a 98.8% six-month layoff survival rate compared to 57.8% for non-pension accounts, a 41.0 percentage point difference. | compare_flag(flag='pension_dependent') | strong | Pension-dependent accounts have lower median inflows (3,530 vs 9,468) but maintain much lower spending ratios (0.678 vs 0.946), extending their financial runway. |
| Loan stress drastically reduces layoff survival despite average buffer size | Accounts flagged with loan_stress (n = 103) have a six-month layoff survival rate of only 28.2% compared to 65.4% for unflagged accounts, representing a 37.2 percentage point drop. | compare_flag(flag='loan_stress') | strong | Despite having similar median cash buffers to unflagged accounts (23,023 vs 22,306), loan-stressed households spend more than their inflow (median spending ratio 1.009 vs 0.916), accelerating buffer depletion under a shock. |
| Older account owners demonstrate higher six-month layoff survival | Account owner age has a Spearman correlation of 0.208 with layoff runway, with owners aged 57.2 to 81 (n = 1120) achieving an 84.5% layoff survival rate compared to 55.7% for those aged 43.8 to 57.2 (n = 1129). | correlation(feature_a='owner_age', feature_b='runway_layoff_capped') and survival_by_quantile(feature='owner_age', shock='layoff') | strong | Older account owners are more likely to be retired or receiving pensions, which correlates with lower spending ratios. |
| Historical maximum drawdown share strongly predicts layoff survival | Max drawdown share (max_drawdown_share) strongly negatively correlates with layoff runway (Spearman = -0.621), with accounts in the lowest drawdown quartile (<= 0.433, n = 1125) achieving a 95.3% layoff survival rate compared to 26.2% for the highest quartile (> 1.17, n = 1125). | correlation(feature_a='max_drawdown_share', feature_b='runway_layoff_capped') and survival_by_quantile(feature='max_drawdown_share', shock='layoff') | strong | Max drawdown share is defined relative to cash buffer B, so large historical balance dips inherently reflect depleted reserves. |

## External validation against loan outcomes

Outcome: loan status B or D (finished unpaid or running in debt) in loans.csv, a snapshot at the end of 2025. n=682, bad=76 (base rate 11.1%). By official layoff survival: fails 14.3% (n=454) vs survives 4.8% (n=228). Lift = bad rate with flag / bad rate without. Caveats: small groups for several flags; flags and loan payments share causes (a loan payment raises S, which lowers runway), so this is association, not out-of-sample prediction.

| Flag | Key | n with | Bad rate with | Bad rate without | Lift |
|---|---|---|---|---|---|
| Goes negative on timing, not shortage | timing_dips | 19 | 100.0% | 8.6% | 11.63 |
| Uneven income | income_volatile | 264 | 20.5% | 5.3% | 3.89 |
| Uneven cash income | cash_economy | 265 | 20.4% | 5.3% | 3.86 |
| Balance trending down | balance_sliding | 81 | 28.4% | 8.8% | 3.22 |
| Has been through an income drop and stayed above zero | weathered_before | 18 | 22.2% | 10.8% | 2.05 |
| Spending close to income | thin_margin | 388 | 14.2% | 7.1% | 1.98 |
| Cuts spending fast when income drops | cuts_when_hit | 45 | 20.0% | 10.5% | 1.9 |
| Spending growing faster than income | lifestyle_creep | 126 | 17.5% | 9.7% | 1.8 |
| Bills taking a growing share | rent_pressure | 62 | 12.9% | 11.0% | 1.18 |
| Regular transfer out | savings_elsewhere | 230 | 8.3% | 12.6% | 0.66 |
| Never negative, yet fails a layoff | fragile_but_clean | 389 | 0.0% | 25.9% | 0.0 |

## Limitations and threats to validity

- Simulated vs observed: runway and survival are deterministic projections of medians, not observed outcomes; only the loan check uses real outcomes.
- Circularity: spending ratio enters both the runway formula and the S/I finding; the finding says the formula is dominated by the gap, which the variance decomposition quantifies.
- Loan status is an end-of-2025 snapshot; timing of default relative to the observed months is unknown.
- The layoff applies 55% to all of I with no EI weekly maximum.
- Archetype and persona labels (occupation, life stage, names, goals) are generated, constrained to the data and marked fictional; they are illustrative, not inferences about real people.
- Accounts with zero inflow are excluded from population statistics; accounts without labelled household bills cannot respond to h.

_Generated 2026-11-08T14:54:51+00:00 by backend/scripts/build_stage1_report.py. Deterministic; no model._
