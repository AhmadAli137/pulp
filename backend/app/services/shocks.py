"""Stage 3 Shock Generator: shocks that fit this person's life, a risk officer's view of the account.

The generic deck treats everyone the same. This one reads the Stage 1 signals and the persona: a cash earner gets a
lost client and a slow season, a borrower gets a payment reset, a family account gets parental leave, someone in a
district where unemployment is rising gets a layoff marked as more likely. Every number is set by code from the
account's own figures (I, S, H, P) and from the same Employment Insurance rate (55%) the brief uses; a model, when
present, may only rephrase the card's text. Cards are stored in the context under `deck`.
"""
from __future__ import annotations

import math
import random
import time
from datetime import datetime, timezone
from typing import Any

from . import context_manager as cm


def _f(row: Any, key: str, default: float = 0.0) -> float:
    try:
        v = float(row.get(key, default))
        return v if math.isfinite(v) else default
    except (TypeError, ValueError):
        return default


def _m(x: float) -> str:
    return f"${x:,.0f}"


def _round(x: float) -> float:
    step = 50 if x < 2000 else 100 if x < 10000 else 500
    return float(max(step, round(x / step) * step))


def _card(key, title, text, r, h, one_off, duration, category, likelihood, why_you):
    return {"key": f"p_{key}", "title": title, "text": text, "r": round(float(r), 3), "h": round(float(h), 3),
            "one_off": round(float(one_off), 2), "duration": int(duration), "category": category, "likelihood": likelihood,
            "why_you": why_you, "source": "shock_generator"}


def generate(account_id: int, persona: dict | None = None) -> tuple[list[dict], list[dict]]:
    """Personal cards and the trace of how they were chosen."""
    from .data_store import get_store
    from .features import get_features
    t0 = time.perf_counter()
    trace: list[dict] = []

    def ev(kind, title, to=None, items=None, data=None):
        e = {"t": round(time.perf_counter() - t0, 3), "stage": 3, "agent": "shock_generator", "kind": kind, "title": title}
        if to:
            e["to"] = to
        if items:
            e["items"] = [str(i)[:160] for i in items][:12]
        if data:
            e["data"] = data
        trace.append(e)

    f = get_features()
    row = f.loc[account_id]
    I, S, H, P, B = (_f(row, k) for k in ("I", "S", "H", "P", "B"))
    age = _f(row, "owner_age") or 40
    joint = _f(row, "n_authorized_users") > 0
    cash = _f(row, "cash_deposit_share")
    cv = _f(row, "income_cv")
    pension = _f(row, "pension_share") >= 0.5
    dec = _f(row, "december_spend_ratio")
    try:
        d = get_store().districts.set_index("district_id").loc[int(row.get("district_id"))]
        un22, un23, urban = float(d["unemployment_rate_2022"]), float(d["unemployment_rate_2023"]), float(d["urban_ratio_pct"])
    except Exception:
        un22 = un23 = _f(row, "district_unemployment")
        urban = 50.0
    rising = un23 > un22 + 0.05
    goals = (persona or {}).get("goals") or []
    ev("start", "Reading the life behind the account", items=[
        f"age {age:.0f}", "joint account" if joint else "single owner", f"{cash:.0%} of income in cash, volatility {cv:.2f}",
        f"district unemployment {un22:.2f}% to {un23:.2f}%", f"loan payment {_m(P)}" if P else "no loan",
        f"{len(goals)} goals in the persona"])

    cards: list[dict] = []
    lay_like = "high" if (rising or (cash >= 0.8 and cv >= 0.5)) else "medium" if not pension else "low"
    if not pension:
        cards.append(_card("layoff", "Laid off", f"Your job ends. EI pays 55% of your usual income, about {_m(0.55 * I)} a month, for 6 months.",
                           0.55, 0, 0, 6, "income", lay_like,
                           (f"Unemployment in your district rose from {un22:.2f}% to {un23:.2f}%" if rising else
                            f"Unemployment in your district is {un23:.2f}%") + "; a layoff is the shock the brief tests first."))
    if cash >= 0.8 and cv >= 0.4:
        cards.append(_card("client_loss", "Your biggest client walks", "A regular customer or contract stops; income drops to 60% for 4 months while you replace it.",
                           0.6, 0, 0, 4, "income", "high", f"{cash:.0%} of your income arrives as cash and it swings month to month ({cv:.2f})."))
        cards.append(_card("slow_season", "A slow season", "Three quiet months: income runs at 70% of normal.", 0.7, 0, 0, 3, "income", "medium",
                           "Uneven cash income usually has a seasonal low."))
    elif not pension:
        cards.append(_card("hours_cut", "Hours cut", "Your employer cuts you to 75% of your hours for 6 months.", 0.75, 0, 0, 6, "income",
                           "medium", "Regular pay can still shrink when hours are cut, without a layoff."))
    if pension:
        cards.append(_card("pension_lag", "Costs outrun the pension", "Your pension stays flat while household bills rise 10% for a year.",
                           1.0, 0.10, 0, 12, "costs", "high", f"{_f(row, 'pension_share'):.0%} of your income is a pension, which does not rise with prices."))
        cards.append(_card("home_repair", "The roof needs work", f"A repair you cannot put off, about {_m(_round(2 * S))}.", 1.0, 0, _round(2 * S), 6,
                           "housing", "medium", "Older homes and owners face larger one-off repairs."))
    if age >= 50 and not pension:
        cards.append(_card("health", "Off work for a health scare", f"Three months on EI sickness benefits at 55%, and about {_m(_round(0.3 * S))} in costs the plan does not cover.",
                           0.55, 0, _round(0.3 * S), 3, "health", "medium", f"At {age:.0f}, a health interruption becomes more likely."))
    if joint and 26 <= age <= 45:
        cards.append(_card("parental", "A new baby", "Parental benefits pay 55% for 12 months and household costs go up 10%.", 0.55, 0.10, 0, 12,
                           "family", "medium", "A joint account at your age; parental leave is the most common planned income drop."))
    if P > 0:
        extra = _round(0.25 * P * 12)
        cards.append(_card("rate_reset", "Loan payment resets higher", f"At renewal the payment rises about 25%, roughly {_m(_round(0.25 * P))} more a month, {_m(extra)} over a year.",
                           1.0, 0, extra, 12, "costs", "medium", f"Your loan payment is {_m(P)} a month, {_f(row, 'loan_payment_share'):.0%} of income."))
    if age < 32:
        if H > 0:
            cards.append(_card("roommate_leaves", "Your roommate moves out", "You carry the whole rent and bills for a year: household bills up 40%.",
                               1.0, 0.40, 0, 12, "housing", "medium", "Shared housing is common at your age; losing a roommate is a sudden cost."))
        else:
            cards.append(_card("roommate_leaves", "Your roommate moves out", f"You cover their share for a year, about {_m(_round(0.15 * S))} a month, {_m(_round(0.15 * S * 12))} in all.",
                               1.0, 0, _round(0.15 * S * 12), 12, "housing", "medium", "Shared housing is common at your age; losing a roommate is a sudden cost."))
    if H > 0 and urban >= 70:
        cards.append(_card("rent_up", "Rent renewal", "The lease renews and rent plus utilities go up 12%.", 1.0, 0.12, 0, 12, "housing", "high",
                           "City rents reset at renewal; your bills are labelled, so the rise shows directly."))
    if urban < 70:
        cards.append(_card("car", "The car dies", f"A rural commute without a car is not an option: a replacement down payment of about {_m(_round(0.4 * S))}.",
                           1.0, 0, _round(0.4 * S), 6, "transport", "medium", "You live in a mostly rural district, where a car is usually essential."))
    else:
        cards.append(_card("car_repair", "Car repair", "The transmission goes; the shop wants $1,800 this week.", 1.0, 0, 1800, 6, "transport", "low",
                           "A common one-off cost; the amount is illustrative."))
    if dec >= 1.3:
        cards.append(_card("holidays", "December runs over", f"December costs {dec:.1f}x a normal month again, about {_m(_round((dec - 1) * S))} extra.",
                           1.0, 0, _round((dec - 1) * S), 6, "costs", "high", f"Your Decembers have cost {dec:.1f}x a typical month."))
    transfer = max(_f(row, "recurring_partner_amount"), _f(row, "regular_transfer_out_amount"))
    if transfer > 0 and "loan" not in str(row.get("recurring_partner_purpose", "")).lower():
        cards.append(_card("family_help", "Family needs more help", f"Someone you already support needs double for 6 months: about {_m(_round(transfer))} more a month.",
                           1.0, 0, _round(transfer * 6), 6, "family", "medium", f"A steady {_m(transfer)} a month already goes to one other account."))
    big = next((g for g in goals if g.get("size") == "large" and g.get("type") not in ("emergency_fund",)), None)
    if not pension and age < 58:
        cards.append(_card("job_offer", "A better job in another city", f"An offer paying 15% more, but moving costs about {_m(_round(1.2 * S))} up front.",
                           1.15, 0, _round(1.2 * S), 12, "opportunity", "low",
                           "Not every shock is bad news; a good offer still strains the cushion." + (f" It would speed up {big['label'].lower()}." if big else "")))
    rng = random.Random(account_id)
    rng.shuffle(cards)
    order = {"high": 0, "medium": 1, "low": 2}
    cards.sort(key=lambda c: order[c["likelihood"]])
    ev("tool_call", f"Matched {len(cards)} shocks to this life", items=[f"{c['title']} ({c['likelihood']}): {c['why_you']}" for c in cards])
    ev("handoff", f"{len(cards)} personal shocks", to="engine", data={"cards": len(cards)})
    return cards, trace


def personal_deck(account_id: int, rebuild: bool = False) -> dict:
    """The stored personal deck, built on first use from the persona."""
    ctx = cm.load_context(account_id)
    deck = ctx.get("deck")
    persona = ctx.get("persona")
    if deck and not rebuild and deck.get("persona_built_at") == (persona or {}).get("built_at"):
        return deck
    if persona is None:
        try:
            from .persona import get_persona
            persona = get_persona(account_id)
        except Exception:
            persona = None
    cards, trace = generate(account_id, persona)
    deck = {"cards": cards, "source": "shock_generator (rules from Stage 1 signals and the persona)", "trace": trace,
            "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "persona_built_at": (persona or {}).get("built_at")}
    cm.set_doc(account_id, "deck", deck)
    return deck


def find_card(account_id: int | None, key: str, seed: int | None = None) -> dict | None:
    """Resolve a personal card key (p_*) or deal a random personal card; None if not personal."""
    if account_id is None:
        return None
    if not (key.startswith("p_") or key in ("random", "personal")):
        return None
    try:
        cards = personal_deck(account_id)["cards"]
    except Exception:
        return None
    if not cards:
        return None
    if key.startswith("p_"):
        return next((dict(c) for c in cards if c["key"] == key), None)
    rng = random.Random(seed if seed is not None else time.time_ns())
    weights = [{"high": 3, "medium": 2, "low": 1}[c["likelihood"]] for c in cards]
    return dict(rng.choices(cards, weights=weights, k=1)[0])
