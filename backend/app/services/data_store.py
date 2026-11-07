"""Loads the Tangerine CSVs once and serves per-account slices.

Only monthly_summary, loans, accounts, districts and standing_orders are loaded.
transactions.csv (100 MB) is not needed by the API: monthly_summary is derived from it.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import find_data_dir

MONTHLY_COLS = [
    "account_id", "month", "money_in", "money_out", "cash_deposits", "transfers_in",
    "pension_in", "interest_in", "household_bills", "insurance", "loan_payments",
    "bank_fees", "cash_withdrawals_genuine", "card_withdrawals", "transfers_out_other",
    "month_end_balance", "min_balance", "avg_daily_balance", "days_below_zero",
]


class DataStore:
    def __init__(self, data_dir: Path | None = None):
        self.data_dir = Path(data_dir) if data_dir else find_data_dir()
        ms = pd.read_csv(self.data_dir / "monthly_summary.csv", dtype={"month": str})
        missing = set(MONTHLY_COLS) - set(ms.columns)
        if missing:
            raise ValueError(f"monthly_summary.csv missing columns: {sorted(missing)}")
        ms = ms.sort_values(["account_id", "month"]).reset_index(drop=True)
        self.monthly = ms
        self._groups = {k: v for k, v in ms.groupby("account_id", sort=False)}

        self.loans = pd.read_csv(self.data_dir / "loans.csv")
        self._loan_by_acct = {int(r.account_id): r for r in self.loans.itertuples(index=False)}

        self.accounts = pd.read_csv(self.data_dir / "accounts.csv")
        self._acct_by_id = {int(r.account_id): r for r in self.accounts.itertuples(index=False)}

        dpath = self.data_dir / "districts.csv"
        self.districts = pd.read_csv(dpath) if dpath.exists() else pd.DataFrame()
        self._district_by_id = (
            {int(r.district_id): r for r in self.districts.itertuples(index=False)}
            if not self.districts.empty else {}
        )
        spath = self.data_dir / "standing_orders.csv"
        self.standing_orders = pd.read_csv(spath) if spath.exists() else pd.DataFrame()

        self.account_ids: list[int] = sorted(int(a) for a in ms.account_id.unique())
        self._id_set = set(self.account_ids)

    # ------------------------------------------------------------------ lookups
    def has_account(self, account_id: int) -> bool:
        return int(account_id) in self._id_set

    def monthly_for(self, account_id: int) -> pd.DataFrame:
        if not self.has_account(account_id):
            raise KeyError(account_id)
        return self._groups[int(account_id)]

    def loan_for(self, account_id: int):
        return self._loan_by_acct.get(int(account_id))

    def account_row(self, account_id: int):
        return self._acct_by_id.get(int(account_id))

    def district_row(self, district_id: int):
        return self._district_by_id.get(int(district_id))

    def standing_orders_for(self, account_id: int) -> pd.DataFrame:
        if self.standing_orders.empty:
            return self.standing_orders
        return self.standing_orders[self.standing_orders.account_id == int(account_id)]

    def sample_ids(self, n: int = 8, seed: int = 7) -> list[int]:
        rng = np.random.default_rng(seed)
        return sorted(int(x) for x in rng.choice(self.account_ids, size=n, replace=False))


@lru_cache(maxsize=1)
def get_store() -> DataStore:
    return DataStore()
