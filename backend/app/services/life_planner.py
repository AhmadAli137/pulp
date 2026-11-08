"""Stage 3 Life Planner: search many multi-step plans built from real decisions, score them, keep four distinct finalists.

Agents interpret, code calculates. Every number here is produced by this module from the account's official figures
(I, S, H, B, P), its Stage 1 signals and the goals in its profile. The pipeline, mirrored in the trace:

  Life Planner  generates candidates (1 to 3 decisions, each with timing and size variants)
  Engine        simulates each candidate month by month under the shock (or with no shock in long-term mode)
  Validator     screens out infeasible or implausible candidates, counted per rule
  Ranker        keeps the Pareto set over (gap covered, cushion, weighted goals) and marks who beat whom
  Challenger    checks finalists against what the person told Pulp (constraints, worries)
  Director      picks four distinct finalists, one per objective axis plus the best trade-off, and justifies each step

Objective (docs/agents/v2-contracts.md):
  score = w_short x shortfall + w_res x resilience + w_goal x goals - w_dis x disruption
"""
from __future__ import annotations

import itertools
import math
import random
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

import numpy as np

URGENCY = {"short": 1.0, "medium": 0.75, "long": 0.5}
ROLE_LABELS = {
    "best_shortfall": "Covers the gap best",
    "best_resilience": "Strongest cushion",
    "best_goals": "Furthest toward your goals",
    "best_tradeoff": "Best balance",
    "least_disruption": "Easiest to live with",
    "falls_short": "Falls short",
}
SHOCK_ROLES = ("best_tradeoff", "best_shortfall", "best_resilience", "best_goals")
LONG_ROLES = ("best_tradeoff", "best_goals", "best_resilience", "least_disruption")
INVEST_MONTHLY = 0.004  # ~5% a year, an assumption stated in the step text
MAX_CANDIDATES = 320


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _m(x: float) -> str:
    x = float(x)
    sign = "-" if x < 0 else ""
    return f"{sign}${abs(x):,.0f}"


def _f(row: Any, key: str, default: float = 0.0) -> float:
    try:
        v = float(row.get(key, default) if hasattr(row, "get") else default)
        return v if math.isfinite(v) else default
    except (TypeError, ValueError):
        return default


# ----------------------------------------------------------------------------- inputs
@dataclass
class Account:
    account_id: int
    I: float
    S: float
    H: float
    B: float
    P: float
    row: Any
    flex: float  # monthly spending that is not bills, insurance or loans


@dataclass
class Goal:
    id: str
    label: str
    type: str
    target: float
    deadline: int  # month index the goal is measured at
    importance: float
    horizon: str
    weight: float = 0.0
    saved: float = 0.0


@dataclass
class Shock:
    label: str
    r: float
    h: float
    one_off: float
    duration: int
    start: int  # first month of the shock (1-based); 0 = no shock

    def active(self, m: int) -> bool:
        return self.start > 0 and self.start <= m < self.start + self.duration


@dataclass
class Step:
    decision: str
    family: str
    title: str
    detail: str
    category: str
    month_start: int
    month_end: int
    monthly_effect: float = 0.0  # + income or saving, applied each active month
    one_off: float = 0.0  # + cash in, - cash out, at month_start
    disruption: float = 0.0
    effect: str = "flow"  # flow | reserve_first | invest | delay_goal
    target: str | None = None  # goal id for delay_goal
    because: str = ""
    evidence: str = ""
    cut_share: float = 0.0  # share of S cut, for the 25% screen
    needs_job: bool = False  # cannot happen while laid off

    def as_dict(self) -> dict:
        return {"month_start": self.month_start, "month_end": self.month_end, "decision": self.decision, "title": self.title,
                "detail": self.detail, "monthly_effect": round(self.monthly_effect, 2), "one_off": round(self.one_off, 2),
                "category": self.category}


@dataclass
class Candidate:
    id: str
    steps: list[Step]
    source: str = "search"
    round: int = 1
    outcome: dict = field(default_factory=dict)
    comp: dict = field(default_factory=dict)
    score: float = 0.0
    status: str = "feasible"
    reason: str = ""

    @property
    def decisions(self) -> list[str]:
        return [s.decision for s in self.steps]

    @property
    def families(self) -> list[str]:
        return [s.family for s in self.steps]

    @property
    def name(self) -> str:
        if not self.steps:
            return "Change nothing"
        return " + ".join(s.title for s in self.steps[:3])


def load_account(account_id: int) -> Account:
    from .features import get_features
    f = get_features()
    if account_id not in f.index:
        raise KeyError(account_id)
    row = f.loc[account_id]
    I, S, H, B, P = (_f(row, k) for k in ("I", "S", "H", "B", "P"))
    fixed = H + P + S * _f(row, "insurance_share")
    return Account(account_id, I, S, H, B, P, row, max(0.0, S - fixed))


DEFAULT_GOALS = [
    {"type": "emergency_fund", "label": "Six months of spending put aside", "months_of_S": 6.0, "target_months": 24, "importance": 4, "horizon": "medium"},
    {"type": "short_purchase", "label": "A planned purchase", "months_of_S": 1.0, "target_months": 9, "importance": 2, "horizon": "short"},
    {"type": "long_term", "label": "Long-term savings", "months_of_S": 12.0, "target_months": 60, "importance": 3, "horizon": "long"},
]


def goals_for(account: Account, ctx: dict, horizon: int) -> list[Goal]:
    """Goals from the profile (persona seed and conversation), with weights = importance x urgency, normalised."""
    raw = [x.get("value", {}) for x in ctx.get("goals", []) if x.get("confirmed", True)]
    if not raw:
        raw = [{**g, "target_amount": g["months_of_S"] * account.S, "id": g["type"]} for g in DEFAULT_GOALS]
    out: list[Goal] = []
    for i, g in enumerate(raw[:6]):
        horizon_key = g.get("horizon") or ("short" if (g.get("target_months") or 24) <= 12 else "medium" if (g.get("target_months") or 24) <= 36 else "long")
        target = _f(g, "target_amount") or _f(g, "amount") or (6 * account.S if g.get("type") == "emergency_fund" else 2 * account.S)
        months = int(_f(g, "target_months") or {"short": 9, "medium": 24, "long": 60}[horizon_key])
        out.append(Goal(id=str(g.get("id") or g.get("type") or f"goal{i}"), label=str(g.get("label") or g.get("type") or "Goal"),
                        type=str(g.get("type") or "goal"), target=max(1.0, target), deadline=max(1, min(months, horizon)),
                        importance=float(g.get("importance") or 3), horizon=horizon_key, saved=_f(g, "saved_amount")))
    total = sum(g.importance * URGENCY[g.horizon] for g in out) or 1.0
    for g in out:
        g.weight = g.importance * URGENCY[g.horizon] / total
    return out


def weights_for(ctx: dict, mode: str) -> dict:
    w = ({"shortfall": 0.3, "resilience": 0.3, "goals": 0.3, "disruption": 0.1} if mode == "shock"
         else {"shortfall": 0.0, "resilience": 0.35, "goals": 0.5, "disruption": 0.15})
    prefs = " ".join(str(x.get("value", {})).lower() for x in ctx.get("preferences", []) + ctx.get("concerns", []))
    if any(k in prefs for k in ("safety", "safe", "security", "worried", "anxious", "job")):
        w["resilience"] += 0.1
        w["goals"] -= 0.05
        w["disruption"] -= 0.05 if w["disruption"] > 0.05 else 0
    if any(k in prefs for k in ("faster", "speed", "asap", "sooner", "quickly")):
        w["goals"] += 0.1
        w["resilience"] -= 0.05
        w["disruption"] -= 0.05 if w["disruption"] > 0.05 else 0
    s = sum(w.values())
    return {k: round(v / s, 3) for k, v in w.items()}


# ----------------------------------------------------------------------------- decision catalog
def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def _pausable_transfer(r: Any) -> float:
    """A recurring transfer that is not a bill: one labelled as a loan, bills or insurance cannot be paused."""
    purpose = str(r.get("recurring_partner_purpose", "") or "").lower()
    if any(k in purpose for k in ("loan", "household", "insurance", "leasing")):
        return _f(r, "regular_transfer_out_amount") if abs(_f(r, "regular_transfer_out_amount") - _f(r, "recurring_partner_amount")) > 1 else 0.0
    return max(_f(r, "regular_transfer_out_amount"), _f(r, "recurring_partner_amount"))


def catalog(a: Account, shock: Shock, goals: list[Goal], horizon: int) -> list[Step]:
    """Every decision variant that could be part of a plan for this person, each with the insight it rests on."""
    r = a.row
    S, I, H, P = a.S, a.I, a.H, a.P
    after = shock.start + shock.duration if shock.start else 1
    end = horizon
    ds = _f(r, "district_salary")
    rel = _f(r, "inflow_vs_district_salary")
    drops = int(_f(r, "shock_episodes"))
    age = _f(r, "owner_age")
    steps: list[Step] = []

    def add(**kw):
        steps.append(Step(**kw))

    income_ev = (f"Money in is {_m(I)} a month, {rel:.1f}x the {_m(ds)} average salary in your district" if ds else f"Money in is {_m(I)} a month")
    drop_ev = f"; you have lived through {drops} income drop{'s' if drops != 1 else ''} in these records" if drops else ""
    for months, label in ((6, "6 months"), (12, "a year")):
        add(decision=f"second_job_{months}", family="second_job", title=f"Weekend job for {label}",
            detail=f"About 10 hours a week of part-time work, roughly {_m(0.18 * I)} a month after tax.", category="income",
            month_start=1, month_end=min(end, months), monthly_effect=0.18 * I, disruption=0.25 if months == 6 else 0.35,
            because="A second income keeps money coming in if the main one stops.", evidence=income_ev + drop_ev)
        if shock.start:
            add(decision=f"gig_during_{months}", family="second_job", title=f"Gig work through the shock",
                detail=f"Short-notice work (delivery, tutoring, contract) during the shock, about {_m(0.15 * I)} a month.",
                category="income", month_start=shock.start, month_end=min(end, shock.start + months - 1),
                monthly_effect=0.15 * I, disruption=0.22,
                because="Flexible work fills part of the gap while the main income is down.", evidence=income_ev + drop_ev)
    add(decision="extra_hours", family="extra_hours", title="Ask for extra hours",
        detail=f"Overtime or an extra shift at your current job, about {_m(0.08 * I)} a month.", category="income",
        month_start=1, month_end=min(end, 12), monthly_effect=0.08 * I, disruption=0.12, needs_job=True,
        because="More hours where you already work is the smallest change to your week.",
        evidence=f"Income has been regular in {_pct(_f(r, 'inflow_regular_share'))} of months")
    if age and age < 58:
        add(decision="move_for_job", family="move", title="Move for a better-paid job",
            detail=f"Relocate for a role paying about 15% more ({_m(0.15 * I)} a month), with moving costs of about {_m(1.2 * S)}.",
            category="housing", month_start=min(end, max(3, after)), month_end=end, monthly_effect=0.15 * I, one_off=-1.2 * S,
            disruption=0.45, because="A higher salary lifts every later month, at the cost of a move.",
            evidence=income_ev + (f"; district unemployment is {_f(r, 'district_unemployment'):.1f}%" if _f(r, "district_unemployment") else ""))
    add(decision="move_cheaper", family="move", title="Move somewhere cheaper",
        detail=f"Lower housing and bills by about a quarter ({_m(0.25 * H)} a month), with moving costs of about {_m(0.6 * S)}.",
        category="housing", month_start=2, month_end=end, monthly_effect=0.25 * H, one_off=-0.6 * S, disruption=0.35,
        because="Housing is the largest fixed cost, so a cheaper home helps every month after.",
        evidence=f"Household bills are {_m(H)} a month, {_pct(_f(r, 'bills_share'))} of what goes out")
    add(decision="roommate", family="housing_share", title="Take in a roommate or lodger",
        detail=f"Rent out a room for about {_m(0.12 * I)} a month.", category="housing", month_start=2, month_end=end,
        monthly_effect=0.12 * I, disruption=0.3, because="Shared housing turns a fixed cost into income.",
        evidence=f"{'A single owner on the account' if _f(r, 'n_authorized_users') == 0 else 'A joint account'}; bills {_m(H)} a month")
    for pct in (0.1, 0.2):
        add(decision=f"cut_flex_{int(pct * 100)}", family="cut", title=f"Trim day-to-day spending {_pct(pct)}",
            detail=f"Cut cash and card spending by {_pct(pct)}, about {_m(pct * a.flex)} a month, while the shock lasts and for a while after.",
            category="spending", month_start=shock.start or 1, month_end=min(end, (shock.start or 1) + max(6, shock.duration) + 2),
            monthly_effect=pct * a.flex, disruption=0.15 * (pct * a.flex / max(S, 1)) / 0.1, cut_share=pct * a.flex / max(S, 1),
            because="Day-to-day spending is the part you can change fastest.",
            evidence=f"{_pct(_f(r, 'cash_wd_share') + _f(r, 'card_wd_share'))} of spending is cash or card; spending runs at {_pct(_f(r, 'spending_ratio'))} of income")
    transfer = _pausable_transfer(r)
    add(decision="pause_transfer", family="transfer", title="Pause the regular transfer out",
        detail=f"Pause the steady {_m(transfer)} a month that goes to another account while the shock lasts.",
        category="spending", month_start=shock.start or 1, month_end=min(end, (shock.start or 1) + max(shock.duration, 6) - 1),
        monthly_effect=transfer, disruption=0.1, because="A recurring transfer is money already set aside every month.",
        evidence=f"A steady transfer of {_m(transfer)} left in {int(_f(r, 'recurring_partner_months'))} months" if transfer else "No recurring transfer on record")
    penalty = _f(r, "penalty_total") / max(1.0, _f(r, "months", 24))
    add(decision="bill_date_shift", family="timing", title="Move bill dates after payday",
        detail=f"Ask billers to collect after day {int(_f(r, 'payday_dom', 1))} so nothing leaves before pay arrives; avoids about {_m(penalty)} a month in penalty interest.",
        category="timing", month_start=1, month_end=end, monthly_effect=penalty, disruption=0.02,
        because="Bills that leave before pay arrives cause overdraft interest even when the month adds up.",
        evidence=f"Bills left before pay in {_pct(_f(r, 'bills_before_pay_share'))} of months; {_m(_f(r, 'penalty_total'))} penalty interest paid" if penalty > 0 else "No penalty interest on record")
    add(decision="refinance", family="debt", title="Refinance the loan",
        detail=f"Stretch the loan term to cut the payment by about 30% ({_m(0.3 * P)} a month), with a fee of about {_m(0.5 * P)}.",
        category="debt", month_start=1, month_end=end, monthly_effect=0.3 * P, one_off=-0.5 * P, disruption=0.08,
        because="A smaller loan payment frees money every month, paid for with more interest later.",
        evidence=f"Loan payment {_m(P)} a month, {_pct(_f(r, 'loan_payment_share'))} of income" if P else "No running loan")
    add(decision="reserve_first", family="allocation", title="Emergency fund before goals",
        detail=f"Send every spare dollar to the cash cushion until it reaches three months of spending ({_m(3 * S)}), then to goals.",
        category="saving", month_start=1, month_end=end, effect="reserve_first", disruption=0.03,
        because="A full cushion before goals means a shock does not empty the goal savings.",
        evidence=f"The cushion is {_m(a.B)}, {a.B / max(S, 1):.1f} months of spending")
    add(decision="invest_surplus", family="allocation", title="Invest for the long goals",
        detail="After the cushion is set, put long-horizon goal savings in a tax-free savings account (assumed 5% a year, not guaranteed).",
        category="investing", month_start=min(end, after), month_end=end, effect="invest", disruption=0.05,
        because="Money for goals years away can grow instead of sitting in cash.",
        evidence=f"{sum(1 for g in goals if g.horizon == 'long')} long-horizon goal(s) in your profile")
    dec = _f(r, "december_spend_ratio")
    add(decision="holiday_budget", family="seasonal", title="Set a December budget",
        detail=f"December spending runs at {dec:.1f}x a normal month; capping it at 1.2x saves about {_m(max(0.0, dec - 1.2) * S)} each December.",
        category="spending", month_start=1, month_end=end, monthly_effect=max(0.0, dec - 1.2) * S / 12, disruption=0.05,
        because="A known yearly spike is easier to plan for than to absorb.",
        evidence=f"December spending is {dec:.1f}x the typical month")
    big = sorted([g for g in goals if g.type != "emergency_fund"], key=lambda g: -g.target)
    for g in big[:2]:
        for months in (6, 12):
            add(decision=f"delay_{g.id}_{months}", family=f"delay_{g.id}", title=f"Delay {g.label.lower()} by {months} months",
                detail=f"Stop saving for {g.label.lower()} for {months} months and send that money to the cushion instead.",
                category="goal", month_start=1, month_end=min(end, months), effect="delay_goal", target=g.id,
                disruption=0.06 if months == 6 else 0.1,
                because="Pushing back a goal you can move protects the cushion without changing daily life.",
                evidence=f"{g.label}: {_m(g.target)} by month {g.deadline}, importance {g.importance:.0f} of 5")
    return steps


# ----------------------------------------------------------------------------- simulation (the Engine)
def simulate(a: Account, shock: Shock, goals: list[Goal], steps: list[Step], horizon: int) -> dict:
    """Month by month: income and spending under the shock and the plan's steps; spare money fills the cushion, then
    goals by weight; a gap drains the cushion, then goal savings (lowest weight first), then becomes shortfall."""
    reserve_first = any(s.effect == "reserve_first" for s in steps)
    invest = next((s for s in steps if s.effect == "invest"), None)
    delays = {s.target: s.month_end for s in steps if s.effect == "delay_goal"}
    reserve_target = (3.0 if reserve_first else 1.0) * a.S
    cash = a.B
    pots = {g.id: g.saved for g in goals}
    cash_path = [round(cash, 2)]
    goal_paths = {g.id: [round(pots[g.id], 2)] for g in goals}
    shortfall_total = 0.0
    first_short = None
    reached: dict[str, int | None] = {g.id: None for g in goals}
    at_deadline: dict[str, float] = {}
    order = sorted(goals, key=lambda g: g.weight)
    for m in range(1, horizon + 1):
        laid_off = shock.active(m) and shock.r <= 0.6
        income = a.I * (shock.r if shock.active(m) else 1.0)
        spend = a.S + (shock.h * a.H if shock.active(m) else 0.0)
        if m == shock.start:
            spend += shock.one_off
        for s in steps:
            if s.month_start <= m <= s.month_end and s.effect == "flow":
                if s.needs_job and laid_off:
                    continue
                if s.category in ("income", "housing") and s.monthly_effect > 0 and s.family in ("second_job", "move", "housing_share", "extra_hours"):
                    income += s.monthly_effect
                else:
                    spend -= s.monthly_effect
            if s.month_start == m and s.one_off:
                spend -= s.one_off
        net = income - spend
        if net >= 0:
            room = max(0.0, reserve_target - cash)
            to_cash = min(net, room)
            cash += to_cash
            left = net - to_cash
            open_goals = [g for g in goals if pots[g.id] < g.target and not (g.id in delays and m <= delays[g.id])]
            wsum = sum(g.weight for g in open_goals)
            for g in open_goals:
                share = left * g.weight / wsum if wsum else 0.0
                put = min(share, g.target - pots[g.id])
                pots[g.id] += put
                left -= put
            cash += left
        else:
            need = -net
            take = min(cash, need)
            cash -= take
            need -= take
            for g in order:
                if need <= 0:
                    break
                take = min(pots[g.id], need)
                pots[g.id] -= take
                need -= take
            if need > 0:
                shortfall_total += need
                if first_short is None:
                    first_short = m
        if invest and m >= invest.month_start:
            for g in goals:
                if g.horizon == "long":
                    pots[g.id] *= 1 + INVEST_MONTHLY
        for g in goals:
            if reached[g.id] is None and pots[g.id] >= g.target - 0.5:
                reached[g.id] = m
            if m == g.deadline:
                at_deadline[g.id] = pots[g.id]
            goal_paths[g.id].append(round(pots[g.id], 2))
        cash_path.append(round(cash, 2))
    outcomes = []
    for g in goals:
        saved = at_deadline.get(g.id, pots[g.id])
        outcomes.append({"goal_id": g.id, "label": g.label, "target": round(g.target, 2), "deadline_month": g.deadline,
                         "saved_at_deadline": round(saved, 2), "progress": round(min(1.0, saved / g.target), 4),
                         "reached_month": reached[g.id], "weight": round(g.weight, 4)})
    months_covered = (first_short - shock.start if (first_short and shock.start) else shock.duration if shock.start else horizon)
    return {"cash_path": cash_path, "goal_paths": goal_paths, "min_cash": round(min(cash_path), 2),
            "months_covered": max(0, months_covered), "shortfall_total": round(shortfall_total, 2), "end_cash": round(cash, 2),
            "goals": outcomes, "first_shortfall_month": first_short}


def components(a: Account, shock: Shock, out: dict, steps: list[Step], need: float, horizon: int) -> dict:
    if shock.start:
        cover = min(1.0, out["months_covered"] / max(1, shock.duration))
    else:
        cover = 1.0 if out["first_shortfall_month"] is None else out["first_shortfall_month"] / horizon
    resilience = 0.6 * cover + 0.4 * min(1.0, max(0.0, out["end_cash"]) / max(1.0, 6 * a.S))
    shortfall = 1.0 - min(1.0, out["shortfall_total"] / max(1.0, need))
    goals = sum(g["weight"] * g["progress"] for g in out["goals"])
    disruption = min(1.0, sum(s.disruption for s in steps))
    return {"shortfall": round(shortfall, 4), "resilience": round(resilience, 4), "goals": round(goals, 4), "disruption": round(disruption, 4)}


def weighted(comp: dict, w: dict) -> float:
    return round(w["shortfall"] * comp["shortfall"] + w["resilience"] * comp["resilience"] + w["goals"] * comp["goals"]
                 - w["disruption"] * comp["disruption"], 4)


# ----------------------------------------------------------------------------- screens (the Validator)
def screens(a: Account, shock: Shock, ctx_text: str) -> list[tuple[str, Callable[[list[Step]], bool]]]:
    r = a.row
    pension = _f(r, "pension_share") > 0.5 or _f(r, "owner_age") >= 67
    transfer = _pausable_transfer(r)
    penalty = _f(r, "penalty_total")
    shock_end = shock.start + shock.duration if shock.start else 0
    no_move = any(k in ctx_text for k in ("can't move", "cannot move", "won't move", "stay in", "kids in school", "not moving"))
    no_second = any(k in ctx_text for k in ("no time", "can't work more", "cannot work more", "health", "caregiver", "caring for"))

    def fam(steps):
        return [s.family for s in steps]
    return [
        ("Two decisions of the same kind", lambda st: len(set(fam(st))) < len(st)),
        ("A move and a roommate at the same time", lambda st: "move" in fam(st) and "housing_share" in fam(st)),
        ("A cheaper move with no housing bill on record", lambda st: any(s.decision == "move_cheaper" for s in st) and a.H <= 0),
        ("No running loan to refinance", lambda st: any(s.family == "debt" for s in st) and a.P <= 0),
        ("No recurring transfer to pause", lambda st: any(s.family == "transfer" for s in st) and transfer <= 0),
        ("No bill-timing problem to fix", lambda st: any(s.family == "timing" for s in st) and penalty <= 0),
        ("No December spike to budget for", lambda st: any(s.family == "seasonal" for s in st) and _f(r, "december_spend_ratio") < 1.25),
        ("Extra hours at a job you have lost", lambda st: shock.r <= 0.6 and shock.start and any(s.needs_job and s.month_start <= shock.start + shock.duration - 1 and s.month_end >= shock.start for s in st)),
        ("A second job for a retiree", lambda st: pension and any(s.family in ("second_job", "extra_hours") for s in st)),
        ("Spending cut beyond a quarter of spending", lambda st: sum(s.cut_share for s in st) > 0.25),
        ("Investing before the shock is over", lambda st: shock.start and any(s.effect == "invest" and s.month_start < shock_end for s in st)),
        ("Something you told Pulp rules out", lambda st: (no_move and "move" in fam(st)) or (no_second and "second_job" in fam(st))),
        ("Too much change at once", lambda st: sum(s.disruption for s in st) > 0.8),
    ]


# ----------------------------------------------------------------------------- the search
def _pareto(cands: list[Candidate]) -> None:
    keys = ("shortfall", "resilience", "goals")
    for c in cands:
        beaten = None
        for o in cands:
            if o is c:
                continue
            if all(o.comp[k] >= c.comp[k] for k in keys) and any(o.comp[k] > c.comp[k] + 1e-9 for k in keys) and o.comp["disruption"] <= c.comp["disruption"] + 1e-9:
                beaten = o
                break
        if beaten is not None:
            c.status, c.reason = "dominated", f"beaten by {beaten.name}"
        else:
            c.status = "pareto"


def _jaccard(a: list[str], b: list[str]) -> float:
    fa, fb = set(a), set(b)
    if not fa and not fb:
        return 1.0
    return len(fa & fb) / len(fa | fb)


def generate(cat: list[Step], seed: int) -> list[list[Step]]:
    singles = [[s] for s in cat]
    pairs = [list(p) for p in itertools.combinations(cat, 2)]
    triples = list(itertools.combinations(cat, 3))
    rng = random.Random(seed)
    rng.shuffle(pairs)
    rng.shuffle(triples)
    budget = MAX_CANDIDATES - len(singles)
    pairs = pairs[: int(budget * 0.45)]
    triples = [list(t) for t in triples[: budget - len(pairs)]]
    return singles + pairs + triples


def run(account_id: int, shock_in: dict | None = None, mode: str = "shock", horizon: int | None = None,
        shock_starts_in: int | None = None, trigger: str = "", use_ai: bool = False, ctx: dict | None = None,
        store: bool = True) -> dict:
    from . import context_manager as cm
    t0 = time.perf_counter()
    trace: list[dict] = []

    def ev(agent, kind, title, to=None, items=None, data=None):
        e = {"t": round(time.perf_counter() - t0, 3), "stage": 3, "agent": agent, "kind": kind, "title": title}
        if to:
            e["to"] = to
        if items:
            e["items"] = [str(i)[:160] for i in items][:12]
        if data:
            e["data"] = data
        trace.append(e)

    a = load_account(account_id)
    ctx = ctx if ctx is not None else cm.load_context(account_id)
    shock_in = shock_in or {}
    if mode == "long_term":
        horizon = int(horizon or 60)
        shock = Shock("No shock: the long-term plan", 1.0, 0.0, 0.0, 0, 0)
    else:
        r = float(shock_in.get("income_fraction", shock_in.get("r", 0.55)))
        h = float(shock_in.get("bills_increase", shock_in.get("h", 0.0)))
        one = float(shock_in.get("one_off_cost", shock_in.get("one_off", 0.0)))
        dur = int(shock_in.get("shock_duration", shock_in.get("duration", 6)) or 6)
        start = int(shock_starts_in or 3)
        horizon = int(horizon or max(18, start + dur + 9))
        label = shock_in.get("label") or _shock_label(r, h, one, dur)
        shock = Shock(label, r, h, one, dur, start)
    goals = goals_for(a, ctx, horizon)
    w = weights_for(ctx, mode)
    gap = max(0.0, a.S + shock.h * a.H - shock.r * a.I) if shock.start else 0.0
    need = gap * shock.duration + shock.one_off if shock.start else a.S * horizon * 0.1
    ctx_text = " ".join(str(x.get("value", {})).lower() for k in ("constraints", "preferences", "concerns") for x in ctx.get(k, []))

    ev("life_planner", "start", f"Planning for {shock.label.lower()}" if shock.start else "Planning the next five years",
       items=[f"{g.label}: {_m(g.target)} by month {g.deadline}, weight {g.weight:.0%}" for g in goals],
       data={"I": round(a.I), "S": round(a.S), "H": round(a.H), "B": round(a.B), "P": round(a.P), "horizon_months": horizon,
             "weights": w})
    cat = catalog(a, shock, goals, horizon)
    combos = generate(cat, seed=account_id)
    ev("life_planner", "tool_call", f"Built {len(cat)} decisions into {len(combos)} candidate plans",
       items=sorted({s.title for s in cat})[:12], data={"decisions": len(cat), "generated": len(combos)})
    ev("life_planner", "handoff", f"{len(combos)} plans", to="engine", data={"generated": len(combos)})

    baseline_out = simulate(a, shock, goals, [], horizon)
    base_comp = components(a, shock, baseline_out, [], need, horizon)
    cands: list[Candidate] = []
    for i, steps in enumerate(combos):
        c = Candidate(id=f"c{i:03d}", steps=steps, round=len(steps))
        cands.append(c)
    rules = screens(a, shock, ctx_text)
    screened: dict[str, int] = {name: 0 for name, _ in rules}
    for c in cands:
        for name, bad in rules:
            try:
                hit = bool(bad(c.steps))
            except Exception:
                hit = False
            if hit:
                c.status, c.reason = "screened", name
                screened[name] += 1
                break
    feasible = [c for c in cands if c.status != "screened"]
    for c in cands:  # simulate all, screened too, so the visual can place them
        c.outcome = simulate(a, shock, goals, c.steps, horizon)
        c.comp = components(a, shock, c.outcome, c.steps, need, horizon)
        c.score = weighted(c.comp, w)
    ev("engine", "tool_result", f"Simulated {len(cands)} plans over {horizon} months",
       data={"simulated": len(cands), "months": horizon, "baseline": base_comp})
    ev("engine", "handoff", f"{len(cands)} simulated", to="validator", data={"simulated": len(cands)})
    n_screened = sum(screened.values())
    ev("validator", "output", f"Screened out {n_screened} plans that do not fit this life",
       items=[f"{k}: {v}" for k, v in screened.items() if v], data={"screened_out": n_screened})
    ev("validator", "handoff", f"{len(feasible)} feasible", to="ranker", data={"feasible": len(feasible), "screened_out": n_screened})

    # keep only plans that beat doing nothing on at least one axis
    better = [c for c in feasible if any(c.comp[k] > base_comp[k] + 1e-6 for k in ("shortfall", "resilience", "goals"))]
    for c in feasible:
        if c not in better:
            c.status, c.reason = "dominated", "no better than changing nothing"
    _pareto(better)
    front = [c for c in better if c.status == "pareto"]
    ev("ranker", "output", f"{len(front)} plans on the frontier; {len(feasible) - len(front)} beaten by another plan",
       data={"pareto": len(front), "dominated": len(feasible) - len(front)})
    ev("ranker", "handoff", f"{len(front)} on the frontier", to="challenger", data={"pareto": len(front)})

    roles = SHOCK_ROLES if shock.start else LONG_ROLES
    keyf = {"best_shortfall": lambda c: (c.comp["shortfall"], c.score), "best_resilience": lambda c: (c.comp["resilience"], c.score),
            "best_goals": lambda c: (c.comp["goals"], c.score), "best_tradeoff": lambda c: (c.score,),
            "least_disruption": lambda c: (-c.comp["disruption"], c.score)}
    pool = front or better or feasible
    finalists: list[tuple[str, Candidate, list[Candidate]]] = []
    for role in roles:
        if role == "least_disruption":
            ranked = sorted([c for c in pool if c.score >= base_comp_score(base_comp, w)], key=keyf[role], reverse=True) or sorted(pool, key=keyf[role], reverse=True)
        else:
            ranked = sorted(pool, key=keyf[role], reverse=True)
        pick = next((c for c in ranked if all(_jaccard(c.families, f.families) < 0.5 for _, f, _ in finalists)), None)
        if pick is None:
            pick = next((c for c in sorted(better or feasible, key=keyf[role], reverse=True)
                         if all(_jaccard(c.families, f.families) < 0.5 for _, f, _ in finalists)), None)
        if pick is None:
            continue
        pick.status = "finalist"
        finalists.append((role, pick, ranked))
    chosen = {id(f) for _, f, _ in finalists}
    finalists = [(role, c, [x for x in ranked if id(x) not in chosen][:3]) for role, c, ranked in finalists]

    challenger_notes = []
    plans = []
    for role, c, runners in finalists:
        flags = _challenge(c, ctx_text, a)
        challenger_notes += [f"{c.name}: {f['risk']}" for f in flags]
        doc = _plan_doc(role, c, runners, a, shock, goals, need, horizon, w, base_comp, flags)
        axis = {"best_shortfall": "shortfall", "best_resilience": "resilience", "best_goals": "goals"}.get(role)
        lead = finalists[0][1] if finalists and finalists[0][0] == "best_tradeoff" else None
        if axis and lead is not None and lead is not c and lead.comp[axis] >= c.comp[axis]:
            doc["versus"] = (f"The best-balance plan also leads on this ({lead.comp[axis]:.0%}). This is the strongest "
                             f"{ {'shortfall': 'gap cover', 'resilience': 'cushion', 'goals': 'goal progress'}[axis] } "
                             f"from a different approach ({c.comp[axis]:.0%}), for when that plan does not suit you.")
        plans.append(doc)

    # plans that look sensible but do not make it, for contrast (the Challenger's counter-examples)
    failing = sorted([c for c in feasible + [x for x in cands if x.status == "dominated"]
                      if c.status != "finalist" and c.outcome.get("shortfall_total", 0) > 0], key=lambda c: c.score, reverse=True)
    picked: list[Candidate] = []
    for c in failing:
        if c in picked or any(_jaccard(c.families, o.families) >= 0.5 for o in picked):
            continue
        picked.append(c)
        if len(picked) == 3:
            break
    cautionary = []
    for c in picked:
        doc = _plan_doc("falls_short", c, [], a, shock, goals, need, horizon, w, base_comp, _challenge(c, ctx_text, a))
        doc["pareto"] = c.status == "pareto"
        doc["fails_because"] = _fails_because(c, a, shock)
        doc["versus"] = ""
        cautionary.append(doc)
    if cautionary:
        ev("challenger", "output", f"{len(cautionary)} sensible-looking plans still run short",
           items=[f"{d['name']}: {d['fails_because']}" for d in cautionary])
    ev("challenger", "output", f"Checked {len(plans)} finalists against what you told Pulp",
       items=challenger_notes or ["No conflicts with your stated constraints"])
    ev("challenger", "handoff", f"{len(plans)} finalists", to="director", data={"finalists": len(plans)})
    ev("director", "output", "Four distinct plans, one per goal of the objective" if len(plans) == 4 else f"{len(plans)} distinct plans",
       items=[f"{p['role_label']}: {p['name']} (score {p['score']:.2f})" for p in plans])

    base_plan = {"id": "baseline", "name": "Change nothing", "summary": "Keep living as you do now.", "why": "The reference every plan is measured against.",
                 "steps": [], "outcome": _outcome(baseline_out, base_comp), "score": weighted(base_comp, w), "components": base_comp,
                 "pareto": False, "source": "baseline", "flags": [], "survives": baseline_out["shortfall_total"] <= 0,
                 "first_short_month": baseline_out["first_shortfall_month"]}
    counts = {"generated": len(cands), "screened_out": n_screened, "feasible": len(feasible), "pareto": len(front), "finalists": len(plans)}
    search = {**counts, "screens": [{"rule": k, "removed": v} for k, v in screened.items() if v],
              "rounds": [{"round": 1, "agent": "life_planner", "title": "Generated", "count": len(cands)},
                         {"round": 2, "agent": "validator", "title": "Feasible after screens", "count": len(feasible)},
                         {"round": 3, "agent": "ranker", "title": "On the frontier", "count": len(front)},
                         {"round": 4, "agent": "director", "title": "Finalists", "count": len(plans)}],
              "candidates": [{"id": c.id, "name": c.name, "decisions": c.decisions, "resilience": c.comp["resilience"], "goals": c.comp["goals"],
                              "shortfall": c.comp["shortfall"], "disruption": c.comp["disruption"], "score": c.score, "status": c.status,
                              "reason": c.reason or None, "round": c.round} for c in cands][:400]}
    tradeoff = next((p for p in plans if p["role"] == "best_tradeoff"), plans[0] if plans else None)
    result = {
        "account_id": account_id,
        "shock": {"label": shock.label, "r": shock.r, "h": shock.h, "one_off": shock.one_off, "duration": shock.duration},
        "horizon_months": horizon, "plan_mode": mode, "shock_starts_in": shock.start, "trigger": trigger,
        "objective": {"formula": ("score = w_short x gap covered + w_res x cushion + w_goal x sum(goal weight x progress) - w_dis x disruption"),
                      "weights": w, "goal_weights": [{"goal_id": g.id, "label": g.label, "weight": round(g.weight, 4), "horizon": g.horizon,
                                                      "importance": g.importance} for g in goals]},
        "baseline": base_plan, "plans": plans, "cautionary": cautionary, "recommended": tradeoff["id"] if tradeoff else "baseline",
        "mode": "offline", "trace": trace, "search": search, "built_at": _now(),
        "elapsed_ms": round((time.perf_counter() - t0) * 1000),
    }
    if use_ai:
        _phrase_with_ai(result, a)
    if store:
        _store(account_id, result, ctx)
    return result


def base_comp_score(base_comp: dict, w: dict) -> float:
    return weighted(base_comp, w)


def _shock_label(r: float, h: float, one: float, dur: int) -> str:
    parts = []
    if r < 1:
        parts.append(f"income at {r:.0%}")
    if h:
        parts.append(f"bills {h:+.0%}")
    if one:
        parts.append(f"a {_m(one)} cost")
    return (", ".join(parts) or "no change") + f" for {dur} months"


def _outcome(out: dict, comp: dict) -> dict:
    return {**{k: out[k] for k in ("cash_path", "goal_paths", "min_cash", "months_covered", "shortfall_total", "end_cash", "goals")},
            "resilience": comp["resilience"], "goal_score": comp["goals"]}


def _challenge(c: Candidate, ctx_text: str, a: Account) -> list[dict]:
    flags = []
    fams = {s.family for s in c.steps}
    if "second_job" in fams and _f(a.row, "n_authorized_users") > 0:
        flags.append({"risk": "Time with the household", "severity": "medium", "because": "A joint account suggests a shared household; extra work takes evenings or weekends."})
    if "move" in fams:
        flags.append({"risk": "A move is hard to undo", "severity": "high", "because": "Moving costs come first and the savings come later."})
    if "cut" in fams and _f(a.row, "spending_ratio") < 0.8:
        flags.append({"risk": "Cuts may already be done", "severity": "low", "because": "Spending is already well below income."})
    if any(s.effect == "invest" for s in c.steps):
        flags.append({"risk": "Market risk", "severity": "medium", "because": "Invested savings can fall; the 5% a year is an assumption."})
    if "worried" in ctx_text and any(s.family == "move" for s in c.steps):
        flags.append({"risk": "Adds stress", "severity": "medium", "because": "You told Pulp you are worried; a move adds pressure."})
    return flags


def _plan_doc(role: str, c: Candidate, runners: list[Candidate], a: Account, shock: Shock, goals: list[Goal], need: float,
              horizon: int, w: dict, base_comp: dict, flags: list[dict]) -> dict:
    # each step's contribution: rerun without it (the Engine measures, nobody guesses)
    reasoning = []
    for i, s in enumerate(c.steps):
        rest = [x for x in c.steps if x is not s]
        out = simulate(a, shock, goals, rest, horizon)
        comp = components(a, shock, out, rest, need, horizon)
        moves = []
        for k, word in (("shortfall", "gap covered"), ("resilience", "cushion"), ("goals", "goals")):
            d = c.comp[k] - comp[k]
            if abs(d) >= 0.005:
                moves.append(f"{word} {d * 100:+.0f} pts")
        dcash = c.outcome["end_cash"] - out["end_cash"]
        if abs(dcash) >= 1:
            moves.append(f"end cash {'+' if dcash >= 0 else '-'}{_m(abs(dcash))}")
        reasoning.append({"step": i + 1, "because": s.because, "evidence": s.evidence, "moves": ", ".join(moves) or "small effect on its own"})
    role_key = {"best_shortfall": "shortfall", "best_resilience": "resilience", "best_goals": "goals",
                "least_disruption": "disruption"}.get(role)
    if runners:
        r0 = runners[0]
        if role_key and role_key != "disruption":
            versus = (f"Beat {r0.name.lower()} on {ROLE_LABELS[role].lower()}: {c.comp[role_key]:.0%} against {r0.comp[role_key]:.0%}, "
                      f"with a weighted score of {c.score:.2f} against {r0.score:.2f}.")
        elif role_key == "disruption":
            versus = f"Asks the least change ({c.comp['disruption']:.0%}) of the plans that still beat changing nothing; next was {r0.name.lower()} at {r0.comp['disruption']:.0%}."
        else:
            versus = f"Highest weighted score ({c.score:.2f}); next best was {r0.name.lower()} at {r0.score:.2f}."
    else:
        versus = "No close alternative passed the screens."
    first = c.outcome["first_shortfall_month"]
    goal_bits = [f"{g['label'].lower()} {g['progress']:.0%}" for g in c.outcome["goals"]]
    summary = (f"{'No shortfall' if not first else f'Money runs short from month {first}'}; "
               f"{_m(c.outcome['end_cash'])} in cash after {horizon} months; goals: {', '.join(goal_bits)}.")
    gain = []
    for k, word in (("shortfall", "gap covered"), ("resilience", "cushion"), ("goals", "goals")):
        d = c.comp[k] - base_comp[k]
        if abs(d) >= 0.01:
            gain.append(f"{word} {d * 100:+.0f} points")
    why = (f"Against changing nothing: {', '.join(gain) or 'about the same'}. " + (reasoning[0]["because"] if reasoning else ""))
    return {"id": c.id, "name": c.name, "summary": summary, "why": why, "steps": [s.as_dict() for s in c.steps],
            "outcome": _outcome(c.outcome, c.comp), "score": c.score, "components": c.comp, "pareto": True,
            "source": c.source, "flags": flags, "role": role, "role_label": ROLE_LABELS[role], "reasoning": reasoning,
            "versus": versus, "survives": c.outcome["shortfall_total"] <= 0, "first_short_month": first}


def _fails_because(c: Candidate, a: Account, shock: Shock) -> str:
    first = c.outcome.get("first_shortfall_month")
    end = shock.start + shock.duration - 1
    if first and shock.start and first > end:
        return (f"Gets through the shock but runs short in month {first}, {first - end} months after it ends; "
                f"{_m(c.outcome['shortfall_total'])} uncovered in all. It falls short because spending stays above income "
                f"({a.S / max(a.I, 1):.0%} of it) once the plan's temporary changes stop.")
    when = (f"Runs short in month {first}" + (f", month {first - shock.start + 1} of the shock" if shock.start and first >= shock.start else "")
            if first else "Runs short")
    total = f"{_m(c.outcome['shortfall_total'])} uncovered in all"
    fams = set(c.families)
    gap = max(0.0, a.S + shock.h * a.H - shock.r * a.I)
    if shock.start and shock.r < 1 and not fams & {"second_job", "housing_share", "move"}:
        why = f"it adds no income while money in is down to {shock.r:.0%}, and the cuts are smaller than the {_m(gap)} monthly gap"
    elif shock.start and min((s.month_start for s in c.steps), default=1) > shock.start:
        why = "its steps start after the shock has already begun"
    elif any(s.effect in ("reserve_first", "invest", "delay_goal") for s in c.steps) and len(c.steps) <= 2:
        why = "it moves money between pots but does not change what comes in or goes out"
    else:
        freed = sum(max(0.0, s.monthly_effect) for s in c.steps)
        why = f"its changes free about {_m(freed)} a month against a gap of {_m(gap)}" if shock.start else "spending stays above income for too long"
    return f"{when}; {total}. It falls short because {why}."


def _phrase_with_ai(result: dict, a: Account) -> None:
    """Optional: let the Director rewrite each finalist's `why` in plain words. Numbers stay as computed."""
    try:
        from .adk_runtime import adk_available, run_agent, json_block
        if not adk_available():
            return
        from google.adk.agents import LlmAgent
        from ..config import GEMINI_MODEL
        agent = LlmAgent(name="director", model=GEMINI_MODEL, instruction=(
            "You explain financial plans to one person in plain, warm, precise English. For each plan, write one or two "
            "sentences saying why it suits them, using only the facts given. Never invent or change numbers. "
            'Return JSON {"plans": [{"id": str, "why": str}]}.'))
        import json
        payload = json.dumps({"shock": result["shock"], "plans": [{"id": p["id"], "role": p["role_label"], "name": p["name"],
                              "summary": p["summary"], "reasoning": p["reasoning"], "versus": p["versus"]} for p in result["plans"]]})
        out = json_block(" ".join(run_agent(agent, payload, user_id=str(a.account_id)).get("texts", {}).get("director", [])))
        for item in (out or {}).get("plans", []):
            p = next((x for x in result["plans"] if x["id"] == item.get("id")), None)
            if p and isinstance(item.get("why"), str) and not any(ch.isdigit() for ch in item["why"].replace(p["why"], "")):
                p["why"] = item["why"][:400]
        result["mode"] = "adk"
    except Exception:
        return


def _store(account_id: int, result: dict, ctx: dict) -> None:
    from . import context_manager as cm
    try:
        prev = next((h for h in reversed(ctx.get("plan_history", [])) if h.get("plan_mode") == result["plan_mode"]), None)
        entry = {"id": uuid.uuid4().hex[:10], "at": _now(), "trigger": result.get("trigger") or "Plans requested",
                 "plan_mode": result["plan_mode"], "shock_label": result["shock"]["label"],
                 "profile_version": ctx.get("context_version", 1),
                 "goals": [{"label": g["label"], "weight": g["weight"]} for g in result["objective"]["goal_weights"]],
                 "finalists": [{"role": p["role"], "role_label": p["role_label"], "name": p["name"],
                                "decisions": [s["decision"] for s in p["steps"]], "score": p["score"], "components": p["components"]}
                               for p in result["plans"]]}
        entry["changed"] = _diff(prev, entry)
        lean = {k: v for k, v in result.items() if k != "search"}
        lean["search"] = {**result["search"], "candidates": result["search"]["candidates"][:120]}
        with cm._LOCK:
            fresh = cm.load_context(account_id)
            fresh["life_plans"] = lean
            hist = fresh.setdefault("plan_history", [])
            hist.append(entry)
            fresh["plan_history"] = hist[-30:]
            cm.save_context(fresh)
    except Exception:
        return


def _diff(prev: dict | None, cur: dict) -> list[str]:
    if prev is None:
        return ["First plan of this kind."]
    out = []
    pg = {g["label"]: g["weight"] for g in prev.get("goals", [])}
    cg = {g["label"]: g["weight"] for g in cur["goals"]}
    for k in cg.keys() - pg.keys():
        out.append(f"New goal weighed in: {k}.")
    for k in pg.keys() - cg.keys():
        out.append(f"Goal no longer in the profile: {k}.")
    for k in cg.keys() & pg.keys():
        if abs(cg[k] - pg[k]) >= 0.03:
            out.append(f"{k} now weighs {cg[k]:.0%} (was {pg[k]:.0%}).")
    pf = {f["role"]: f for f in prev.get("finalists", [])}
    for f in cur["finalists"]:
        old = pf.get(f["role"])
        if old is None:
            continue
        if old["name"] != f["name"]:
            out.append(f"{f['role_label']}: now {f['name'].lower()} (was {old['name'].lower()}).")
        elif abs(old["score"] - f["score"]) >= 0.01:
            out.append(f"{f['role_label']}: score {old['score']:.2f} to {f['score']:.2f}.")
    if prev.get("shock_label") != cur["shock_label"]:
        out.append(f"Shock changed to {cur['shock_label'].lower()}.")
    return out or ["No change since the last plan."]


def history(account_id: int) -> list[dict]:
    from . import context_manager as cm
    return list(reversed(cm.load_context(account_id).get("plan_history", [])))
