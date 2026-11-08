"""Transaction-level signals per account, computed offline from transactions.csv (100 MB, not in the repo).

Writes data/derived/tx_features.csv (one small row per account), which IS committed and merged into the feature
table when present. Signals:

  payday_dom            modal day of month of the main inflow (cash deposits, transfers in, pension; interest excluded)
  payday_regular_share  share of months whose main inflow landed within 2 days of that day
  bill_dom              modal day of month of labelled bills (household bills, insurance, loan payment)
  bills_before_pay_share share of months where the first labelled bill landed before that month's main inflow
  penalty_events        count of 'penalty interest (negative balance)' postings; penalty_total, penalty_months
  recurring_partner_*   the outgoing transfer partner with the most months (>= 6) and a stable amount (CV <= 0.5):
                        monthly amount, months, purpose label (if any), bank code
  n_partners_out        distinct outgoing partner accounts
Run:  python backend/scripts/build_tx_features.py [path/to/transactions.csv]
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


def find_transactions(arg: str | None) -> Path:
    if arg:
        return Path(arg)
    for d in sorted(ROOT.glob("data-*/data")) + [ROOT / "data"]:
        p = d / "transactions.csv"
        if p.exists():
            return p
    raise FileNotFoundError("transactions.csv not found; pass its path")


def build(tx: pd.DataFrame) -> pd.DataFrame:
    tx = tx.copy()
    tx["month"] = tx["date"].dt.to_period("M")
    tx["dom"] = tx["date"].dt.day
    credit = tx[tx["direction"].str.startswith("credit")]
    debit = tx[tx["direction"].str.startswith("debit")]

    # main inflow per month: the largest non-interest credit in each month
    main_in = credit[credit["operation"] != "interest"]
    idx = main_in.groupby(["account_id", "month"])["amount"].idxmax()
    main = main_in.loc[idx, ["account_id", "month", "dom", "date"]].rename(columns={"dom": "pay_dom", "date": "pay_date"})

    def mode_dom(s: pd.Series) -> float:
        return float(s.mode().iloc[0]) if len(s) else np.nan

    pay = main.groupby("account_id").agg(payday_dom=("pay_dom", mode_dom), months_with_inflow=("pay_dom", "size"))
    main = main.merge(pay[["payday_dom"]], left_on="account_id", right_index=True)
    # circular distance on a 30-day month
    diff = (main["pay_dom"] - main["payday_dom"]).abs()
    main["near"] = np.minimum(diff, 30 - diff) <= 2
    pay["payday_regular_share"] = main.groupby("account_id")["near"].mean()

    bills = debit[debit["purpose"].isin(["household bills", "insurance", "loan payment"])]
    first_bill = bills.groupby(["account_id", "month"])["date"].min().rename("first_bill_date").reset_index()
    bill_dom = bills.groupby("account_id")["dom"].agg(mode_dom).rename("bill_dom")
    both = first_bill.merge(main[["account_id", "month", "pay_date"]], on=["account_id", "month"], how="inner")
    both["bill_first"] = both["first_bill_date"] < both["pay_date"]
    bills_before = both.groupby("account_id")["bill_first"].mean().rename("bills_before_pay_share")
    bill_months = both.groupby("account_id").size().rename("months_with_bills")

    pen = debit[debit["purpose"] == "penalty interest (negative balance)"]
    penalty = pen.groupby("account_id").agg(penalty_events=("amount", "size"), penalty_total=("amount", "sum"), penalty_months=("month", "nunique"))

    out_tr = debit[(debit["operation"] == "transfer out to another bank") & debit["partner_account"].notna() & (debit["partner_account"] != "0")]
    g = out_tr.groupby(["account_id", "partner_account"])
    partners = g.agg(months=("month", "nunique"), n=("amount", "size"), mean_amt=("amount", "mean"), std_amt=("amount", "std"),
                     bank=("partner_bank", "first"), purpose=("purpose", lambda s: s.dropna().mode().iloc[0] if s.notna().any() else "")).reset_index()
    partners["cv"] = (partners["std_amt"].fillna(0) / partners["mean_amt"].replace(0, np.nan)).fillna(0)
    stable = partners[(partners["months"] >= 6) & (partners["cv"] <= 0.5)].sort_values(["account_id", "months", "mean_amt"], ascending=[True, False, False])
    rec = stable.groupby("account_id").first()[["mean_amt", "months", "purpose", "bank"]].rename(
        columns={"mean_amt": "recurring_partner_amount", "months": "recurring_partner_months", "purpose": "recurring_partner_purpose", "bank": "recurring_partner_bank"})
    n_partners = out_tr.groupby("account_id")["partner_account"].nunique().rename("n_partners_out")

    f = pay.join(bill_dom, how="left").join(bills_before, how="left").join(bill_months, how="left").join(penalty, how="left").join(rec, how="left").join(n_partners, how="left")
    for c in ("penalty_events", "penalty_total", "penalty_months", "n_partners_out", "months_with_bills", "recurring_partner_months"):
        f[c] = f[c].fillna(0)
    f["recurring_partner_amount"] = f["recurring_partner_amount"].fillna(0.0)
    f["recurring_partner_purpose"] = f["recurring_partner_purpose"].fillna("")
    f["recurring_partner_bank"] = f["recurring_partner_bank"].fillna("")
    f.index.name = "account_id"
    return f.sort_index()


def main() -> int:
    path = find_transactions(sys.argv[1] if len(sys.argv) > 1 else None)
    t = time.perf_counter()
    tx = pd.read_csv(path, usecols=["account_id", "date", "direction", "operation", "purpose", "amount", "partner_bank", "partner_account"],
                     dtype={"partner_bank": str, "partner_account": str}, parse_dates=["date"])
    print(f"loaded {len(tx):,} transactions in {time.perf_counter() - t:.1f}s")
    t = time.perf_counter()
    f = build(tx)
    out = ROOT / "data" / "derived" / "tx_features.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    f.to_csv(out)
    print(f"wrote {out} ({len(f)} accounts, {f.shape[1]} columns) in {time.perf_counter() - t:.1f}s")
    print(f[["payday_dom", "payday_regular_share", "bill_dom", "bills_before_pay_share", "penalty_events", "recurring_partner_amount"]].describe().round(2).to_string())
    print("bills before pay >= 50% of months:", int((f["bills_before_pay_share"] >= 0.5).sum()), "| penalty >= 3 events:", int((f["penalty_events"] >= 3).sum()),
          "| recurring partner:", int((f["recurring_partner_amount"] > 0).sum()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
