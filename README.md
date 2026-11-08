# PULP

**Planning Under Life’s Pressures**

PULP is a financial resilience workspace built for the Sheridan Datathon’s Tangerine track. Pick a historical demo account, see what typically comes in and goes out, and test what an income drop or an unexpected bill would change. The result gives you a savings target for before the shock and a backup plan for when it hits.

## The workspace

| Page | What you can do |
|---|---|
| **Overview** | Load any supplied account ID and see typical inflow, spending, fixed costs, cash buffer, and baseline runway. |
| **Shocks** | Adjust income, household bills, upfront cost, and duration. See the cash timeline, the result, and both plans. Compare keeping cash available with paying a remaining optional expense. |
| **My Plan** | Revisit the preparation and backup plans for the current shock. Mark a shock as already happened to see the backup plan first. |
| **Insights** | Explore an account’s recorded patterns, confirm details that affect the decision, and see a finding from the larger dataset. |

The optional-spending comparison uses the same income, regular expenses, and duration for both choices. Paying now adds only the remaining cost at the start. The app shows the cash preserved by waiting and whether paying would exhaust the cushion or leave a gap.

Use **Sign out of demo** to clear the selected account and in-progress scenario from your browser. Saved details stay with their demo account. The demo has no connection to a live bank.

## Where the numbers come from

The challenge provides 4,500 anonymized bank accounts. Monthly inflow, spending, and household bills use the middle value across the selected account’s monthly records. The starting cash buffer uses the average of the last six monthly average daily balances, or fewer months when history is shorter. Amounts are in Canadian dollars.

- **Cash after upfront cost** equals the starting buffer minus the one-time cost.
- **Monthly shortfall** is the amount by which spending exceeds income after the shock. Existing fixed costs are included in typical spending.
- **Runway** measures how many months the remaining cash covers a shortfall. The challenge displays at most 120 months. The verdict uses the full-precision amounts and the selected duration.
- **Prepare now** shows the cash target, the amount left to save, and an estimated timeline when there is a monthly surplus.
- **If it happens** separates the cash needed today from the amount to free up each month.

The chart uses the same values as the verdict. It starts at the historical cash estimate and shows the upfront change at month 0. The account records, details the user confirms, and simulated outcomes have separate labels. A recorded transfer may need clarification before it can be treated as available cash.

In 78 of 2,238 pairs with similar typical inflows, the account with more cash ran out within six months while its partner made it through the same modeled drop to 55% of typical inflow. The experiment illustrates how both cash and monthly spending shape resilience. [Research methods and results](docs/findings.md)

## Run locally

Use Python 3.12 and Node.js 22. From the repository root, install dependencies in your active Python environment.

```sh
python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
```

Start the API and frontend in separate terminals.

```sh
python -m uvicorn app.main:app --app-dir backend --port 8000
```

```sh
npm --prefix frontend run dev
```

Open [http://localhost:5173](http://localhost:5173). The frontend proxies API requests to port 8000. The supplied CSVs are loaded from `data/` by default. For a separate dataset directory, set `PULP_DATA_DIR`. The main workflow runs with the supplied data.

For a single-server build, run `npm --prefix frontend run build` and open [http://localhost:8000](http://localhost:8000) with the API running.

## Verify

```sh
python -m pytest backend/tests -q
npm --prefix frontend run build
npm --prefix frontend run test:e2e
```

Browser tests use an isolated API and a free port 8002. They require an installed Chrome or the Chromium executable configured through `PULP_BROWSER_EXECUTABLE`. [Demo walkthrough](demo/demo-script.md) · [Challenge and data dictionary](docs/tangerine-challenge.md)
