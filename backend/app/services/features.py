"""Feature Forge: per-account behavioural signals from the summary CSVs. Code only, no AI.

Every column is computed from a semantic ROLE (inflow, outflow, balance, ...) rather than a hard-coded name, so a
new bank's files only need a new role map (the Schema Scout's job). The table feeds the archetype clustering, the
Pattern Hunter's tools, the Profile Narrator's flags and the bank-side views.

Flags are rule-based, each with a plain-language evidence string. They are the only thing the narrator is allowed to
talk about, which keeps the model from inventing facts.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Callable

import numpy as np
import pandas as pd

from .data_store import DataStore, get_store
from .financial_profiles import build_population_table, shock_population
from .resilience_history import HISTORY_DOCS, history_table

AS_OF = pd.Timestamp("2025-12-31")

# Semantic roles -> columns in this dataset. A Schema Scout would produce this map for another bank.
ROLES = {
    "account": "account_id", "month": "month",
    "inflow": "money_in", "outflow": "money_out",
    "inflow_parts": {"cash_deposits": "cash_deposits", "transfers_in": "transfers_in", "pension": "pension_in", "interest": "interest_in"},
    "outflow_parts": {"household_bills": "household_bills", "insurance": "insurance", "loan_payments": "loan_payments", "bank_fees": "bank_fees",
                      "cash_withdrawals": "cash_withdrawals_genuine", "card_withdrawals": "card_withdrawals", "transfers_out": "transfers_out_other"},
    "balance_avg": "avg_daily_balance", "balance_end": "month_end_balance", "balance_min": "min_balance", "days_negative": "days_below_zero",
}

FEATURE_DOCS: dict[str, str] = {
    "I": "typical monthly inflow (median money_in)", "S": "typical monthly spending (median money_out)",
    "H": "median household bills", "B": "cash buffer (mean avg_daily_balance, last 6 months)", "P": "running loan payment",
    "months": "months of history", "spending_ratio": "S / I", "surplus": "I - S", "income_cv": "inflow volatility (std / mean)",
    "inflow_regular_share": "share of months with inflow within 20% of the median", "pension_share": "share of inflow that is pension",
    "cash_deposit_share": "share of inflow deposited as cash", "transfer_in_share": "share of inflow arriving as transfers",
    "bills_share": "household bills / outflow", "insurance_share": "insurance / outflow", "loan_share": "loan payments / outflow",
    "fee_share": "bank fees and penalty interest / outflow", "cash_wd_share": "cash withdrawals / outflow",
    "card_wd_share": "card spending / outflow", "transfer_out_share": "unlabelled transfers out / outflow",
    "fee_months_share": "share of months with any bank fee", "neg_months_share": "share of months with a negative-balance day",
    "neg_days": "total days below zero", "timing_dip_share": "of negative months, share where inflow still covered outflow (timing, not shortage)",
    "spending_drift_pm": "monthly trend of spending over the last 24 months, as a share of S",
    "income_drift_pm": "monthly trend of inflow over the last 24 months, as a share of I",
    "lifestyle_creep": "spending drift minus income drift (positive = spending growing faster than income)",
    "balance_trend_pm": "monthly trend of the average balance over the last 12 months, as a share of B",
    "bills_share_trend": "bills share in the last 12 months minus the prior 12 months",
    "december_spend_ratio": "December spending / S", "max_drawdown_share": "largest fall in month-end balance from its running peak, as a share of B",
    "regular_transfer_out": "recurring unlabelled transfer out most months with a stable amount (likely savings or support elsewhere)",
    "regular_transfer_out_amount": "median monthly amount of that recurring transfer",
    "loan_payment_share": "running loan payment / I", "has_running_loan": "loan running at end of 2025", "loan_in_debt": "loan status D",
    "owner_age": "account owner's age at end of 2025", "n_authorized_users": "authorized users on the account",
    "card_rank": "0 none, 1 junior, 2 classic, 3 gold", "account_age_years": "years since the account was opened",
    "district_salary": "district average monthly salary", "inflow_vs_district_salary": "I / district average salary",
    "district_unemployment": "district unemployment rate 2023 (%)", "n_standing_orders": "standing orders on the account",
    "so_unlabelled_amount": "monthly standing orders with no stated purpose (often savings or transfers to family)",
    **HISTORY_DOCS,
    "runway_layoff": "official runway under the 55% layoff (months; inf = no shortfall)", "survives6_layoff": "runway_layoff >= 6",
    "runway_combined": "official runway under layoff + bills +15%", "survives6_combined": "runway_combined >= 6",
}


def _slope_share(values: np.ndarray, scale: float) -> float:
    """Least-squares slope per month, expressed as a share of `scale`. 0 when too short or scale is 0."""
    n = len(values)
    if n < 6 or not np.isfinite(scale) or scale <= 0:
        return 0.0
    x = np.arange(n, dtype=float)
    x -= x.mean()
    denom = float((x * x).sum())
    if denom == 0:
        return 0.0
    slope = float((x * (values - values.mean())).sum() / denom)
    return slope / scale


def _per_account_trends(ms: pd.DataFrame, pop: pd.DataFrame) -> pd.DataFrame:
    """Group-wise trend features; a python loop over 4,500 groups takes about a second."""
    rows = {}
    inflow, outflow, bal_avg, bal_end = ROLES["inflow"], ROLES["outflow"], ROLES["balance_avg"], ROLES["balance_end"]
    bills = ROLES["outflow_parts"]["household_bills"]
    tr_out = ROLES["outflow_parts"]["transfers_out"]
    for acct, g in ms.groupby(ROLES["account"], sort=True):
        I, S, B = pop.at[acct, "I"], pop.at[acct, "S"], pop.at[acct, "B"]
        tail24 = g.tail(24)
        s_drift = _slope_share(tail24[outflow].to_numpy(float), S)
        i_drift = _slope_share(tail24[inflow].to_numpy(float), I)
        b_trend = _slope_share(g.tail(12)[bal_avg].to_numpy(float), abs(B) if B else 0.0)
        # bills share: last 12 vs prior 12
        bst = 0.0
        if len(g) >= 24:
            last, prior = g.tail(12), g.iloc[-24:-12]
            ls = last[bills].sum() / last[outflow].sum() if last[outflow].sum() > 0 else np.nan
            ps = prior[bills].sum() / prior[outflow].sum() if prior[outflow].sum() > 0 else np.nan
            bst = float(ls - ps) if np.isfinite(ls) and np.isfinite(ps) else 0.0
        dec = g[g[ROLES["month"]].str.endswith("-12")][outflow]
        dec_ratio = float(dec.mean() / S) if len(dec) and S > 0 else np.nan
        be = g[bal_end].to_numpy(float)
        dd = float((np.maximum.accumulate(be) - be).max() / B) if len(be) and B and B > 0 else 0.0
        t = g[tr_out].to_numpy(float)
        pos = t[t > 0]
        share_months = len(pos) / len(t) if len(t) else 0.0
        cv = float(pos.std() / pos.mean()) if len(pos) >= 3 and pos.mean() > 0 else np.nan
        regular = bool(share_months >= 0.6 and np.isfinite(cv) and cv <= 0.5 and len(pos) >= 6)
        rows[acct] = {
            "spending_drift_pm": s_drift, "income_drift_pm": i_drift, "lifestyle_creep": s_drift - i_drift,
            "balance_trend_pm": b_trend, "bills_share_trend": bst, "december_spend_ratio": dec_ratio,
            "max_drawdown_share": dd, "regular_transfer_out": regular,
            "regular_transfer_out_amount": float(np.median(pos)) if regular else 0.0,
        }
    return pd.DataFrame.from_dict(rows, orient="index")


def _people_features(store: DataStore) -> pd.DataFrame:
    """Owner age, gender, authorized users, best card, from clients/dispositions/cards (optional files)."""
    d = store.data_dir
    try:
        clients = pd.read_csv(d / "clients.csv", parse_dates=["birth_date"])
        disp = pd.read_csv(d / "dispositions.csv")
    except FileNotFoundError:
        return pd.DataFrame()
    owners = disp[disp["type"] == "owner"].merge(clients, on="client_id", how="left")
    owners["owner_age"] = ((AS_OF - owners["birth_date"]).dt.days / 365.25).round(1)
    out = owners.groupby("account_id").agg(owner_age=("owner_age", "first"), owner_gender=("gender", "first"))
    out["n_authorized_users"] = disp[disp["type"] != "owner"].groupby("account_id").size().reindex(out.index).fillna(0).astype(int)
    rank = {"junior": 1, "classic": 2, "gold": 3}
    try:
        cards = pd.read_csv(d / "cards.csv").merge(disp[["disposition_id", "account_id"]], on="disposition_id", how="left")
        cards["card_rank"] = cards["card_type"].map(rank).fillna(0)
        out["card_rank"] = cards.groupby("account_id")["card_rank"].max().reindex(out.index).fillna(0).astype(int)
    except FileNotFoundError:
        out["card_rank"] = 0
    return out


def _account_features(store: DataStore) -> pd.DataFrame:
    acc = store.accounts.copy()
    acc["account_opened"] = pd.to_datetime(acc["account_opened"], errors="coerce")
    acc["account_age_years"] = ((AS_OF - acc["account_opened"]).dt.days / 365.25).round(2)
    out = acc.set_index("account_id")[["district_id", "account_age_years"]]
    if not store.districts.empty:
        dist = store.districts.set_index("district_id")
        out["district_name"] = out["district_id"].map(dist["district_name"])
        out["district_salary"] = out["district_id"].map(dist["average_salary"])
        out["district_unemployment"] = out["district_id"].map(dist["unemployment_rate_2023"])
    so = store.standing_orders
    if not so.empty:
        g = so.groupby("account_id")
        out["n_standing_orders"] = g.size().reindex(out.index).fillna(0).astype(int)
        blank = so[so["purpose"].isna() | (so["purpose"].astype(str).str.strip() == "")]
        out["so_unlabelled_amount"] = blank.groupby("account_id")["amount"].sum().reindex(out.index).fillna(0.0)
    else:
        out["n_standing_orders"] = 0
        out["so_unlabelled_amount"] = 0.0
    return out


def build_feature_table(store: DataStore | None = None) -> pd.DataFrame:
    store = store or get_store()
    ms = store.monthly
    acct = ms[ROLES["account"]]
    g = ms.groupby(ROLES["account"], sort=True)
    pop = build_population_table(store)

    f = pop[["I", "S", "H", "F", "B", "P", "months", "first_month", "last_month", "neg_days", "min_balance", "income_cv",
             "spending_ratio", "surplus", "has_loan", "loan_status"]].copy()

    sums = g[[ROLES["inflow"], ROLES["outflow"], *ROLES["inflow_parts"].values(), *ROLES["outflow_parts"].values()]].sum()
    in_total = sums[ROLES["inflow"]].replace(0, np.nan)
    out_total = sums[ROLES["outflow"]].replace(0, np.nan)
    ip, op = ROLES["inflow_parts"], ROLES["outflow_parts"]
    f["pension_share"] = (sums[ip["pension"]] / in_total).fillna(0.0)
    f["cash_deposit_share"] = (sums[ip["cash_deposits"]] / in_total).fillna(0.0)
    f["transfer_in_share"] = (sums[ip["transfers_in"]] / in_total).fillna(0.0)
    f["bills_share"] = (sums[op["household_bills"]] / out_total).fillna(0.0)
    f["insurance_share"] = (sums[op["insurance"]] / out_total).fillna(0.0)
    f["loan_share"] = (sums[op["loan_payments"]] / out_total).fillna(0.0)
    f["fee_share"] = (sums[op["bank_fees"]] / out_total).fillna(0.0)
    f["cash_wd_share"] = (sums[op["cash_withdrawals"]] / out_total).fillna(0.0)
    f["card_wd_share"] = (sums[op["card_withdrawals"]] / out_total).fillna(0.0)
    f["transfer_out_share"] = (sums[op["transfers_out"]] / out_total).fillna(0.0)

    f["fee_months_share"] = (ms[op["bank_fees"]] > 0).groupby(acct).mean()
    f["neg_months_share"] = (ms[ROLES["days_negative"]] > 0).groupby(acct).mean()
    neg = ms[ms[ROLES["days_negative"]] > 0]
    f["timing_dip_share"] = (neg[ROLES["inflow"]] >= neg[ROLES["outflow"]]).groupby(neg[ROLES["account"]]).mean().reindex(f.index).fillna(0.0)
    med = g[ROLES["inflow"]].transform("median")
    f["inflow_regular_share"] = ((ms[ROLES["inflow"]] - med).abs() <= 0.2 * med).groupby(acct).mean()

    f = f.join(_per_account_trends(ms, pop))
    f = f.join(history_table(ms))

    loans = store.loans.set_index("account_id")
    f["has_running_loan"] = f.index.isin(loans[loans.status.isin(["C", "D"])].index)
    f["loan_in_debt"] = f.index.isin(loans[loans.status == "D"].index)
    f["loan_payment_share"] = np.where(f.I > 0, f.P / f.I, 0.0)

    f = f.join(_people_features(store), how="left").join(_account_features(store), how="left")
    if "district_salary" in f:
        f["inflow_vs_district_salary"] = np.where(f.district_salary > 0, f.I / f.district_salary, np.nan)

    lay = shock_population(pop, r=0.55, h=0.0)
    comb = shock_population(pop, r=0.55, h=0.15)
    f["runway_layoff"] = lay.runway
    f["survives6_layoff"] = lay.runway >= 6
    f["runway_combined"] = comb.runway
    f["survives6_combined"] = comb.runway >= 6
    f.index.name = "account_id"
    return f


@lru_cache(maxsize=1)
def get_features() -> pd.DataFrame:
    return build_feature_table()


# ----------------------------------------------------------------------------- flags
@dataclass(frozen=True)
class FlagRule:
    key: str
    label: str
    severity: str                      # info | watch | risk
    when: Callable[[pd.Series], bool]
    evidence: Callable[[pd.Series], str]
    insight: str                       # what the narrator may say about it, in plain words


def _pct(x: float) -> str:
    return f"{x:.0%}"


FLAG_RULES: list[FlagRule] = [
    FlagRule("thin_margin", "Spending close to income", "risk",
             lambda r: bool(r.spending_ratio >= 0.95),
             lambda r: f"typical spending is {_pct(r.spending_ratio)} of typical inflow (${r.S:,.0f} of ${r.I:,.0f})",
             "almost nothing is left over in a typical month, so any income dip becomes a shortfall fast"),
    FlagRule("timing_dips", "Goes negative on timing, not shortage", "watch",
             lambda r: bool(r.neg_months_share > 0 and r.timing_dip_share >= 0.5 and r.neg_months_share * r.months >= 3),
             lambda r: f"{int(round(r.neg_months_share * r.months))} months had a negative-balance day, and in {_pct(r.timing_dip_share)} of them inflow still covered outflow",
             "the account dips below zero because bills land before money arrives, which is a timing habit rather than a lack of money"),
    FlagRule("fee_bleed", "Fees well above typical", "watch",
             lambda r: bool(r.fee_share >= 0.004),   # top ~7% of accounts; statement fees alone sit near 0.1%
             lambda r: f"fees and penalty interest are {r.fee_share:.1%} of all outflow, about four times the typical account",
             "fees and penalty interest are a steady leak that a small buffer or a payment-date change would stop"),
    FlagRule("lifestyle_creep", "Spending growing faster than income", "watch",
             lambda r: bool(r.months >= 24 and r.lifestyle_creep >= 0.005),
             lambda r: f"over the last 24 months spending rose about {_pct(r.spending_drift_pm)} of S per month while inflow moved {_pct(r.income_drift_pm)} of I per month",
             "spending has been drifting up faster than income, which quietly shrinks the margin each year"),
    FlagRule("savings_elsewhere", "Regular transfer to another bank", "info",
             lambda r: bool(r.regular_transfer_out),
             lambda r: f"a steady unlabelled transfer out of about ${r.regular_transfer_out_amount:,.0f} most months",
             "a regular transfer leaves this account every month, so the real safety cushion is probably larger than the balance here shows"),
    FlagRule("pension_dependent", "Pension is the main income", "info",
             lambda r: bool(r.pension_share >= 0.5),
             lambda r: f"{_pct(r.pension_share)} of inflow is pension",
             "income is pension-based, so a job-loss shock applies less and a cost shock matters more"),
    FlagRule("cash_economy", "Uneven cash income", "info",
             lambda r: bool(r.cash_deposit_share >= 0.9 and r.income_cv >= 0.5),   # cash deposits are the norm here; uneven cash is the signal
             lambda r: f"{_pct(r.cash_deposit_share)} of inflow is cash deposits and inflow volatility is {r.income_cv:.2f}",
             "income arrives as uneven cash deposits, which usually means self-employment or cash-paid work"),
    FlagRule("income_volatile", "Uneven income", "watch",
             lambda r: bool(r.income_cv >= 0.5 and r.inflow_regular_share < 0.5),
             lambda r: f"inflow volatility {r.income_cv:.2f}; only {_pct(r.inflow_regular_share)} of months are within 20% of the median",
             "income swings a lot from month to month, so the buffer has to do more work than for a salaried person"),
    FlagRule("loan_stress", "Loan payment is heavy", "risk",
             lambda r: bool(r.has_running_loan and (r.loan_payment_share >= 0.3 or r.loan_in_debt)),
             lambda r: f"running loan payment ${r.P:,.0f} is {_pct(r.loan_payment_share)} of typical inflow" + (" and the loan is already in debt" if r.loan_in_debt else ""),
             "the loan takes a large bite of every month's inflow, so it should be the first thing protected in a shock"),
    FlagRule("below_district_pay", "Inflow well below the local average salary", "info",
             lambda r: bool(np.isfinite(r.get("inflow_vs_district_salary", np.nan)) and r.inflow_vs_district_salary < 0.6),
             lambda r: f"typical inflow ${r.I:,.0f} is {_pct(r.inflow_vs_district_salary)} of the district average salary ${r.district_salary:,.0f}",
             "inflow is well under the local average, so this account may be a secondary account or a part-time income"),
    FlagRule("rent_pressure", "Bills taking a growing share", "watch",
             lambda r: bool(r.months >= 24 and r.bills_share_trend >= 0.05),
             lambda r: f"household bills took {_pct(r.bills_share_trend)} more of outflow in the last 12 months than the 12 before",
             "housing and utility bills are eating a growing share, which is the kind of slow squeeze people rarely notice"),
    FlagRule("balance_sliding", "Balance trending down", "watch",
             lambda r: bool(r.balance_trend_pm <= -0.03),
             lambda r: f"average balance has fallen about {_pct(-r.balance_trend_pm)} of the buffer per month over the last year",
             "the cushion has been shrinking steadily for a year even without a shock"),
    FlagRule("fragile_but_clean", "Never negative, yet fails a layoff", "risk",
             lambda r: bool(r.neg_days == 0 and np.isfinite(r.runway_layoff) and r.runway_layoff < 6),
             lambda r: f"no negative-balance days on record, but on 55% income the buffer lasts {r.runway_layoff:.1f} months",
             "the record looks spotless, which hides that six months on EI would run the buffer out"),
    FlagRule("weathered_before", "Has been through an income drop and stayed above zero", "info",
             lambda r: bool(1 <= r.shock_episodes <= 4 and r.income_cv < 0.6 and not r.episode_dipped_negative and r.worst_income_drop >= 0.4),
             lambda r: f"{int(r.shock_episodes)} time(s) inflow fell at least 40% (worst {_pct(r.worst_income_drop)}) and the balance never went negative",
             "you have already lived through an income drop without going under, which says more about you than any simulation"),
    FlagRule("cuts_when_hit", "Cuts spending fast when income drops", "info",
             lambda r: bool(1 <= r.shock_episodes <= 6 and np.isfinite(r.spending_response) and r.spending_response >= 0.5),
             lambda r: f"in past income drops spending fell about {_pct(min(1.0, r.spending_response))} as much as income did",
             "when money got tight before, you pulled spending back quickly, a habit that shortens any shock"),
    FlagRule("no_adjustment_when_hit", "Spending did not move when income dropped", "watch",
             lambda r: bool(1 <= r.shock_episodes <= 4 and r.income_cv < 0.6 and np.isfinite(r.spending_response) and r.spending_response <= 0.1),
             lambda r: f"in {int(r.shock_episodes)} past income drop(s) spending barely changed while inflow fell {_pct(r.worst_income_drop)}",
             "last time income fell, spending stayed where it was and the cushion took the whole hit"),
    FlagRule("slow_recovery", "Balance took a long time to recover after a drop", "watch",
             lambda r: bool(r.shock_episodes >= 1 and r.recovery_months == r.recovery_months and r.recovery_months > 6),
             lambda r: (f"after past income drops it took about {r.recovery_months:.0f} months for the balance to get back to where it was" if np.isfinite(r.recovery_months)
                        else "after the last income drop the balance has not yet returned to where it was"),
             "recovering from the last drop took a long time, so a second shock soon after would land on a thinner cushion"),
    FlagRule("deep_buffer", "Buffer covers many months of spending", "info",
             lambda r: bool(r.S > 0 and r.B / r.S >= 12),
             lambda r: f"buffer ${r.B:,.0f} is {r.B / r.S:.0f} months of typical spending",
             "the buffer is unusually deep, so the real question is what it is for, not whether it is enough"),
]
FLAG_BY_KEY = {fr.key: fr for fr in FLAG_RULES}


def flags_for(row: pd.Series) -> list[dict]:
    out = []
    for fr in FLAG_RULES:
        try:
            hit = fr.when(row)
        except Exception:
            hit = False
        if hit:
            try:
                ev = fr.evidence(row)
            except Exception:
                ev = ""
            out.append({"key": fr.key, "label": fr.label, "severity": fr.severity, "evidence": ev, "insight": fr.insight})
    order = {"risk": 0, "watch": 1, "info": 2}
    out.sort(key=lambda d: order[d["severity"]])
    return out


def flag_matrix(features: pd.DataFrame) -> pd.DataFrame:
    """Boolean flag columns for the whole population (vectorised through the rules; fine at 4,500 rows)."""
    cols = {}
    for fr in FLAG_RULES:
        vals = []
        for _, r in features.iterrows():
            try:
                vals.append(bool(fr.when(r)))
            except Exception:
                vals.append(False)
        cols[fr.key] = vals
    return pd.DataFrame(cols, index=features.index)


def account_feature_summary(features: pd.DataFrame, account_id: int) -> dict:
    """The handful of numbers worth showing a person, with population percentiles."""
    r = features.loc[account_id]
    keys = ["I", "S", "B", "shock_episodes", "worst_income_drop", "spending_response", "recovery_months", "spending_ratio", "income_cv", "pension_share", "cash_deposit_share", "fee_months_share", "neg_months_share", "timing_dip_share",
            "lifestyle_creep", "balance_trend_pm", "bills_share", "card_wd_share", "cash_wd_share", "regular_transfer_out_amount",
            "loan_payment_share", "owner_age", "account_age_years", "inflow_vs_district_salary", "runway_layoff", "runway_combined"]
    out = {}
    for k in keys:
        if k not in features.columns:
            continue
        v = r[k]
        if isinstance(v, (np.bool_, bool)):
            out[k] = {"value": bool(v)}
            continue
        try:
            fv = float(v)
        except (TypeError, ValueError):
            continue
        col = features[k].replace([np.inf, -np.inf], np.nan).dropna()
        pct = float((col < fv).mean() * 100) if np.isfinite(fv) and len(col) else None
        out[k] = {"value": None if not np.isfinite(fv) else fv, "percentile": pct, "doc": FEATURE_DOCS.get(k, "")}
    return out
