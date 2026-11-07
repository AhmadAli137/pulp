"""Per-account profiles and a vectorised population table of official metrics.

The population table (one row per account) is computed once with pandas groupbys using the exact
same definitions as tangerine_metrics.compute_metrics, and is cross-checked against it in tests.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
import pandas as pd

from .data_store import DataStore, get_store
from .tangerine_metrics import OfficialMetrics, compute_metrics, compute_shock


def get_metrics(account_id: int, store: DataStore | None = None) -> OfficialMetrics:
    store = store or get_store()
    if not store.has_account(account_id):
        raise KeyError(account_id)
    return compute_metrics(store.monthly_for(account_id), store.loan_for(account_id), account_id)


def build_population_table(store: DataStore | None = None) -> pd.DataFrame:
    """One row per account with I, S, F, H, B, P, months, observed distress markers."""
    store = store or get_store()
    ms = store.monthly  # already sorted by account_id, month
    g = ms.groupby("account_id", sort=True)
    fixed = ms.household_bills + ms.insurance + ms.loan_payments
    pop = pd.DataFrame({
        "I": g.money_in.median(),
        "S": g.money_out.median(),
        "H": g.household_bills.median(),
        "F": fixed.groupby(ms.account_id).median(),
        "months": g.size(),
        "first_month": g.month.first(),
        "last_month": g.month.last(),
        "neg_days": g.days_below_zero.sum(),
        "min_balance": g.min_balance.min(),
        "income_mean": g.money_in.mean(),
        "income_std": g.money_in.std(ddof=0),
        "spend_std": g.money_out.std(ddof=0),
    })
    pop["B"] = g.avg_daily_balance.apply(lambda s: float(s.tail(6).mean()))
    pop["income_cv"] = np.where(pop.income_mean > 0, pop.income_std / pop.income_mean, 0.0)
    pop["spending_ratio"] = np.where(pop.I > 0, pop.S / pop.I, np.nan)
    pop["surplus"] = pop.I - pop.S
    loans = store.loans.set_index("account_id")
    running = loans[loans.status.isin(["C", "D"])]
    pop["P"] = running.monthly_payment.reindex(pop.index).fillna(0.0)
    pop["has_loan"] = pop.index.isin(loans.index)
    pop["loan_status"] = loans.status.reindex(pop.index)
    pop["any_observed_negative"] = pop.neg_days > 0
    pop.index.name = "account_id"
    return pop


@lru_cache(maxsize=1)
def get_population() -> pd.DataFrame:
    return build_population_table()


def shock_population(pop: pd.DataFrame, r: float, h: float, one_off_mult_of_S: float = 0.0) -> pd.DataFrame:
    """Vectorised shock over the population table; returns runway (inf when no shortfall), and survives-6 flags."""
    income_after = r * pop.I
    spending_after = pop.S + h * pop.H
    buffer_left = pop.B - one_off_mult_of_S * pop.S
    gap = spending_after - income_after
    runway = np.where(buffer_left <= 0, 0.0, np.where(gap <= 0, np.inf, buffer_left / np.where(gap > 0, gap, 1)))
    out = pop[["I", "S", "H", "B", "months"]].copy()
    out["gap"] = gap
    out["buffer_left"] = buffer_left
    out["runway"] = runway
    return out


def percentile_of(pop: pd.DataFrame, column: str, value: float) -> float:
    s = pop[column].dropna().to_numpy()
    return float((s < value).mean() * 100.0)
