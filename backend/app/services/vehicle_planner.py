"""Prospective vehicle planning. All purchase and budget amounts come from the customer."""
import re

MONEY = r"\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kK]?)"
QUESTIONS = {
    "price": "What price or price range are you considering, including taxes and purchase fees? For example, $5,000 to $7,000.",
    "model": "Which make, model and year are you considering? 'Undecided' is fine.",
    "method": "Would you pay cash or finance the purchase?",
    "down": "How much cash would you pay upfront, including any fees due today?",
    "payment": "What monthly payment did the lender quote? Use the payment including interest.",
    "reserve": "How much cash do you want to keep untouched after the purchase?",
    "budget": "In a month you want to plan around, how much is left after your current expenses, including commuting? A negative amount is fine.",
    "commute": "How much monthly commuting expense would actually stop? Leave out any transit pass or rides you would keep.",
    "operating": "How much per month would the car add for insurance, gas, parking and maintenance combined? Give a total estimate, or say 'unknown' for a break-even limit.",
    "cut": "Is there an expense you would willingly reduce? Give the category and monthly amount, like 'takeout $60', or say 'none'."
}


def starts(text):
    return bool(re.search(r"\b(car|vehicle|truck|suv)\b",text,re.I) and
                re.search(r"\b(buy|buying|purchase|purchasing|afford|shopping|looking|save|saving|want|considering|finance)\b",text,re.I) and
                not re.search(r"\b(bought|already purchased)\b",text,re.I))


def amount(text, signed=False):
    m=re.fullmatch((r"(-?)" if signed else "")+MONEY+r"(?:\s*(?:/mo|a month|per month|monthly|CAD))?",text.strip(),re.I)
    if not m: raise ValueError
    n=float(m.groups()[-2].replace(",",""))*(1000 if m.groups()[-1] else 1)
    if n>100000000: raise ValueError
    return -n if signed and m[1] else n


def prices(text):
    parts=re.split(r"\s*(?:-|–|\bto\b)\s*",text.strip(),flags=re.I)
    if not 1<=len(parts)<=2: raise ValueError
    nums=[amount(v) for v in parts]
    if nums[0]<=0 or nums[0]>nums[-1]:raise ValueError
    return nums


def run(text,state,metrics):
    t=text.strip(); s=dict(state or {})
    if t.lower() in ("cancel","stop","never mind"):
        return "Car planning cancelled.",None
    if not state:
        # Only prefill an explicitly currency-marked purchase price, never an inferred car value.
        match=re.search(r"(?:\bfor\s+|\bbudget(?: of)?\s+|\bpriced at\s+)(\$[\d,.]+[kK]?(?:\s*(?:-|to)\s*\$?[\d,.]+[kK]?)?)",t,re.I)
        if match:
            try:s["price"]=prices(match[1])
            except ValueError:pass
    else:
        k=s["next"]
        try:
            if k=="price":s[k]=prices(t)
            elif k=="model":s[k]=t[:180]
            elif k=="method":
                if t.lower() in ("cash","pay cash","in cash"):s[k]="cash"
                elif t.lower() in ("finance","financed","financing","loan"):s[k]="finance"
                else:raise ValueError
            elif k=="operating" and t.lower() in ("unknown","not sure","unsure"):s[k]=None
            elif k=="cut":
                if t.lower() in ("none","no","skip"):s[k]=0;s["category"]=""
                else:
                    match=re.fullmatch(r"(.+?)\s+(\$?[\d,.]+[kK]?)",t)
                    if not match:raise ValueError
                    s[k]=amount(match[2]);s["category"]=match[1]
            else:s[k]=amount(t,signed=k=="budget")
            if k=="down" and s[k]>max(s["price"]):raise ValueError
        except ValueError:
            return "Could you clarify? "+QUESTIONS[k],state
    for k,q in QUESTIONS.items():
        if k in ("down","payment") and s.get("method")!="finance":continue
        if k not in s:
            s["next"]=k
            return q,s
    pay=s.get("payment",0); available=s["budget"]+s["commute"]-pay
    def fmt(value):
        sign = "-" if value < 0 else ""
        return f"{sign}${abs(value):,.2f}"
    upfront=[s["down"]] if s["method"]=="finance" else s["price"]
    lines=[f"Vehicle: {s['model']}. Using the account's historical buffer of {fmt(metrics.buffer)} and your protected reserve of {fmt(s['reserve'])}:"]
    for cost in dict.fromkeys(upfront):
        room=metrics.buffer-cost-s["reserve"]
        lines.append(f"After {fmt(cost)} upfront, you have {fmt(room)} above your reserve." if room>=0 else
                     f"Paying {fmt(cost)} upfront leaves you {fmt(-room)} below your reserve.")
    lines.append(f"Monthly inputs: {fmt(s['budget'])} left today + {fmt(s['commute'])} commuting costs avoided - {fmt(pay)} loan payment.")
    if s["operating"] is None:
        lines.append(f"Running costs are unknown. You have {fmt(available)} per month available for them." if available>=0 else f"You are already short {fmt(-available)} per month before running costs.")
    else:
        net=available-s["operating"]
        lines.append(f"With {fmt(s['operating'])} in monthly running costs, the plan leaves {fmt(net)} per month." if net>=0 else f"With {fmt(s['operating'])} in monthly running costs, the plan falls short by {fmt(-net)} per month.")
    if s["cut"]:
        after=available+s["cut"]-(s["operating"] or 0)
        lines.append(f"Optional change you chose: reduce {s['category']} by {fmt(s['cut'])}/month. Revised monthly "+("room for running costs" if s["operating"] is None else "balance")+f": {fmt(after)}.")
    lines.append("These are your estimates for the month you described. Check your current available balance before buying.")
    return "\n\n".join(lines),None
