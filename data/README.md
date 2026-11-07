# Data

Place the Tangerine track CSVs here (or set `EVERPATH_DATA_DIR`). The backend also
auto-detects a sibling folder matching `data-*/data/` (the Google Drive export name).

Files used:

| File | Used for |
|---|---|
| `monthly_summary.csv` | All official sponsor calculations (I, S, F, H, B), history charts, cohort matching, simulation calibration |
| `loans.csv` | Active loan payment P (status C or D = running at end of 2025) |
| `accounts.csv` | Validating account IDs, district and statement frequency |
| `districts.csv` | District name/region shown on the profile (no salary inference) |
| `standing_orders.csv` | Recurring obligations shown on the twin (snapshot, undated) |
| `transactions.csv` | Not loaded by the API (100 MB); monthly_summary is derived from it |

Credit: PKDD'99 Discovery Challenge Financial dataset, CTU Prague Relational Dataset Repository
(https://relational.fel.cvut.cz/dataset/Financial), supplied via the Tangerine track of Sheridan Datathon 2026.
All money columns are in Canadian dollars per the event README. The data is real, anonymized bank data;
it is not PULP's and no record is treated as belonging to any identified person.
