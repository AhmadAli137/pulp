# Data

Place the Tangerine track CSVs here, or set `PULP_DATA_DIR` (the older `EVERPATH_DATA_DIR` still works). The backend also
auto-detects a sibling folder matching `data-*/data/` (the Google Drive export name).

## Files used

| File | Used for |
|---|---|
| `monthly_summary.csv` | All official sponsor calculations (I, S, F, H, B), history charts, cohort matching, simulation calibration, most behavioural signals |
| `loans.csv` | Active loan payment P (status C or D = running at end of 2025) and the loan-outcome check |
| `accounts.csv` | Validating account IDs, branch district, statement frequency, account age |
| `clients.csv` | Owner age and gender, and the owner's home district, for the persona and the demographic insights |
| `dispositions.csv` | Who can use the account: owner only, or shared with another person (a joint household) |
| `cards.csv` | Card type on the account (junior, classic, gold) |
| `districts.csv` | District name and region, average salary, unemployment in 2022 and 2023, urban share, entrepreneurs and crime per 1,000 inhabitants |
| `standing_orders.csv` | Recurring obligations and unlabelled standing orders (snapshot, undated) |
| `transactions.csv` | Not loaded by the API (100 MB). `monthly_summary` is derived from it, and `backend/scripts/build_tx_features.py` turns it into `derived/tx_features.csv` |

## Derived files (committed, served by the API)

| File | Built by | Holds |
|---|---|---|
| `derived/features.csv` | `backend/scripts/run_stage1.py` | About 78 behavioural signals per account |
| `derived/tx_features.csv` | `backend/scripts/build_tx_features.py` | Payday and bill dates, penalty interest, recurring transfers to one partner |
| `derived/archetypes.json` | `backend/scripts/run_stage1.py` | The six behavioural groups, with Gemini names when a key is set |
| `derived/hunter_findings.json` | `backend/scripts/run_stage1.py` | Pattern Hunter findings and the loan-outcome validation |

Without the derived files the API computes offline versions at startup, which is slower and uses rule-based names.

## Credit and meaning

Credit: PKDD'99 Discovery Challenge Financial dataset, CTU Prague Relational Dataset Repository
(https://relational.fel.cvut.cz/dataset/Financial), supplied via the Tangerine track of Sheridan Datathon 2026.
All money columns are in Canadian dollars per the event README, and dates are shifted to 2022 to 2025. The data is real,
anonymized bank data. It is not PULP's, and no record is treated as belonging to any identified person. The personas
PULP builds for accounts are fictional. District names keep the Czech source geography.

## Full-export reconciliation

From the repository root, run:

```powershell
python backend/scripts/validate_pulp_data.py --data-dir data-20261107T180312Z-1-001/data
```

Replace the path with your organizer export. The script checks account references, duplicate monthly keys, category totals and every transaction's sign, then aggregates in integer cents and reconciles inflows/outflows to monthly summaries. It writes [docs/data-validation.json](../docs/data-validation.json). The verified export contains 4,500 accounts, 185,326 monthly rows and 1,056,320 transactions, with zero-cent reconciliation differences. The runtime `data/` subset does not include transactions.

Supplementary research is reproducible through `python backend/scripts/pulp_research.py`: [results](../docs/pulp-findings.json). Its 3,660-account longitudinal cohort and 4,500-account deciles are separate from the original [matched-pair research](../docs/findings.md); do not interchange their denominators.
