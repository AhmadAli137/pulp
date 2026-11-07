# Demo script

Prep: backend on :8000 with GEMINI_API_KEY in .env, frontend on :5173, intro played once (or skip it), Insights page opened once (findings cached), context for the demo
account deleted (Settings → Delete personal context). Suggested demo account: 47788 (fails the layoff twist by
0.4 months, so every plan number is non-trivial). Have a second account ready for the judge.

## Five-minute version

**Opening (20 s).** "Every financial decision creates possibilities, but most financial tools only show us our
past. PULP helps us explore our future."

**Discovery (50 s, Insights).** "We matched 2,238 pairs of accounts with near-identical inflows and hit both with
the same six-month layoff at 55% income. In 78 pairs the account with more cash ran out first. Across all
4,486 accounts the buffer quartile told us almost nothing, 70% to 73% survival top to bottom, while the
spending-to-income ratio told us everything: 99% in the leanest quartile, 25% in the heaviest." Point at the
two-panel chart, then the representative pair: "$4,574 more in the bank, $1,372 more out every month, and it
runs out first."

**Live account (30 s, Home).** Type the judge's id into Pip's box. Read Pip's summary line and the four stats; Shock Lab has the full tiles. "Typical inflow, spending, fixed
costs, buffer, and the baseline runway. Show the math is one click."

**Live shock (60 s).** Read the twist card to Pip in plain words (or click a suggestion); the verdict card appears inline. For exact values, open Shock Lab. Read the verdict and the official runway.
"Why did this change: income fell by $X a month." Read the goal plan and the backup plan. If the judge changes
the size: edit the field, Recalculate.

**Personal goal (60 s, Home).** Click or say "I want to buy a home in five years." Confirm the proposal.
"The plan engine now compares four strategies under a stress test and recommends one, with the weights shown."

**Adaptive replanning (50 s, Home → My Goals).** Say "Actually, I want to start a business next year, and
my income may become irregular." Confirm. Read the replanning notice. Open My Goals: previous versus current
plan, what changed and why. "If the new information had not changed the best strategy, it would say so."

**Closing (10 s).** "Financial resilience isn't just about surviving uncertainty. It's about preserving the
freedom to pursue what matters."

## Official format (1 + 3 + 1)

- 1-minute pitch: opening sentence + discovery chart + "any account, any twist, plans in dollars and months".
- 3-minute twist: steps "Live account" and "Live shock" above, then one of: Explore Futures fan chart, or the
  companion goal → replan if the judge asks about personalization.
- 1-minute Q&A: likely questions and answers are in `docs/findings.md` (why reversals are rare), `docs/methodology.md`
  (EI assumption, medians, buffer window) and `docs/limitations.md`.

## Video (2–3 minutes)

Record the five-minute flow at 1.5× pace with the cursor visible; keep the first 30 seconds on the finding.
