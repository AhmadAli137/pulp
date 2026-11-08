"""Stage 1 deterministic parts on a synthetic population: features, flags, clustering, battery, narrator template."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services import features as F
from app.services.archetypes import cluster_accounts, describe_clusters, rule_name
from app.services.hunter import Toolbox, MIN_GROUP
from app.services.narrator import template_narrative


def _row(**kw) -> pd.Series:
    base = dict(I=4000.0, S=3600.0, H=1000.0, B=6000.0, P=0.0, months=30, neg_days=0, spending_ratio=0.9, income_cv=0.2,
                inflow_regular_share=0.8, pension_share=0.0, cash_deposit_share=0.2, fee_share=0.001, fee_months_share=0.8,
                neg_months_share=0.0, timing_dip_share=0.0, lifestyle_creep=0.0, spending_drift_pm=0.0, income_drift_pm=0.0,
                balance_trend_pm=0.0, bills_share_trend=0.0, regular_transfer_out=False, regular_transfer_out_amount=0.0,
                has_running_loan=False, loan_in_debt=False, loan_payment_share=0.0, inflow_vs_district_salary=1.0, district_salary=4000.0,
                runway_layoff=np.inf, survives6_layoff=True)
    base.update(kw)
    return pd.Series(base)


def test_flags_fire_on_their_rules_and_carry_numbers():
    r = _row(spending_ratio=0.97, neg_days=0, runway_layoff=4.2, regular_transfer_out=True, regular_transfer_out_amount=250.0)
    keys = {f["key"]: f for f in F.flags_for(r)}
    assert {"thin_margin", "fragile_but_clean", "savings_elsewhere"} <= set(keys)
    assert "97%" in keys["thin_margin"]["evidence"]
    assert "4.2 months" in keys["fragile_but_clean"]["evidence"]
    assert "$250" in keys["savings_elsewhere"]["evidence"]
    # risk flags sort first
    assert [f["severity"] for f in F.flags_for(r)] == sorted([f["severity"] for f in F.flags_for(r)], key=lambda s: {"risk": 0, "watch": 1, "info": 2}[s])


def test_timing_dips_needs_negative_months_with_covered_outflow():
    yes = _row(neg_months_share=0.2, timing_dip_share=0.75, months=30)
    no = _row(neg_months_share=0.2, timing_dip_share=0.1, months=30)
    assert "timing_dips" in {f["key"] for f in F.flags_for(yes)}
    assert "timing_dips" not in {f["key"] for f in F.flags_for(no)}


def test_slope_share_is_zero_for_short_or_flat_and_positive_for_rising():
    assert F._slope_share(np.array([1.0, 2.0]), 10.0) == 0.0
    assert F._slope_share(np.full(12, 5.0), 5.0) == pytest.approx(0.0)
    assert F._slope_share(np.arange(12, dtype=float), 10.0) == pytest.approx(0.1)


def _synthetic_features(n: int = 400, seed: int = 1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    kind = rng.integers(0, 3, n)                      # 0 cash, 1 transfer, 2 pension
    I = np.where(kind == 2, 3000, 6000) * rng.uniform(0.6, 1.4, n)
    ratio = rng.uniform(0.6, 1.05, n)
    S = I * ratio
    B = S * rng.uniform(0.2, 12, n)
    f = pd.DataFrame({
        "I": I, "S": S, "H": S * 0.3, "F": S * 0.35, "B": B, "P": 0.0, "months": 36, "neg_days": rng.integers(0, 5, n),
        "min_balance": B * 0.1, "income_cv": rng.uniform(0.05, 1.5, n), "spending_ratio": ratio, "surplus": I - S,
        "has_loan": False, "loan_status": None,
        "pension_share": np.where(kind == 2, 0.97, 0.0), "cash_deposit_share": np.where(kind == 0, 0.98, 0.01),
        "transfer_in_share": np.where(kind == 1, 0.97, 0.01), "bills_share": rng.uniform(0.1, 0.5, n), "insurance_share": 0.05,
        "loan_share": 0.0, "fee_share": rng.uniform(0, 0.006, n), "cash_wd_share": rng.uniform(0, 1, n), "card_wd_share": rng.uniform(0, 0.5, n),
        "transfer_out_share": rng.uniform(0, 0.5, n), "fee_months_share": 0.8, "neg_months_share": rng.uniform(0, 0.3, n),
        "timing_dip_share": rng.uniform(0, 1, n), "inflow_regular_share": rng.uniform(0, 1, n), "spending_drift_pm": 0.0, "income_drift_pm": 0.0,
        "lifestyle_creep": rng.normal(0, 0.01, n), "balance_trend_pm": rng.normal(0, 0.05, n), "bills_share_trend": rng.normal(0, 0.05, n),
        "december_spend_ratio": 1.0, "max_drawdown_share": rng.uniform(0, 1, n), "regular_transfer_out": rng.random(n) < 0.3,
        "regular_transfer_out_amount": 100.0, "has_running_loan": rng.random(n) < 0.1, "loan_in_debt": False, "loan_payment_share": 0.0,
        "owner_age": rng.uniform(20, 80, n), "n_authorized_users": 0, "card_rank": 0, "account_age_years": rng.uniform(1, 6, n),
        "district_salary": 4000.0, "inflow_vs_district_salary": I / 4000.0, "n_standing_orders": 0, "so_unlabelled_amount": 0.0,
    }, index=pd.Index(range(1, n + 1), name="account_id"))
    gap = S - 0.55 * I
    runway = np.where(gap <= 0, np.inf, B / np.where(gap > 0, gap, 1))
    f["runway_layoff"] = runway
    f["survives6_layoff"] = runway >= 6
    gap2 = S + 0.15 * f.H - 0.55 * I
    runway2 = np.where(gap2 <= 0, np.inf, B / np.where(gap2 > 0, gap2, 1))
    f["runway_combined"] = runway2
    f["survives6_combined"] = runway2 >= 6
    return f


def test_clustering_is_deterministic_and_described_in_numbers():
    f = _synthetic_features()
    a = cluster_accounts(f, k=3)
    b = cluster_accounts(f, k=3)
    assert a.equals(b)
    assert set(a.unique()) == {0, 1, 2}
    assert a.value_counts().is_monotonic_decreasing  # relabelled by size
    descs = describe_clusters(f, a)
    assert len(descs) == 3 and all(d["size"] >= 1 for d in descs)
    assert all("distinguishing" in d and d["distinguishing"] for d in descs)
    names = [rule_name(d) for d in descs]
    assert all(n["name"] and 0 <= n["confidence"] <= 1 for n in names)


def test_toolbox_budget_and_finding_gate():
    f = _synthetic_features()
    tb = Toolbox(f, budget=3)
    assert "features" in tb.list_features()
    r = tb.survival_by_quantile("spending_ratio", "layoff", 4)
    assert len(r["bins"]) == 4 and all(b["n"] >= MIN_GROUP for b in r["bins"])
    assert "spearman" in tb.correlation("B", "runway_layoff_capped")
    assert "error" in tb.describe("I")                       # 4th call: over budget
    tb2 = Toolbox(f, budget=10)
    assert "error" in tb2.record_finding("t", "no numbers here at all", "ev", "strong")
    assert tb2.record_finding("t", "Group A survives 80% versus 40% for group B", "ev", "moderate") == {"recorded": 1}
    assert tb2.findings[0]["strength"] == "moderate"


def test_template_narrative_uses_flags_and_archetype():
    flags = F.flags_for(_row(spending_ratio=0.98))
    arch = {"name": "Steady transfer income", "share": 0.2, "survive6_layoff_pct": 70.0}
    nar = template_narrative(flags, arch)
    assert nar["source"] == "template"
    assert nar["insights"][0]["flag"] == "thin_margin"
    assert any(i["flag"] == "archetype" and "Steady transfer income" in i["text"] for i in nar["insights"])
    empty = template_narrative([], None)
    assert empty["insights"][0]["flag"] == "none"
