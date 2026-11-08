"""Demographic and location insights: the account owner's age, household and district against everyone else.

Descriptive, not causal. Everything comes from the feature table (owner age, authorized users, card, account age,
official layoff runway) joined with districts.csv. The data is the PKDD'99 Czech bank relabelled to CAD and shifted to
2022-2025, so districts are Czech districts. "Where you live" is the owner's home district (clients.csv).
"""
from __future__ import annotations

import math
from functools import lru_cache

import numpy as np
import pandas as pd

from .data_store import get_store
from .features import get_features

AGE_BANDS = [(0, 30, "18-29"), (30, 45, "30-44"), (45, 60, "45-59"), (60, 200, "60+")]
URBAN_CUTOFF = 70.0
CAVEATS = [
    "The data is the PKDD'99 Czech bank dataset, relabelled to Canadian dollars and shifted to 2022-2025. Districts are Czech districts.",
    "Location is the owner's home district from the client record (the account's branch district if that is missing); the branch can be elsewhere. Age, gender and household describe the account owner.",
    "Ages are derived from birth dates at the end of 2025.",
    "These are descriptions of groups in one bank, not causes. Groups under 30 accounts are marked weak.",
    "Layoff survival uses the official formula: 55% of typical income for six months, lasting if runway is six months or more.",
]


def _band(age: float | None) -> str | None:
    if age is None or not np.isfinite(age):
        return None
    for lo, hi, label in AGE_BANDS:
        if lo <= age < hi:
            return label
    return None


def _money(x: float) -> str:
    return f"${x:,.0f}"


def _pct(x: float, digits: int = 0) -> str:
    return f"{x * 100:.{digits}f}%"


def _strength(n: int) -> str:
    return "strong" if n >= 300 else "moderate" if n >= 30 else "weak"


def _percentile(series: pd.Series, value: float) -> float | None:
    s = series.replace([np.inf], 1e9).dropna()
    if s.empty or value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    v = 1e9 if value == np.inf else value
    return round(float((s < v).mean() * 100 + (s == v).mean() * 50), 1)


@lru_cache(maxsize=1)
def _population() -> pd.DataFrame:
    f = get_features()
    store = get_store()
    d = store.districts.set_index("district_id")
    p = pd.DataFrame(index=f.index)
    p["age"] = f.get("owner_age")
    p["gender"] = f.get("owner_gender")
    p["owners"] = 1 + f.get("n_authorized_users", 0).fillna(0).astype(int)
    p["card_rank"] = f.get("card_rank", 0).fillna(0).astype(int)
    p["account_years"] = f.get("account_age_years")
    branch = f["district_id"].astype("Int64")
    p["branch_district_id"] = branch
    p["district_id"] = branch
    try:  # where the owner lives (clients.csv), which can differ from the account's branch
        clients = pd.read_csv(store.data_dir / "clients.csv", usecols=["client_id", "district_id"])
        disp = pd.read_csv(store.data_dir / "dispositions.csv", usecols=["client_id", "account_id", "type"])
        home = (disp[disp["type"] == "owner"].merge(clients, on="client_id", how="left")
                .groupby("account_id")["district_id"].first())
        p["district_id"] = home.reindex(p.index).astype("Int64").fillna(branch)
    except (FileNotFoundError, ValueError, KeyError):
        pass
    for col in ("I", "S", "spending_ratio", "income_cv", "runway_layoff", "survives6_layoff", "shock_episodes",
                "insurance_share", "pension_share", "inflow_regular_share"):
        p[col] = f[col] if col in f else np.nan
    p["spending_ratio"] = p["spending_ratio"].replace([np.inf, -np.inf], np.nan)
    p["survives6_layoff"] = p["survives6_layoff"].astype(bool)
    did = p["district_id"]
    p["district_name"] = did.map(d["district_name"])
    p["region"] = did.map(d["region"])
    p["urban_ratio"] = did.map(d["urban_ratio_pct"])
    p["salary"] = did.map(d["average_salary"])
    p["unemp22"] = did.map(d["unemployment_rate_2022"])
    p["unemp23"] = did.map(d["unemployment_rate_2023"])
    p["entre"] = did.map(d["entrepreneurs_per_1000"])
    p["crime_pk"] = did.map(d["crimes_2023"] / d["inhabitants"] * 1000)
    p["age_band"] = p["age"].map(_band)
    p["urban"] = np.where(p["urban_ratio"] >= URBAN_CUTOFF, "Urban", "Rural or mixed")
    p["unemployment_trend"] = np.where(p["unemp23"] > p["unemp22"], "Rising",
                                       np.where(p["unemp22"].isna(), "No 2022 figure", "Flat or falling"))
    p["household"] = np.where(p["owners"] > 1, "Two people", "One owner")
    return p


@lru_cache(maxsize=1)
def _districts() -> pd.DataFrame:
    d = get_store().districts.copy()
    d["crime_pk"] = d["crimes_2023"] / d["inhabitants"] * 1000
    return d.set_index("district_id")


@lru_cache(maxsize=1)
def _group_tables() -> dict[str, pd.DataFrame]:
    p = _population()
    out = {}
    for dim, col in (("age_band", "age_band"), ("region", "region"), ("urban", "urban"),
                     ("unemployment_trend", "unemployment_trend"), ("household", "household")):
        g = p.dropna(subset=[col]).groupby(col).agg(n=("I", "size"), surv=("survives6_layoff", "mean"),
                                                    sr=("spending_ratio", "median"))
        out[dim] = g
    return out


def _groups(row: pd.Series) -> list[dict]:
    mine_key = {"age_band": row["age_band"], "region": row["region"], "urban": row["urban"],
                "unemployment_trend": row["unemployment_trend"], "household": row["household"]}
    order = {"age_band": [b[2] for b in AGE_BANDS]}
    rows = []
    for dim, g in _group_tables().items():
        labels = order.get(dim, list(g.sort_values("surv", ascending=False).index))
        for label in labels:
            if label not in g.index:
                continue
            r = g.loc[label]
            rows.append({"dimension": dim, "label": str(label), "n": int(r.n),
                         "survive6_layoff_pct": round(float(r.surv) * 100, 1),
                         "median_spend_ratio": round(float(r.sr), 3), "mine": label == mine_key[dim]})
    return rows


def _insights(aid: int, row: pd.Series, p: pd.DataFrame) -> list[dict]:
    overall = float(p["survives6_layoff"].mean())
    tables = _group_tables()
    out: list[dict] = []

    def add(key, title, plain, technical, value, compare, percentile, n, category, score):
        out.append({"key": key, "title": title, "plain": plain, "technical": technical, "value": value,
                    "compare": compare, "percentile": percentile, "strength": _strength(int(n)),
                    "category": category, "_score": float(score)})

    district = row["district_name"]
    same_d = p[p["district_id"] == row["district_id"]]

    # 1. Income against the local average salary.
    if row["salary"] and np.isfinite(row["salary"]) and np.isfinite(row["I"]):
        ratio = row["I"] / row["salary"]
        pct_d = _percentile(same_d["I"], row["I"])
        more = "more" if ratio >= 1 else "less"
        add("income_vs_district", "Your income against local pay",
            f"You bring in about {ratio:.1f} times the average salary in {district}. "
            f"Of the {len(same_d)} account holders who live there, you bring in more than {pct_d:.0f}%."
            if pct_d is not None else f"You bring in about {ratio:.1f} times the average salary in {district}.",
            f"I = {_money(row['I'])}/mo vs district average salary {_money(row['salary'])} (ratio {ratio:.2f}); "
            f"percentile of I within district {row['district_id']} (n = {len(same_d)}): {pct_d}.",
            f"{ratio:.1f}x local pay", f"{more} than the district average", pct_d, len(same_d), "economy",
            abs(math.log(max(ratio, 1e-3))) * 2 + 0.5)

    # 2. Age band.
    band = row["age_band"]
    if band and band in tables["age_band"].index:
        g = tables["age_band"]
        mine = g.loc[band]
        best = g["surv"].idxmax()
        band_p = p[p["age_band"] == band]
        rank = _percentile(band_p["runway_layoff"], row["runway_layoff"])
        diff = (mine.surv - overall) * 100
        word = "above" if diff > 1 else "below" if diff < -1 else "about the same as"
        extra = (f" The group that does best is {best} ({g.loc[best].surv * 100:.0f}%), mostly because pensions keep arriving when work stops."
                 if best != band else " Your age group does best of all, mostly because pensions keep arriving when work stops.")
        add("age_band", "What your age says",
            f"People aged {band} in this bank last a six-month layoff {mine.surv * 100:.0f}% of the time, {word} the "
            f"{overall * 100:.0f}% overall.{extra} Among people your age, your own runway is longer than {rank:.0f}%."
            if rank is not None else
            f"People aged {band} last a six-month layoff {mine.surv * 100:.0f}% of the time, {word} the {overall * 100:.0f}% overall.{extra}",
            f"P(survive6 | age {band}) = {mine.surv:.3f} (n = {int(mine.n)}) vs {overall:.3f} overall; median S/I {mine.sr:.3f}. "
            f"Best band {best}: {g.loc[best].surv:.3f}. Runway percentile within band: {rank}.",
            f"{mine.surv * 100:.0f}% survive", f"{overall * 100:.0f}% overall", rank, int(mine.n), "age",
            abs(diff) / 4 + (1.5 if best != band and g.loc[best].surv - mine.surv > 0.2 else 0.5))

    # 3. Region, with the salary twist when pay and survival rank differently.
    reg = row["region"]
    if isinstance(reg, str) and reg in tables["region"].index:
        g = tables["region"].copy()
        sal = p.groupby("region")["salary"].mean()
        g["sal"] = sal
        n_reg = len(g)
        surv_rank = int(g["surv"].rank(ascending=False)[reg])
        sal_rank = int(g["sal"].rank(ascending=False)[reg])
        mine = g.loc[reg]
        twist = ""
        if sal_rank <= 2 and surv_rank >= n_reg - 1:
            twist = " That is despite some of the highest salaries in the country: higher pay tends to come with higher spending."
        elif sal_rank >= n_reg - 1 and surv_rank <= 2:
            twist = " That is despite some of the lowest salaries: spending here stays closer to income."
        add("region", "Your region",
            f"Accounts in {reg} last a six-month layoff {mine.surv * 100:.0f}% of the time, "
            f"{_ordinal(surv_rank)} of {n_reg} regions.{twist}",
            f"P(survive6 | region = {reg}) = {mine.surv:.3f} (n = {int(mine.n)}); rank {surv_rank}/{n_reg} on survival, "
            f"{sal_rank}/{n_reg} on mean district salary ({_money(g.loc[reg].sal)}); median S/I {mine.sr:.3f}.",
            f"{_ordinal(surv_rank)} of {n_reg}", f"{overall * 100:.0f}% overall", None, int(mine.n), "location",
            abs(mine.surv - overall) * 100 / 4 + (2.0 if twist else 0.3))

    # 4. Local unemployment trend and what it means for the layoff card.
    u22, u23 = row["unemp22"], row["unemp23"]
    if np.isfinite(u23):
        dd = _districts()
        rising = int((dd["unemployment_rate_2023"] > dd["unemployment_rate_2022"]).sum())
        n_d = int(dd[["unemployment_rate_2022", "unemployment_rate_2023"]].notna().all(axis=1).sum())
        pct_u = _percentile(dd["unemployment_rate_2023"], u23)
        if np.isfinite(u22):
            move = "rose" if u23 > u22 else "fell" if u23 < u22 else "held"
            head = f"Unemployment where you live {move} from {u22:.2f}% to {u23:.2f}%, and it rose in {rising} of {n_d} districts."
        else:
            head = f"Unemployment where you live was {u23:.2f}% in 2023."
        level = ("among the lowest in the country: work has been easier to find here than almost anywhere, which matters if the layoff card comes up" if pct_u is not None and pct_u <= 25
                 else "among the highest in the country, so it makes sense to plan for the full six months" if pct_u is not None and pct_u >= 75
                 else "around the middle of the country")
        add("unemployment", "Local job market",
            f"{head} Your district's rate is {level}.",
            f"District {row['district_id']} unemployment 2022 {u22}% -> 2023 {u23}%; percentile among {n_d} districts: {pct_u}. "
            f"Districts with rising unemployment: {rising}/{n_d}. Survival by trend: "
            + "; ".join(f"{k} {v.surv:.3f} (n = {int(v.n)})" for k, v in tables["unemployment_trend"].iterrows()) + ".",
            f"{u23:.2f}% in 2023", f"{dd['unemployment_rate_2023'].median():.2f}% median district", pct_u, n_d, "economy",
            1.5 + (1.0 if pct_u is not None and (pct_u <= 15 or pct_u >= 85) else 0))

    # 5. Household: one owner or shared.
    g = tables["household"]
    hh = row["household"]
    if hh in g.index and len(g) == 2:
        joint = "Two people"
        diff = (g.loc[joint].surv - g.loc["One owner"].surv) * 100
        if hh == joint:
            plain = (f"Your account is shared with a second person. Shared accounts last a layoff {g.loc[joint].surv * 100:.0f}% of the time, "
                     f"against {g.loc['One owner'].surv * 100:.0f}% for single owners: two people can absorb a shock between them.")
        else:
            plain = (f"Your account has one owner. Accounts shared with a second person last a layoff {g.loc[joint].surv * 100:.0f}% of the time, "
                     f"against {g.loc['One owner'].surv * 100:.0f}% for single owners, and they spend a smaller share of what comes in.")
        add("household", "One owner or two",
            plain,
            f"P(survive6 | joint) = {g.loc[joint].surv:.3f} (n = {int(g.loc[joint].n)}), single {g.loc['One owner'].surv:.3f} "
            f"(n = {int(g.loc['One owner'].n)}); median S/I {g.loc[joint].sr:.3f} vs {g.loc['One owner'].sr:.3f}. Difference {diff:+.1f} pp.",
            "Shared account" if hh == joint else "One owner", "vs shared accounts" if hh != joint else "vs one owner", None, int(g.loc[hh].n), "household", abs(diff) / 3 + 0.5)

    # 6. City or countryside: a non-difference people do not expect.
    g = tables["urban"]
    if len(g) == 2:
        a, b = g.index[0], g.index[1]
        gap = abs(g.loc[a].sr - g.loc[b].sr) * 100
        sgap = abs(g.loc[a].surv - g.loc[b].surv) * 100
        mine_u = row["urban"]
        if gap < 2 and sgap < 3:
            plain = (f"You might expect city life to cost more. In this bank it barely matters: accounts in urban and rural districts both "
                     f"spend about {g['sr'].mean() * 100:.0f}% of what comes in and last a layoff equally often. Your habits matter far more than your postcode.")
            score = 2.0
        else:
            plain = (f"Accounts in {mine_u.lower()} districts spend {g.loc[mine_u].sr * 100:.0f}% of what comes in and last a layoff "
                     f"{g.loc[mine_u].surv * 100:.0f}% of the time.")
            score = 1.0 + gap / 3
        add("urban", "City or countryside", plain,
            "; ".join(f"{k}: median S/I {v.sr:.3f}, P(survive6) {v.surv:.3f} (n = {int(v.n)})" for k, v in g.iterrows())
            + f". Urban = district urban ratio >= {URBAN_CUTOFF:.0f}%; yours {row['urban_ratio']:.1f}%.",
            f"{row['urban_ratio']:.0f}% urban", "same as rural" if gap < 2 else "differs", None, int(g["n"].sum()), "location", score)

    # 7. Entrepreneurship nearby vs the person's own income regularity.
    if np.isfinite(row["entre"]):
        dd = _districts()
        pct_e = _percentile(dd["entrepreneurs_per_1000"], row["entre"])
        cv_pct = _percentile(p["income_cv"], row["income_cv"])
        valid = p[["entre", "income_cv"]].replace([np.inf, -np.inf], np.nan).dropna()
        corr = float(np.corrcoef(valid["entre"], valid["income_cv"])[0, 1]) if len(valid) > 10 else float("nan")
        steady = "steadier" if cv_pct is not None and cv_pct < 50 else "more uneven"
        add("entrepreneurs", "Self-employment around you",
            f"Your district has {row['entre']:.0f} business owners per 1,000 people, more than {pct_e:.0f}% of districts. "
            f"That says little about you: your own income is {steady} than {100 - cv_pct if steady == 'steadier' else cv_pct:.0f}% of accounts, "
            f"and across the bank, local entrepreneurship barely predicts uneven pay." if cv_pct is not None and pct_e is not None else
            f"Your district has {row['entre']:.0f} business owners per 1,000 people.",
            f"entrepreneurs_per_1000 = {row['entre']:.0f} (district percentile {pct_e}); income_cv = {row['income_cv']:.3f} "
            f"(percentile {cv_pct}); corr(entrepreneurs, income_cv) across accounts r = {corr:.3f}.",
            f"{row['entre']:.0f} per 1,000", f"{dd['entrepreneurs_per_1000'].median():.0f} median", pct_e, len(valid), "economy",
            1.2 + (0.8 if pct_e is not None and (pct_e >= 85 or pct_e <= 15) else 0))

    # 8. Crime, only when the district is unusual, linked to insurance.
    if np.isfinite(row["crime_pk"]):
        dd = _districts()
        pct_c = _percentile(dd["crime_pk"], row["crime_pk"])
        if pct_c is not None and (pct_c >= 80 or pct_c <= 20):
            ins = float(row["insurance_share"]) if np.isfinite(row["insurance_share"]) else 0.0
            ins_text = ("You already pay insurance from this account." if ins > 0 else
                        "No insurance payments leave this account, so home and contents cover may be worth checking.")
            high = pct_c >= 80
            add("crime", "Local crime and cover",
                f"Your district records {row['crime_pk']:.0f} crimes per 1,000 people a year, "
                f"{'more' if high else 'fewer'} than {pct_c if high else 100 - pct_c:.0f}% of districts. "
                + (ins_text if high else "Theft or damage is less likely here than in most places."),
                f"crimes_2023 / inhabitants x 1000 = {row['crime_pk']:.1f}; district percentile {pct_c}; insurance share of outflow {ins:.3f}.",
                f"{row['crime_pk']:.0f} per 1,000", f"{dd['crime_pk'].median():.0f} median", pct_c, len(dd), "location",
                1.0 + (0.8 if high and ins == 0 else 0))

    # 9. How long they have banked here, and the card.
    if np.isfinite(row["account_years"]):
        pct_a = _percentile(p["account_years"], row["account_years"])
        cards = {0: "no card", 1: "a junior card", 2: "a classic card", 3: "a gold card"}
        cg = p.groupby("card_rank").agg(n=("I", "size"), surv=("survives6_layoff", "mean"))
        best = int(cg["surv"].idxmax())
        worst = int(cg["surv"].idxmin())
        mine_c = int(row["card_rank"])
        add("tenure_card", "Your history with the bank",
            f"You opened this account {row['account_years']:.1f} years ago, {'earlier' if pct_a >= 50 else 'later'} than "
            f"{pct_a if pct_a >= 50 else 100 - pct_a:.0f}% of customers, and you hold {cards.get(mine_c, 'no card')}. "
            f"Holders of {cards[best]} last a layoff most often ({cg.loc[best].surv * 100:.0f}%), holders of {cards[worst]} least "
            f"({cg.loc[worst].surv * 100:.0f}%).",
            f"account_age_years = {row['account_years']:.2f} (percentile {pct_a}); card_rank {mine_c}; P(survive6 | card) = "
            + ", ".join(f"{cards[int(k)]} {v.surv:.3f} (n = {int(v.n)})" for k, v in cg.iterrows()) + ".",
            f"{row['account_years']:.1f} years", f"{p['account_years'].median():.1f} median", pct_a, int(cg.loc[mine_c].n) if mine_c in cg.index else 0,
            "banking", 0.9 + abs(cg.loc[best].surv - cg.loc[worst].surv) * 3)

    # 10. Sharp income drops: the person against their own district.
    if "shock_episodes" in row and np.isfinite(row["shock_episodes"]):
        eps = int(row["shock_episodes"])
        share_d = float((same_d["shock_episodes"].fillna(0) >= 1).mean()) if len(same_d) else float("nan")
        share_all = float((p["shock_episodes"].fillna(0) >= 1).mean())
        lived = (f"You have already lived through {eps} sharp income drop{'s' if eps != 1 else ''} in these records."
                 if eps else "Your records show no sharp income drop so far.")
        add("income_drops", "Income drops around you",
            f"{lived} In {district}, {share_d * 100:.0f}% of accounts had at least one, against {share_all * 100:.0f}% across the bank.",
            f"shock_episodes (inflow >= 40% below own trailing 6-month median) = {eps}; share with >= 1 episode: district "
            f"{share_d:.3f} (n = {len(same_d)}), bank {share_all:.3f}.",
            f"{eps} drop{'s' if eps != 1 else ''}", f"{share_d * 100:.0f}% of neighbours had one", None, len(same_d), "economy",
            0.8 + (1.0 if eps else 0) + abs(share_d - share_all) * 5)

    out.sort(key=lambda r: r["_score"], reverse=True)
    for r in out:
        r.pop("_score", None)
    return out[:10]


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _f(x, default=0.0) -> float:
    try:
        v = float(x)
        return v if math.isfinite(v) else default
    except (TypeError, ValueError):
        return default


def demographics(account_id: int) -> dict:
    p = _population()
    aid = int(account_id)
    if aid not in p.index:
        raise KeyError(aid)
    row = p.loc[aid]
    age = _f(row["age"], None) if row["age"] is not None else None
    dd = _districts()
    drow = dd.loc[int(row["district_id"])] if pd.notna(row["district_id"]) and int(row["district_id"]) in dd.index else None
    cards = {0: None, 1: "junior", 2: "classic", 3: "gold"}
    person = {
        "age": int(age) if age is not None else None, "age_band": row["age_band"] or "unknown",
        "gender": row["gender"] if isinstance(row["gender"], str) else None,
        "owners": int(row["owners"]), "joint": bool(row["owners"] > 1),
        "card": cards.get(int(row["card_rank"])), "account_years": round(_f(row["account_years"]), 1),
    }
    district = {
        "id": int(row["district_id"]) if pd.notna(row["district_id"]) else 0,
        "name": str(drow["district_name"]) if drow is not None else "unknown",
        "branch_name": str(dd.loc[int(row["branch_district_id"]), "district_name"])
        if pd.notna(row["branch_district_id"]) and int(row["branch_district_id"]) in dd.index else None,
        "region": str(drow["region"]) if drow is not None else "unknown",
        "inhabitants": int(_f(drow["inhabitants"])) if drow is not None else 0,
        "urban_ratio_pct": round(_f(row["urban_ratio"]), 1),
        "average_salary": round(_f(row["salary"]), 2),
        "unemployment_2022": round(_f(row["unemp22"]), 2),
        "unemployment_2023": round(_f(row["unemp23"]), 2),
        "entrepreneurs_per_1000": round(_f(row["entre"]), 1),
        "crimes_per_1000": round(_f(row["crime_pk"]), 1),
    }
    return {"account_id": aid, "person": person, "district": district,
            "insights": _insights(aid, row, p), "groups": _groups(row), "caveats": CAVEATS}
