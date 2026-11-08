"""Observed resilience: what each account actually did the last time its income fell.

The dataset holds up to 72 months per account, and real income shocks are in it: months where money_in dropped far
below the account's own recent norm. Instead of only simulating a layoff, we can measure how the household behaved
when it happened to them:

  episodes            how many times inflow fell at least 40% below the trailing six-month median
  worst_drop          the deepest such fall, as a share of the norm
  spending_response   how much spending moved in those months relative to the income fall (an elasticity:
                      1.0 = spending fell as much as income, 0 = no change, negative = spent more)
  dipped_below_zero   whether any episode ended with a negative-balance day
  recovery_months     months until the average balance was back to its pre-episode level (None = not yet)

These become features and flags ("you have been through this before", "you cut spending fast when income drops",
"you keep spending when income drops") and a ground-truth check: do our fragility flags line up with the loans that
actually went bad (status B or D)?
"""
from __future__ import annotations

import numpy as np
import pandas as pd

VALIDATION_CIRCULAR = {"loan_stress"}   # its rule reads the loan status, so testing it against loan status is circular
DROP = 0.40          # an episode starts when inflow is at least this far below the trailing median
WINDOW = 6           # trailing months for the norm


def account_history(g: pd.DataFrame) -> dict:
    """One account's monthly rows (sorted by month) -> observed-shock features."""
    inflow = g["money_in"].to_numpy(float)
    out = g["money_out"].to_numpy(float)
    bal = g["avg_daily_balance"].to_numpy(float)
    neg = g["days_below_zero"].to_numpy(float)
    n = len(inflow)
    res = {"shock_episodes": 0, "worst_income_drop": 0.0, "spending_response": np.nan, "episode_dipped_negative": False,
           "recovery_months": np.nan, "last_episode_months_ago": np.nan}
    if n < WINDOW + 2:
        return res
    norm_in = pd.Series(inflow).rolling(WINDOW, min_periods=WINDOW).median().shift(1).to_numpy()
    norm_out = pd.Series(out).rolling(WINDOW, min_periods=WINDOW).median().shift(1).to_numpy()
    norm_bal = pd.Series(bal).rolling(WINDOW, min_periods=WINDOW).mean().shift(1).to_numpy()
    responses, episodes, worst, dipped, recoveries, last_idx = [], 0, 0.0, False, [], None
    i = WINDOW
    while i < n:
        if norm_in[i] > 0 and inflow[i] <= (1 - DROP) * norm_in[i]:
            episodes += 1
            last_idx = i
            start = i
            while i < n and norm_in[start] > 0 and inflow[i] <= (1 - DROP) * norm_in[start]:
                i += 1
            end = i  # exclusive
            drop = 1 - inflow[start:end].mean() / norm_in[start]
            worst = max(worst, float(drop))
            if norm_out[start] > 0 and drop > 0:
                spend_change = 1 - out[start:end].mean() / norm_out[start]
                responses.append(float(spend_change / drop))
            if neg[start:end].sum() > 0:
                dipped = True
            if norm_bal[start] > 0:
                rec = None
                for k in range(end, n):
                    if bal[k] >= norm_bal[start]:
                        rec = k - end + 1
                        break
                recoveries.append(rec if rec is not None else np.nan)
            continue
        i += 1
    res["shock_episodes"] = episodes
    res["worst_income_drop"] = round(worst, 3)
    if responses:
        res["spending_response"] = float(np.clip(np.median(responses), -2, 2))
    res["episode_dipped_negative"] = bool(dipped)
    if recoveries:
        finite = [r for r in recoveries if r == r]
        res["recovery_months"] = float(np.median(finite)) if finite else np.inf
    if last_idx is not None:
        res["last_episode_months_ago"] = int(n - 1 - last_idx)
    return res


def history_table(ms: pd.DataFrame) -> pd.DataFrame:
    rows = {acct: account_history(g) for acct, g in ms.groupby("account_id", sort=True)}
    df = pd.DataFrame.from_dict(rows, orient="index")
    df.index.name = "account_id"
    return df


HISTORY_DOCS = {
    "shock_episodes": "times inflow fell at least 40% below the account's own trailing six-month median",
    "worst_income_drop": "deepest observed income fall, as a share of the norm",
    "spending_response": "how much spending fell relative to income in those months (1 = fully, 0 = not at all, negative = spent more)",
    "episode_dipped_negative": "an observed income fall ended with a negative-balance day",
    "recovery_months": "months after an episode until the average balance was back to its pre-episode level",
    "last_episode_months_ago": "months since the last observed income fall",
}


def default_validation(f: pd.DataFrame, loans: pd.DataFrame, flag_matrix: pd.DataFrame) -> dict:
    """Ground truth: accounts whose loans went bad (status B or D) versus the rest, by flag and by simulated survival."""
    bad = set(loans.loc[loans["status"].isin(["B", "D"]), "account_id"].astype(int))
    with_loan = set(loans["account_id"].astype(int))
    idx = [a for a in f.index if a in with_loan]
    if len(idx) < 50:
        return {"available": False}
    sub = f.loc[idx]
    is_bad = pd.Series([a in bad for a in idx], index=idx)
    out = {"available": True, "loans": len(idx), "bad": int(is_bad.sum()), "bad_rate_pct": round(float(is_bad.mean() * 100), 1), "by_flag": [], "by_survival": {}}
    for col in flag_matrix.columns:
        if col in VALIDATION_CIRCULAR:
            continue
        fm = flag_matrix.loc[idx, col]
        n1 = int(fm.sum())
        if n1 < 15 or (len(idx) - n1) < 15:
            continue
        r1 = float(is_bad[fm].mean() * 100)
        r0 = float(is_bad[~fm].mean() * 100)
        out["by_flag"].append({"flag": col, "n_with": n1, "bad_rate_with_pct": round(r1, 1), "bad_rate_without_pct": round(r0, 1), "lift": round((r1 / r0) if r0 > 0 else float("inf"), 2)})
    out["by_flag"].sort(key=lambda d: -abs(d["bad_rate_with_pct"] - d["bad_rate_without_pct"]))
    surv = sub["survives6_layoff"].astype(bool)
    out["by_survival"] = {"fails_layoff_bad_rate_pct": round(float(is_bad[~surv].mean() * 100), 1) if (~surv).sum() else None,
                          "survives_layoff_bad_rate_pct": round(float(is_bad[surv].mean() * 100), 1) if surv.sum() else None,
                          "n_fail": int((~surv).sum()), "n_survive": int(surv.sum())}
    return out
