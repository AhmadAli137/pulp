"""Stage 3 from conversation: notice a current or future shock or a big decision in what the person says, and plan for it.

Detection is deterministic (patterns over the words, amounts parsed from the text). The shock's numbers come from the
same rules as the deck: EI at 55%, a percentage or dollar amount the person said, or a multiple of their own spending.
The Life Planner then searches, screens and ranks plans; its trace streams to the workflow view.
"""
from __future__ import annotations

import re
from typing import Any

_MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|K|thousand)?|(\d[\d,]*(?:\.\d+)?)\s*(k|K|thousand)?\s*(?:dollars|bucks)")
_PCT = re.compile(r"(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)")
_MONTHS = re.compile(r"(\d{1,2}|a|one|two|three|four|five|six|eight|nine|ten|twelve)\s*(?:more\s+)?(month|months|year|years)")
_WORDS = {"a": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "eight": 8, "nine": 9, "ten": 10, "twelve": 12}

PAST = re.compile(r"\b(i|we)\s+(just\s+)?(lost|got laid off|was laid off|were laid off|got fired|was fired|got let go|had to)|\b(just|already)\s+(happened|broke|died)|\bbroke down\b|\bhas gone up\b|\bwent up\b|\bwe had a baby\b", re.I)
NOW = re.compile(r"\b(tomorrow|today|tonight|this week|right now|this month)\b", re.I)
FUTURE = re.compile(r"\b(might|may|could|worried|afraid|scared|thinking|considering|planning|going to|gonna|next (month|year)|soon|if i|what if|should i|should we)\b", re.I)

PATTERNS: list[tuple[str, re.Pattern, dict]] = [
    ("layoff", re.compile(r"\b(lose|lost|losing)\s+(my|our|his|her|their)\s+job|laid off|lay ?offs?|\bfired\b|let go|unemploy|job cuts|redundan", re.I),
     {"title": "Losing the job", "r": 0.55, "h": 0.0, "duration": 6, "category": "income"}),
    ("hours_cut", re.compile(r"(hours|shifts)\s+(got\s+|are\s+being\s+|were\s+)?(cut|reduced)|cut (my|our) hours|part[- ]time now|pay cut|salary cut", re.I),
     {"title": "Hours or pay cut", "r": 0.75, "h": 0.0, "duration": 6, "category": "income"}),
    ("rent_up", re.compile(r"\b(rent|bills|utilities|hydro|heating)\b.*\b(up|increase|rais|higher|more)|\b(increase|rais)\w*\s+(the\s+|my\s+|our\s+)?(rent|bills)", re.I),
     {"title": "Rent and bills going up", "r": 1.0, "h": 0.15, "duration": 12, "category": "housing"}),
    ("bill", re.compile(r"\b(bill|bills|invoice|fine|ticket|fee|deductible|expense)\b.*\d|\d.*\b(bill|invoice|fine|ticket|fee|deductible|expense)\b", re.I),
     {"title": "An unexpected bill", "r": 1.0, "h": 0.0, "duration": 6, "one_off_S": 0.3, "category": "costs"}),
    ("repair", re.compile(r"\b(car|furnace|roof|transmission|fridge|washer|boiler|engine|laptop)\b.*\b(broke|died|dead|repair|fix|replace|gone)|\bbroke down\b", re.I),
     {"title": "A big repair", "r": 1.0, "h": 0.0, "duration": 6, "one_off_S": 0.5, "category": "transport"}),
    ("health", re.compile(r"\b(sick|illness|surgery|injur|hospital|medical leave|sick leave|burn ?out)\b", re.I),
     {"title": "Time off for health", "r": 0.55, "h": 0.0, "duration": 4, "one_off_S": 0.2, "category": "health"}),
    ("baby", re.compile(r"\b(baby|pregnan|parental leave|maternity|paternity)\b", re.I),
     {"title": "A new baby", "r": 0.55, "h": 0.10, "duration": 12, "category": "family"}),
    ("family", re.compile(r"\b(support|help|look after|care for)\b.*\b(mom|mum|dad|parent|parents|family|sister|brother)\b", re.I),
     {"title": "Supporting family", "r": 1.0, "h": 0.0, "duration": 6, "one_off_S": 0.6, "category": "family"}),
]
DECISIONS: list[tuple[str, re.Pattern, str]] = [
    ("second_job", re.compile(r"second job|side (hustle|gig|job|business)|extra (job|work|shifts)|freelanc|start a business", re.I), "Taking on more work"),
    ("move", re.compile(r"\b(move|moving|relocat)\w*\b|new city|cheaper (place|apartment|city)", re.I), "Moving"),
    ("buy_home", re.compile(r"buy(ing)? a (house|home|condo|place)|mortgage|down ?payment", re.I), "Buying a home"),
    ("buy_car", re.compile(r"buy(ing)? a (car|truck|vehicle)|car loan|lease a car", re.I), "Buying a car"),
    ("invest", re.compile(r"\b(invest|tfsa|rrsp|stocks|etf|index fund)\b", re.I), "Investing"),
    ("quit", re.compile(r"\bquit\b|go back to school|career change|sabbatical", re.I), "Changing course"),
]


_BARE = re.compile(r"\b(?:of|for|about|around|is|costs?|be)\s+(\d[\d,]{2,}(?:\.\d+)?)\s*(k|K|thousand)?\b")


def _amount(text: str) -> float | None:
    m = _MONEY.search(text)
    if not m:
        b = _BARE.search(text)
        if not b:
            return None
        try:
            v = float(b.group(1).replace(",", "")) * (1000 if b.group(2) else 1)
        except ValueError:
            return None
        return v if v > 0 else None
    raw = (m.group(1) or m.group(3) or "").replace(",", "")
    try:
        v = float(raw)
    except ValueError:
        return None
    if m.group(2) or m.group(4):
        v *= 1000
    return v if v > 0 else None


def _months(text: str) -> int | None:
    m = _MONTHS.search(text)
    if not m:
        return None
    n = _WORDS.get(m.group(1).lower()) if not m.group(1).isdigit() else int(m.group(1))
    if n is None:
        return None
    return int(n * 12 if m.group(2).startswith("year") else n)


def detect(text: str) -> dict | None:
    """What the person described: a shock (with numbers), a decision, or nothing."""
    t = (text or "").strip()
    if len(t) < 6 or t.startswith(("twist:", "decision:", "__")):
        return None
    timing = "now" if (PAST.search(t) or NOW.search(t)) else "soon" if FUTURE.search(t) else "now"
    for key, rx, base in PATTERNS:
        if rx.search(t):
            d = {"kind": "shock", "key": key, "timing": timing, **{k: v for k, v in base.items()}}
            pct = _PCT.search(t)
            amt = _amount(t)
            months = _months(t)
            if key in ("rent_up",) and pct:
                d["h"] = min(1.0, float(pct.group(1)) / 100)
            if key == "rent_up" and amt:
                d["bills_dollars"] = amt
            if key in ("hours_cut",) and pct:
                v = float(pct.group(1)) / 100
                d["r"] = max(0.0, 1 - v) if re.search(r"cut|reduc|less", t, re.I) and v < 0.9 else v
            if key in ("bill", "repair", "health", "family") and amt:
                d["one_off"] = amt
                d.pop("one_off_S", None)
            if months:
                d["duration"] = max(1, min(24, months))
            return d
    for key, rx, title in DECISIONS:
        if rx.search(t):
            return {"kind": "decision", "key": key, "title": title, "timing": "soon", "amount": _amount(t)}
    return None


def shock_inputs(d: dict, m: Any) -> dict:
    """Turn a detection into the engine's shock inputs, in the account's own numbers."""
    S = float(getattr(m, "typical_spending", 0) or 0)
    H = float(getattr(m, "household_bills", 0) or 0)
    I = float(getattr(m, "typical_inflow", 0) or 0)
    r, h = float(d.get("r", 1.0)), float(d.get("h", 0.0))
    one = float(d.get("one_off") or 0.0) or float(d.get("one_off_S") or 0.0) * S
    note = None
    if d.get("bills_dollars"):
        if H > 0:
            h = float(d["bills_dollars"]) / H
        elif I > 0:
            r = max(0.0, r - float(d["bills_dollars"]) / I)
            h = 0.0
            note = "no labelled household bills, so the extra cost is modelled as lower income"
    if h and H <= 0 and I > 0:
        r = max(0.0, r - h * 0.3 * S / I)
        note = "no labelled household bills, so the bills rise is modelled as lower income"
        h = 0.0
    return {"income_fraction": round(r, 4), "bills_increase": round(h, 4), "one_off_cost": round(one, 2),
            "shock_duration": int(d.get("duration", 6)), "label": d.get("title", "Your scenario"), "note": note}


def decision_inputs(d: dict) -> dict:
    """A decision is planned as a long-term question: which plans include it and how they compare."""
    return {"mode": "long_term", "focus": d["key"], "label": d["title"]}


def summary_line(result: dict, d: dict) -> str:
    s = result.get("search", {})
    plans = result.get("plans", [])
    best = next((p for p in plans if p.get("role") == "best_tradeoff"), plans[0] if plans else None)
    base = result.get("baseline", {})
    if not best:
        return "I could not find a plan that beats changing nothing."
    lead = (f"I ran {s.get('generated', 0)} plans for {d.get('title', 'that').lower()}, screened out {s.get('screened_out', 0)} that "
            f"don't fit your life, and kept {len(plans)} that each win on something different.")
    base_ok = base.get("survives", True)
    best_line = (f" The best balance is {best['name'].lower()}"
                 + (", and it gets you through without running short." if best.get("survives") else
                    f", though money still runs short in month {best.get('first_short_month')}.")
                 + ("" if base_ok else f" Changing nothing runs short in month {base.get('first_short_month')}."))
    return lead + best_line + " The plans are in the panel and in My Plan."
