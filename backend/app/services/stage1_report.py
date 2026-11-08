"""Stage 1 report: everything PULP learned before anyone spoke, in plain language and in technical detail.

Deterministic and model-free. The dataset part is built once per process from the committed artefacts
(feature table, archetypes.json, hunter_findings.json, docs/findings.json) and cached; the account part is
computed on request. Every optional input (persona, archetypes, hunter run, findings) may be missing.

Shape (docs/agents/v2-contracts.md): {generated_at, account_id, plain: {title, summary, sections},
technical: {title, summary, sections}}; a section is {heading, body, table?: {headers, rows}}.
"""
from __future__ import annotations

import copy
import math
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_LOCK = threading.Lock()
_CACHE: dict = {}

TRANSACTIONS_ROWS = 1_056_320  # transactions.csv is not shipped in data/; count from the challenge export

FILE_NOTES = {
    "accounts.csv": ("accounts", "one row per account: branch district, opening date, statement frequency"),
    "clients.csv": ("clients", "people linked to accounts: birth year, gender, home district"),
    "dispositions.csv": ("dispositions", "who may use each account (owner or authorised user)"),
    "cards.csv": ("cards", "debit and credit cards issued, with card type"),
    "loans.csv": ("loans", "one loan per borrower: amount, term, monthly payment, status at end of 2025"),
    "standing_orders.csv": ("standing orders", "recurring payment instructions: amount, purpose, recipient bank"),
    "districts.csv": ("districts", "regional context: average salary, unemployment, population"),
    "monthly_summary.csv": ("monthly summaries", "one row per account per month: money in and out by type, balances, days below zero"),
    "transactions.csv": ("transactions", "every individual transaction (used offline to build payday, bill and penalty signals)"),
}

GROUPS: list[tuple[str, str, list[str]]] = [
    ("Money in and out", "how much arrives, how much leaves and where it goes",
     ["I", "S", "H", "B", "P", "months", "spending_ratio", "surplus", "pension_share", "cash_deposit_share", "transfer_in_share",
      "bills_share", "insurance_share", "loan_share", "fee_share", "cash_wd_share", "card_wd_share", "transfer_out_share"]),
    ("Regularity and timing", "how steady income is and whether bills land before payday",
     ["income_cv", "inflow_regular_share", "payday_dom", "payday_regular_share", "bill_dom", "bills_before_pay_share",
      "timing_dip_share", "neg_months_share", "neg_days", "december_spend_ratio"]),
    ("Habits and fees", "slow drifts in spending and the cost of running short",
     ["fee_months_share", "spending_drift_pm", "income_drift_pm", "lifestyle_creep", "balance_trend_pm", "bills_share_trend",
      "max_drawdown_share", "penalty_events", "penalty_total", "penalty_months"]),
    ("History of income drops", "what happened the last times income fell, and how the household reacted",
     ["shock_episodes", "worst_income_drop", "spending_response", "episode_dipped_negative", "recovery_months", "last_episode_months_ago"]),
    ("Loans", "running loans, their weight and whether they are in trouble",
     ["loan_payment_share", "has_running_loan", "loan_in_debt"]),
    ("People and place", "who holds the account, where, and who they pay regularly",
     ["owner_age", "n_authorized_users", "card_rank", "account_age_years", "district_salary", "inflow_vs_district_salary",
      "district_unemployment", "n_standing_orders", "so_unlabelled_amount", "regular_transfer_out", "regular_transfer_out_amount",
      "recurring_partner_amount", "recurring_partner_months", "recurring_partner_purpose", "n_partners_out"]),
    ("Resilience under the official shocks", "the judges' runway formula applied to every account",
     ["runway_layoff", "survives6_layoff", "runway_combined", "survives6_combined"]),
]

DEFINITIONS = [
    ["I", "Typical money in", "median of monthly money_in"],
    ["S", "Typical spending", "median of monthly money_out"],
    ["F", "Fixed costs", "median of household_bills + insurance + loan_payments (shown, not added again)"],
    ["H", "Household bills", "median of monthly household_bills"],
    ["B", "Cash buffer", "mean of avg_daily_balance over the last six months"],
    ["P", "Loan payment", "monthly_payment if the loan is still running at the end of 2025"],
    ["Shock", "Income and spending after", "income = r x I; spending = S + h x H; one-off cost taken from B first"],
    ["Runway", "Months the buffer lasts", "(B - one-off) / (spending after - income after); 0 if the buffer is gone, "
     "'no shortfall (120+)' if income still covers spending, otherwise capped at 120"],
]


# ----------------------------------------------------------------------------- helpers
def _num(x: Any, d: int = 2):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(v):
        return None
    return round(v, d) if not math.isinf(v) else v


def _money(x: Any) -> str:
    v = _num(x, 2)
    if v is None:
        return "n/a"
    return f"-${abs(v):,.0f}" if v < 0 else f"${v:,.0f}"


def _round_money(x: Any) -> str:
    """Friendly rounding for the plain half: $13,392 -> about $13,400."""
    v = _num(x, 2)
    if v is None:
        return "n/a"
    step = 100 if abs(v) >= 1000 else 10
    r = round(v / step) * step
    return f"-${abs(r):,.0f}" if r < 0 else f"${r:,.0f}"


def _pct(x: Any, d: int = 0) -> str:
    v = _num(x, 4)
    return "n/a" if v is None else f"{v:.{d}f}%"


def _share(x: Any, d: int = 0) -> str:
    v = _num(x, 4)
    return "n/a" if v is None else f"{v * 100:.{d}f}%"


def _months(x: Any) -> str:
    v = _num(x, 2)
    if v is None:
        return "n/a"
    if math.isinf(v) or v >= 120:
        return "no shortfall (120+)"
    return f"{v:.1f}"


def _section(heading: str, body: str, headers: list | None = None, rows: list | None = None) -> dict:
    s = {"heading": heading, "body": body.strip()}
    if headers and rows:
        s["table"] = {"headers": [str(h) for h in headers],
                      "rows": [[c if isinstance(c, (int, float)) and not isinstance(c, bool) else str(c) for c in r] for r in rows]}
    return s


def _ordinal_pct(p: Any) -> str:
    v = _num(p, 0)
    if v is None:
        return "n/a"
    n = int(v)
    suf = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suf}"


# ----------------------------------------------------------------------------- dataset facts
def data_files() -> list[dict]:
    """Rows per input table (header excluded). Cached; transactions counted from the full export when present."""
    if "files" in _CACHE:
        return _CACHE["files"]
    out: list[dict] = []
    try:
        from ..config import REPO_ROOT, find_data_dir
        d = find_data_dir()
    except Exception:
        d, REPO_ROOT = None, Path(".")
    for name, (label, desc) in FILE_NOTES.items():
        rows = None
        p = Path(d) / name if d else None
        if p is not None and p.exists():
            with open(p, "rb") as fh:
                rows = max(0, sum(1 for _ in fh) - 1)
        elif name == "transactions.csv":
            rows = TRANSACTIONS_ROWS
        if rows is not None:
            out.append({"file": name, "label": label, "rows": rows, "description": desc,
                        "shipped": bool(p is not None and p.exists())})
    _CACHE["files"] = out
    return out


def _coverage() -> dict:
    try:
        from .data_store import get_store
        m = get_store().monthly
        months = sorted(m["month"].astype(str).unique())
        return {"first": months[0], "last": months[-1], "n_months": len(months),
                "accounts": int(m["account_id"].nunique()), "account_months": int(len(m))}
    except Exception:
        return {}


def _group_of(key: str) -> str:
    for name, _, keys in GROUPS:
        if key in keys:
            return name
    return "Other"


def _feature_docs() -> dict:
    try:
        from .features import FEATURE_DOCS
        return dict(FEATURE_DOCS)
    except Exception:
        return {}


def _n_signals() -> int:
    try:
        from .features import get_features
        return int(len(get_features().columns))
    except Exception:
        return len(_feature_docs())


def _load_artefacts() -> dict:
    out: dict = {}
    try:
        from .archetypes import get_archetypes
        out["arche"] = get_archetypes() or {}
    except Exception:
        out["arche"] = {}
    try:
        from .hunter import get_findings
        out["hunter"] = get_findings() or {}
    except Exception:
        out["hunter"] = {}
    try:
        from .cohort_analysis import research_summary
        rs = research_summary() or {}
        out["research"] = rs if rs.get("available") else {}
    except Exception:
        out["research"] = {}
    try:
        from .features import FLAG_BY_KEY
        out["flag_labels"] = {k: v.label for k, v in FLAG_BY_KEY.items()}
    except Exception:
        out["flag_labels"] = {}
    return out


# ----------------------------------------------------------------------------- dataset sections
def _dataset_sections() -> dict:
    files = data_files()
    cov = _coverage()
    docs = _feature_docs()
    n_sig = _n_signals()
    art = _load_artefacts()
    arche, hunter, rs, flabels = art["arche"], art["hunter"], art["research"], art["flag_labels"]
    clusters = arche.get("clusters") or []
    n_accounts = cov.get("accounts") or arche.get("n_accounts") or 4500
    period = f"{cov.get('first', '?')} to {cov.get('last', '?')}" if cov else "the recorded period"
    total_rows = sum(f["rows"] for f in files)

    plain: list[dict] = []
    tech: list[dict] = []

    # 1. The data ---------------------------------------------------------------
    plain.append(_section(
        "What we looked at",
        f"Real but anonymized records from a bank: {n_accounts:,} accounts, followed month by month from {period} "
        f"({cov.get('n_months', 'many')} months). That is about {total_rows / 1e6:.1f} million rows across {len(files)} tables, "
        "covering accounts, the people on them, cards, loans, regular payments, regions and every transaction. "
        "Amounts are shown in Canadian dollars. The data comes from the PKDD'99 Discovery Challenge, published by "
        "CTU Prague, and was supplied for the Tangerine track.",
        ["Table", "Rows", "What it holds"],
        [[f["label"].capitalize(), f"{f['rows']:,}", f["description"]] for f in files]))
    tech.append(_section(
        "Data sources and coverage",
        f"Source: PKDD'99 Discovery Challenge Financial dataset (CTU Prague Relational Dataset Repository, "
        f"relational.fel.cvut.cz/dataset/Financial), re-expressed by the organisers as monthly summaries in CAD. "
        f"Coverage: {n_accounts:,} accounts, {cov.get('account_months', 0):,} account-months, {period} "
        f"({cov.get('n_months', '?')} calendar months). The engine reads monthly_summary.csv and loans.csv; the other tables "
        f"feed behavioural signals. transactions.csv ({TRANSACTIONS_ROWS:,} rows) is processed offline into payday, bill-date, "
        "penalty-interest and recurring-partner features (backend/scripts/build_tx_features.py) and is not needed at run time.",
        ["File", "Rows", "Shipped in data/", "Contents"],
        [[f["file"], f["rows"], "yes" if f["shipped"] else "no (offline)", f["description"]] for f in files]))
    tech.append(_section(
        "Official definitions (judges' formulas)",
        "Every number in PULP comes from these definitions, computed in Python. No model produces or edits a number.",
        ["Symbol", "Name", "Definition"], DEFINITIONS))

    # 2. Signals ----------------------------------------------------------------
    grows = []
    for name, desc, keys in GROUPS:
        present = [k for k in keys if k in docs]
        grows.append([name, len(present), desc])
    plain.append(_section(
        "What PULP works out for every account",
        f"Before anyone says a word, PULP turns each account's history into about {n_sig} signals. They answer simple "
        "questions: how much comes in and goes out, how steady the income is, whether bills arrive before payday, "
        "whether fees and penalty interest show up, what happened the last time income fell, whether there is a loan, "
        "and how the account compares with its region. The {sum(g[1] for g in grows)} main ones fall into seven groups.",
        ["Group", "Signals", "What it tells us"], grows))
    tech.append(_section(
        "Feature engineering",
        f"The feature table (backend/app/services/features.py, get_features) has {n_sig} columns per account, "
        f"{len(docs)} of them documented below, built from monthly summaries, account, client, card, district, loan and "
        "standing-order tables plus offline transaction features. Shares are fractions of typical inflow or outflow; "
        "trends are per-month slopes; history features detect months where income fell at least 40% below its trailing six-month "
        "median and follow the response (resilience_history.py).",
        ["Signal", "Group", "Definition"],
        [[k, _group_of(k), v] for k, v in docs.items()]))

    # 3. Archetypes ---------------------------------------------------------------
    if clusters:
        rows_plain = [[c.get("name"), f"{int(c.get('size', 0)):,}", _share(c.get("share")),
                       _pct(c.get("survive6_layoff_pct")), c.get("likely_life_stage") or "n/a"] for c in clusters]
        rows_tech = [[c.get("id"), c.get("name"), int(c.get("size", 0)), _share(c.get("share"), 1),
                      _pct(c.get("survive6_layoff_pct"), 1), _months(c.get("median_runway_layoff")),
                      f"{c.get('likely_occupation') or 'n/a'} / {c.get('likely_life_stage') or 'n/a'}",
                      _num(c.get("confidence")),
                      "; ".join(f"{d['feature']} z={_num(d.get('z'))}" for d in (c.get("distinguishing") or [])[:3])] for c in clusters]
        best = max(clusters, key=lambda c: c.get("survive6_layoff_pct") or 0)
        worst = min(clusters, key=lambda c: c.get("survive6_layoff_pct") or 100)
        plain.append(_section(
            f"{len(clusters)} kinds of customers",
            f"Accounts fall into {len(clusters)} groups that behave alike. The groups are found by the data, then named. "
            f"'{best.get('name')}' is the safest: {_pct(best.get('survive6_layoff_pct'))} would get through a six-month layoff. "
            f"'{worst.get('name')}' is the most exposed at {_pct(worst.get('survive6_layoff_pct'))}. Life stage and job are "
            "educated guesses from behaviour, not facts about anyone.",
            ["Group", "Accounts", "Share", "Last a 6-month layoff", "Likely life stage"], rows_plain))
        tech.append(_section(
            "Behavioural archetypes",
            f"Method: {arche.get('method', 'n/a')}. Inputs ({len(arche.get('features') or [])} standardised features): "
            f"{', '.join(arche.get('features') or [])}. Names, descriptions, life stage and occupation guesses: "
            f"{arche.get('naming_source', 'template')}, constrained to the cluster medians; confidence is the namer's own "
            "estimate. Survival uses the official runway with r=0.55, h=0, six-month horizon.",
            ["ID", "Name", "Size", "Share", "Survive 6m layoff", "Median runway", "Occupation / life stage", "Confidence",
             "Most distinguishing (z vs population)"], rows_tech))

    # 4. Findings -------------------------------------------------------------------
    if rs:
        prim = rs["runs"]["primary_5pct_layoff"]
        pop = rs["population"]
        qb = rs["survival_by_quartile"]["buffer_B"]
        qs = rs["survival_by_quartile"]["spending_ratio_S_over_I"]
        qrows_plain = [[f"Group {i + 1}" + (" (lowest)" if i == 0 else " (highest)" if i == 3 else ""),
                        _pct(qb[i]["survive6_pct"]), _pct(qs[i]["survive6_pct"])] for i in range(min(len(qb), len(qs)))]
        plain.append(_section(
            "What we found: spending matters more than savings",
            f"We hit every account with the same six-month layoff, keeping 55% of income. Sorting people by how much cash "
            f"they hold barely changes who makes it ({_pct(qb[0]['survive6_pct'])} of the lowest-cash quarter versus "
            f"{_pct(qb[-1]['survive6_pct'])} of the highest). Sorting them by how much of their income they spend changes "
            f"everything: {_pct(qs[0]['survive6_pct'])} of the leanest spenders make it, against {_pct(qs[-1]['survive6_pct'])} "
            f"of the heaviest. And in {prim['reversals']} of {prim['pairs_unequal_buffer']:,} pairs of people with almost the "
            "same income, the one with more cash ran out first, because they also spent more.",
            ["Quarter of accounts", "Sorted by cash: make it 6 months", "Sorted by share of income spent: make it 6 months"],
            qrows_plain))
        tech.append(_section(
            "Population findings under the 55% layoff",
            f"{rs.get('accounts_eligible_positive_inflow', 0):,} accounts with positive inflow (excluded: "
            f"{rs.get('accounts_excluded_zero_inflow', 0)} with zero inflow); horizon {rs.get('horizon_months', 6)} months. "
            f"Six-month survival {_pct(pop.get('layoff55_survive6_pct'), 1)} (n={pop.get('layoff55_survive6_n')}); with a "
            f"bills shock as well {_pct(pop.get('combined_survive6_pct'), 1)}. Spearman rho, buffer vs runway: "
            f"{_num(pop.get('spearman_buffer_vs_runway_layoff'))}; spending ratio vs runway: "
            f"{_num(pop.get('spearman_spendratio_vs_runway_layoff'))}. Quartile tables below (survival %, median of the "
            "sorting variable).",
            ["Quartile", "Buffer B: n", "Buffer B: survive %", "Buffer B: median", "S/I: n", "S/I: survive %", "S/I: median"],
            [[qb[i]["quartile"], qb[i]["n"], _pct(qb[i]["survive6_pct"], 1), _money(qb[i]["median_value"]),
              qs[i]["n"], _pct(qs[i]["survive6_pct"], 1), _num(qs[i]["median_value"])] for i in range(min(len(qb), len(qs)))]))
        tech.append(_section(
            "Matched-pair reversals",
            f"Matching rule: {rs.get('matching_rule', 'n/a')} (tolerance {prim.get('tolerance')}, minimum {prim.get('min_months')} "
            f"months). Of {prim['pairs_unequal_buffer']:,} pairs with unequal buffers, {prim['reversals']} "
            f"({_num(prim['reversal_pct_of_pairs'])}%) are reversals where the larger buffer fails first; that is "
            f"{_num(prim.get('reversal_pct_of_discordant'))}% of the {prim.get('discordant_pairs')} discordant pairs. In every "
            f"reversal the smaller-buffer account spends less (median S/I {_num(prim.get('median_spend_ratio_small'))} vs "
            f"{_num(prim.get('median_spend_ratio_big'))}). Variance decomposition of log runway: buffer share "
            f"{_num((rs.get('variance_decomposition_layoff55') or {}).get('share_from_buffer'))}, gap share "
            f"{_num((rs.get('variance_decomposition_layoff55') or {}).get('share_from_gap'))}.",
            ["Spending ratio band", "Accounts", "Survive 6 months"],
            [[b["band"], b["n"], _pct(b["survive6_pct"], 1)] for b in rs.get("survival_by_spending_ratio_band") or []]))

    fnd = [f for f in hunter.get("findings") or [] if isinstance(f, dict)]
    if fnd:
        plain.append(_section(
            "What the Pattern Hunter noticed",
            f"An AI analyst was given tools to query the signals (it cannot invent numbers) and made "
            f"{hunter.get('tool_calls_made', len(hunter.get('tool_log') or []))} queries. Its strongest observation: "
            f"{hunter.get('best_finding') or fnd[0].get('title')}. Each finding below is backed by one of those queries; "
            "the technical report lists the evidence and the caveat for each.",
            ["Finding", "How strong"],
            [[f.get("title"), f.get("strength", "n/a")] for f in fnd]))
        tech.append(_section(
            "Pattern Hunter (agentic exploration)",
            f"Mode {hunter.get('mode', 'n/a')}, model {hunter.get('model', 'n/a')}, {hunter.get('tool_calls_made', 'n/a')} tool "
            f"calls over {hunter.get('n_accounts', n_accounts)} accounts in {_num(hunter.get('seconds'), 0)} s. The agent "
            "calls deterministic tools (list_features, group statistics, correlations, default validation); every statistic "
            "in a finding is the output of a tool call. Ground-truth findings use real loan outcomes rather than simulation.",
            ["Finding", "Statement", "Evidence (tool)", "Strength", "Caveat"],
            [[f.get("title"), f.get("statement"), f.get("evidence"), f.get("strength"), f.get("caveat") or ""] for f in fnd]))

    val = hunter.get("validation") or {}
    if val.get("available") or val.get("by_flag"):
        bs = val.get("by_survival") or {}
        byf = sorted(val.get("by_flag") or [], key=lambda r: -(r.get("lift") or 0))
        plain.append(_section(
            "Does it match real life?",
            f"The simulations are a model, so we checked them against something that actually happened: loans. Of "
            f"{val.get('loans', 0)} accounts with a loan, {val.get('bad', 0)} had the loan go bad. Where PULP says an "
            f"account would not last a six-month layoff, {_pct(bs.get('fails_layoff_bad_rate_pct'), 1)} of loans went bad, "
            f"against {_pct(bs.get('survives_layoff_bad_rate_pct'), 1)} where it says the account would. The table shows "
            f"how often loans went bad with and without each warning sign: {sum(1 for r in byf if (r.get('lift') or 0) > 1)} of "
            f"{len(byf)} signs came with more bad loans. Groups are small and the causes overlap, so this "
            "is support, not proof.",
            ["Warning sign", "Accounts with it", "Loan went bad: with", "Loan went bad: without"],
            [[flabels.get(r["flag"], r["flag"]), r.get("n_with"), _pct(r.get("bad_rate_with_pct")),
              _pct(r.get("bad_rate_without_pct"))] for r in byf]))
        tech.append(_section(
            "External validation against loan outcomes",
            f"Outcome: loan status B or D (finished unpaid or running in debt) in loans.csv, a snapshot at the end of 2025. "
            f"n={val.get('loans')}, bad={val.get('bad')} (base rate {_pct(val.get('bad_rate_pct'), 1)}). By official layoff "
            f"survival: fails {_pct(bs.get('fails_layoff_bad_rate_pct'), 1)} (n={bs.get('n_fail')}) vs survives "
            f"{_pct(bs.get('survives_layoff_bad_rate_pct'), 1)} (n={bs.get('n_survive')}). Lift = bad rate with flag / bad "
            "rate without. Caveats: small groups for several flags; flags and loan payments share causes (a loan payment "
            "raises S, which lowers runway), so this is association, not out-of-sample prediction.",
            ["Flag", "Key", "n with", "Bad rate with", "Bad rate without", "Lift"],
            [[flabels.get(r["flag"], r["flag"]), r["flag"], r.get("n_with"), _pct(r.get("bad_rate_with_pct"), 1),
              _pct(r.get("bad_rate_without_pct"), 1), _num(r.get("lift"))] for r in byf]))

    # 5. Limitations ------------------------------------------------------------------
    plain.append(_section(
        "What to keep in mind",
        "- The shocks are simulations: they show what the records imply, not what will happen.\n"
        "- Some checks reuse the same numbers they test, so agreement is partly built in.\n"
        "- Loan status is a single snapshot, not a full history.\n"
        "- Names, jobs, families and goals in personas are made up to make the numbers relatable. They describe no real person.\n"
        "- About a quarter of accounts have no labelled household bills, so a bills increase cannot change their spending."))
    tech.append(_section(
        "Limitations and threats to validity",
        "- Simulated vs observed: runway and survival are deterministic projections of medians, not observed outcomes; only the "
        "loan check uses real outcomes.\n"
        "- Circularity: spending ratio enters both the runway formula and the S/I finding; the finding says the formula is "
        "dominated by the gap, which the variance decomposition quantifies.\n"
        "- Loan status is an end-of-2025 snapshot; timing of default relative to the observed months is unknown.\n"
        "- The layoff applies 55% to all of I with no EI weekly maximum.\n"
        "- Archetype and persona labels (occupation, life stage, names, goals) are generated, constrained to the data and "
        "marked fictional; they are illustrative, not inferences about real people.\n"
        "- Accounts with zero inflow are excluded from population statistics; accounts without labelled household bills "
        "cannot respond to h."))

    plain_summary = (
        f"PULP read {n_accounts:,} real, anonymized bank accounts, worked out about {n_sig} signals for each, grouped them into "
        f"{len(clusters) or 'several'} kinds of customer and tested every one against the same layoff. The clearest lesson: "
        "how much of your income you spend decides how long you last, far more than how much cash you hold.")
    tech_summary = (
        f"Stage 1 pipeline: schema mapping → {n_sig}-column feature table → agentic pattern search "
        f"({hunter.get('tool_calls_made', 'n/a')} tool calls, {len(fnd)} findings) → k-means archetypes (k={len(clusters)}) → "
        "flag rules → narrative. All statistics deterministic (pandas); models only choose tools and phrase findings.")
    return {"plain": plain, "technical": tech, "plain_summary": plain_summary, "tech_summary": tech_summary}


def dataset_report() -> dict:
    with _LOCK:
        if "dataset" not in _CACHE:
            _CACHE["dataset"] = _dataset_sections()
        return _CACHE["dataset"]


# ----------------------------------------------------------------------------- account sections
def _account_sections(account_id: int) -> tuple[list[dict], list[dict], str, str]:
    from .features import account_feature_summary, flags_for, get_features
    from .financial_profiles import get_metrics

    m = get_metrics(int(account_id))
    f = get_features()
    row = f.loc[int(account_id)] if int(account_id) in f.index else None
    flags = flags_for(row) if row is not None else []
    summary = account_feature_summary(f, int(account_id)) if row is not None else {}
    arche: dict = {}
    try:
        from .archetypes import archetype_for
        arche = archetype_for(int(account_id)) or {}
    except Exception:
        arche = {}
    ctx: dict = {}
    try:
        from . import context_manager as cm
        ctx = cm.load_context(int(account_id)) or {}
    except Exception:
        ctx = {}
    persona = ctx.get("persona") if isinstance(ctx.get("persona"), dict) else None

    def rv(k):
        return row[k] if row is not None and k in row.index else None

    I, S, B = m.typical_inflow, m.typical_spending, m.buffer
    runway_layoff = rv("runway_layoff")
    plain: list[dict] = []
    tech: list[dict] = []
    A = f"Account {account_id}"

    # numbers
    left = I - S
    plain.append(_section(
        f"{A} at a glance",
        f"In a typical month about {_round_money(I)} comes in and {_round_money(S)} goes out, "
        + (f"leaving roughly {_round_money(left)}. " if left >= 0 else f"which is {_round_money(-left)} more than comes in. ")
        + f"The account usually holds about {_round_money(B)} in cash. With today's income the buffer "
        + ("is not being drawn down. " if (m.baseline_gap or 0) <= 0
           else "would last more than ten years at today's pace. " if (m.baseline_runway is None or (m.baseline_runway or 0) >= 120)
           else f"would last about {_months(m.baseline_runway)} months at today's pace. ")
        + (f"If income fell to 55% for a layoff, it would last {_months(runway_layoff)} months." if runway_layoff is not None else ""),
        ["What", "Typical month"],
        [["Money in", _round_money(I)], ["Money out", _round_money(S)], ["Fixed costs (bills, insurance, loan)", _round_money(m.typical_fixed_costs)],
         ["Cash buffer", _round_money(B)], ["Loan payment", _round_money(m.active_loan_payment) if m.active_loan_payment else "none"],
         ["Months on record", m.months_available]]))
    tech.append(_section(
        f"{A}: official metrics",
        f"Computed from {m.months_available} months ({m.first_month} to {m.last_month}). B averages the last "
        f"{m.buffer_months_used} months of avg_daily_balance. Baseline runway: {m.baseline_runway_label}. Layoff runway "
        f"(r=0.55, h=0): {_months(runway_layoff)}; combined (layoff plus bills): {_months(rv('runway_combined'))}.",
        ["Symbol", "Value", "Definition"],
        [["I", _money(I), "median money_in"], ["S", _money(S), "median money_out"], ["F", _money(m.typical_fixed_costs), "median bills + insurance + loans"],
         ["H", _money(m.household_bills), "median household_bills"], ["B", _money(B), "mean avg_daily_balance, last 6 months"],
         ["P", _money(m.active_loan_payment), "monthly_payment if running"], ["I - S", _money(m.typical_surplus), "typical surplus"],
         ["S / I", _num(m.spending_ratio), "spending ratio"], ["CV(money_in)", _num(m.income_cv), "income variability"],
         ["Runway (baseline)", m.baseline_runway_label, "official formula, r=1, h=0"],
         ["Runway (layoff)", _months(runway_layoff), "official formula, r=0.55, h=0"],
         ["Days below zero", m.observed_negative_balance_days, "observed in records"]]))

    # flags
    if flags:
        plain.append(_section(
            "What stands out",
            "\n".join(f"- **{fl['label']}.** {fl['evidence'][:1].upper() + fl['evidence'][1:]}; {fl['insight']}." for fl in flags)))
        tech.append(_section(
            f"{A}: flags raised by rules",
            "Flags are deterministic rules over the feature table (features.FLAG_RULES); the evidence string is filled from the account's values.",
            ["Key", "Label", "Severity", "Evidence"], [[fl["key"], fl["label"], fl["severity"], fl["evidence"]] for fl in flags]))
    else:
        plain.append(_section("What stands out", "No warning signs were raised for this account."))

    # comparisons
    if arche:
        comp_keys = [("I", "Money in", "money"), ("S", "Money out", "money"), ("B", "Cash buffer", "money"),
                     ("spending_ratio", "Share of income spent", "share"), ("income_cv", "Income ups and downs", "num"),
                     ("account_age_years", "Years with the bank", "num"), ("owner_age", "Age of account holder", "num")]
        rows = []
        for k, label, kind in comp_keys:
            s = summary.get(k)
            if not s or s.get("value") is None:
                continue
            v = s["value"]
            val = _round_money(v) if kind == "money" else _share(v) if kind == "share" else f"{_num(v, 1)}"
            rows.append([label, val, f"higher than {int(_num(s.get('percentile'), 0) or 0)}% of accounts" if s.get("percentile") is not None else "n/a"])
        plain.append(_section(
            "How this account compares",
            f"It belongs to the '{arche.get('name')}' group, {int(arche.get('size') or 0):,} accounts "
            f"({_share(arche.get('share'))} of the bank). {arche.get('description') or ''} In that group, "
            f"{_pct(arche.get('survive6_layoff_pct'))} would last a six-month layoff. A likely life: "
            f"{(arche.get('likely_occupation') or 'unknown').lower()}, {(arche.get('likely_life_stage') or '').lower()} (a guess from behaviour).",
            ["Measure", "This account", "Compared with everyone"], rows))
        tech.append(_section(
            f"{A}: archetype and percentiles",
            f"Archetype {arche.get('id')} '{arche.get('name')}' (size {arche.get('size')}, share {_share(arche.get('share'), 1)}, "
            f"6m layoff survival {_pct(arche.get('survive6_layoff_pct'), 1)}, naming {arche.get('naming_source', 'n/a')}, "
            f"confidence {_num(arche.get('confidence'))}). Evidence: {arche.get('evidence') or 'n/a'}. Percentile = share of "
            "accounts with a lower value.",
            ["Signal", "Value", "Percentile", "Definition"],
            [[k, _num(v.get("value"), 3) if not isinstance(v.get("value"), bool) else v.get("value"),
              _num(v.get("percentile"), 1) if v.get("percentile") is not None else "", v.get("doc", "")] for k, v in summary.items()]))

    # income drops
    n_ep = int(_num(rv("shock_episodes"), 0) or 0)
    if n_ep > 0:
        drop = _num(rv("worst_income_drop"), 3)
        resp = _num(rv("spending_response"), 3)
        rec = _num(rv("recovery_months"), 1)
        plain.append(_section(
            "Past income drops",
            f"Income fell sharply {n_ep} time{'s' if n_ep != 1 else ''} in the records. The worst drop was about "
            f"{_share(drop)}. " + (f"Spending moved by about {_share(resp)} in response. " if resp is not None else "")
            + (f"It took about {rec:.0f} months to recover. " if rec is not None else "")
            + ("The balance went below zero during a drop." if bool(rv("episode_dipped_negative")) else "The balance stayed above zero.")))
        tech.append(_section(
            f"{A}: observed income-drop episodes",
            "Episodes: months where money_in fell at least 40% below its own trailing six-month median (resilience_history.py).",
            ["Signal", "Value"], [[k, _num(rv(k), 3) if not isinstance(rv(k), (bool,)) else rv(k)] for k in
                                   ["shock_episodes", "worst_income_drop", "spending_response", "episode_dipped_negative", "recovery_months", "last_episode_months_ago"]]))
    else:
        plain.append(_section("Past income drops", "Income never fell sharply in the records, so we have not seen how this household copes with a drop."))

    # timing
    pay, bill = _num(rv("payday_dom"), 0), _num(rv("bill_dom"), 0)
    bbp = _num(rv("bills_before_pay_share"), 3)
    pen_n, pen_tot = int(_num(rv("penalty_events"), 0) or 0), _num(rv("penalty_total"), 2)
    if pay is not None or bill is not None or pen_n:
        txt = ""
        if pay is not None:
            txt += f"Pay usually arrives around day {int(pay)} of the month. "
        if bill is not None:
            txt += f"Bills usually leave around day {int(bill)}. "
        if bbp is not None and bbp > 0.5:
            txt += f"In {_share(bbp)} of months the bills leave before the pay arrives, so the account has to carry them for a few days. "
        txt += (f"The bank charged penalty interest {pen_n} time{'s' if pen_n != 1 else ''}, about {_round_money(pen_tot)} in total."
                if pen_n else "No penalty interest was charged.")
        plain.append(_section("Paydays and bills", txt))
        tech.append(_section(
            f"{A}: timing and penalties (from transactions)",
            "Day-of-month medians of the largest monthly credit and household-bill debits; penalty = transactions labelled penalty interest.",
            ["Signal", "Value"], [[k, _num(rv(k), 3) if not isinstance(rv(k), str) else rv(k)] for k in
                                   ["payday_dom", "payday_regular_share", "bill_dom", "bills_before_pay_share", "penalty_events", "penalty_total",
                                    "penalty_months", "recurring_partner_amount", "recurring_partner_purpose", "n_partners_out"] if rv(k) is not None]))

    # persona
    questions: list[dict] = []
    if persona:
        occ = persona.get("occupation") or {}
        goals = persona.get("goals") or []
        worries = persona.get("worries") or []
        questions = [q for q in persona.get("questions") or [] if isinstance(q, dict)]
        plain.append(_section(
            "The person behind the numbers (fictional)",
            f"To make the numbers relatable, the Persona Builder imagined a life that fits them. It is made up. "
            f"{persona.get('display_name', 'This person')}"
            + (f", {persona.get('age')}," if persona.get("age") else "")
            + f" might work as {(occ.get('label') or 'unknown').lower()}. {persona.get('story') or ''}"
            + (" Worries: " + "; ".join(w.get("label", "") for w in worries[:4]) + "." if worries else ""),
            ["Goal", "Size", "When", "Importance", "Weight"],
            [[g.get("label"), g.get("size"), g.get("horizon"), g.get("importance"), _num(g.get("weight"))] for g in goals]))
        tech.append(_section(
            f"{A}: persona (fictional, Persona Builder)",
            f"Source {persona.get('source', 'n/a')}, built {persona.get('built_at', 'n/a')}. Occupation guess "
            f"'{occ.get('label')}' (confidence {_num(occ.get('confidence'))}; evidence: {occ.get('evidence') or 'n/a'}). "
            "Goal weight = importance x urgency(horizon) normalised; urgency short 1.0, medium 0.75, long 0.5.",
            ["Goal", "Type", "Size", "Horizon", "Target", "Months", "Importance", "Weight", "Evidence"],
            [[g.get("label"), g.get("type"), g.get("size"), g.get("horizon"), _money(g.get("target_amount")), g.get("target_months"),
              g.get("importance"), _num(g.get("weight"), 3), g.get("evidence") or ""] for g in goals]))
    if not questions:
        try:
            from .decision_profile import build_decision_profile
            from .data_store import get_store
            from . import context_manager as cm
            dp = build_decision_profile(get_store().monthly_for(int(account_id)), row, cm.summarize(ctx) if ctx else {}, get_store().loan_for(int(account_id)))
            questions = dp.get("questions") or []
        except Exception:
            questions = []
    if questions:
        plain.append(_section(
            "What Pulp would ask first",
            "Records cannot tell us everything. These are the questions that would change the plan the most:\n"
            + "\n".join(f"- {q.get('text')}" for q in questions[:4])))
        tech.append(_section(
            f"{A}: first questions",
            "Ranked by expected value of the answer to the plan (persona questions when a persona exists, else decision_profile observations).",
            ["Key", "Question", "Why it matters"], [[q.get("key"), q.get("text"), q.get("why", "")] for q in questions[:6]]))

    plain_sum = (f"For account {account_id}: about {_round_money(I)} in and {_round_money(S)} out each month, "
                 f"{_round_money(B)} in cash, {len(flags)} warning sign{'s' if len(flags) != 1 else ''}"
                 + (f", and a fictional persona with {len(persona.get('goals') or [])} goals." if persona else "."))
    tech_sum = (f"Account {account_id}: I={_money(I)}, S={_money(S)}, B={_money(B)}, S/I={_num(m.spending_ratio)}, "
                f"layoff runway {_months(runway_layoff)}, {len(flags)} flags, archetype {arche.get('name', 'n/a')}.")
    return plain, tech, plain_sum, tech_sum


# ----------------------------------------------------------------------------- public
def build_report(account_id: int | None = None) -> dict:
    ds = dataset_report()
    plain = list(ds["plain"])
    tech = list(ds["technical"])
    plain_summary, tech_summary = ds["plain_summary"], ds["tech_summary"]
    title_suffix = ""
    if account_id is not None:
        try:
            p, t, ps, ts = _account_sections(int(account_id))
            plain = p + plain
            tech = t + tech
            plain_summary = ps + " " + plain_summary
            tech_summary = ts + " " + tech_summary
            title_suffix = f": account {account_id}"
        except KeyError:
            raise
        except Exception as exc:
            note = _section("This account", f"The account section could not be built ({type(exc).__name__}). The dataset report follows.")
            plain.insert(0, note)
            tech.insert(0, note)
    return copy.deepcopy({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "account_id": int(account_id) if account_id is not None else None,
        "plain": {"title": f"What PULP learned{title_suffix}", "summary": plain_summary, "sections": plain},
        "technical": {"title": f"Stage 1 technical report{title_suffix}", "summary": tech_summary, "sections": tech},
    })


def _md_cell(c: Any) -> str:
    return str(c).replace("|", "\\|").replace("\n", " ")


def to_markdown(report: dict) -> str:
    """Both halves as one markdown document (plain first)."""
    lines = []
    for half in ("plain", "technical"):
        h = report[half]
        lines += [f"# {h['title']}", "", h["summary"], ""]
        for s in h["sections"]:
            lines += [f"## {s['heading']}", "", s["body"], ""]
            t = s.get("table")
            if t:
                lines.append("| " + " | ".join(_md_cell(x) for x in t["headers"]) + " |")
                lines.append("|" + "---|" * len(t["headers"]))
                for r in t["rows"]:
                    lines.append("| " + " | ".join(_md_cell(x) for x in r) + " |")
                lines.append("")
    lines.append(f"_Generated {report['generated_at']} by backend/scripts/build_stage1_report.py. Deterministic; no model._")
    return "\n".join(lines) + "\n"
