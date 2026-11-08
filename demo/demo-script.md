# PULP demo: pitch, live twist and video

Judging is about 5 minutes: 1 minute of pitch, 3 minutes of live twist, 1 minute of questions. The demo video for
Devpost is 2 to 3 minutes. Open https://askpulp.com in one tab with the Pulp panel closed, and skip the intro.

## 1. Pitch (1 minute)

> "Most people find out how fragile their money is the day something goes wrong. PULP reads a customer's bank records
> and tells them, before it happens: how am I doing, what if life hits me, and what exactly should I do.
>
> Here's account 74916. In a typical month $12,406 comes in and $12,159 goes out. [Overview] PULP's biggest discovery:
> never negative, yet she fails a layoff. Spotless record, but six months on EI empties her cushion. A third of accounts
> share that blind spot.
>
> And that's our biggest finding across all 4,500 accounts: spending, not savings, decides who makes it. Grouped by
> cash on hand, survival stays between 57 and 73 percent with no trend. Grouped by how much of income goes back out, it
> falls from 99 to 25. And it holds
> up against what really happened: accounts our engine says fail a layoff later had their loan go bad three times as
> often."

## 2. Live twist (3 minutes)

1. **Load the judge's account** in the header. Read Overview's opening sentence: money in, money out, how many months
   the cushion lasts. Point at the biggest discovery.
2. **Shocks.** Flip the matching card (Laid off, The furnace dies, or Layoff and bills), or type the judge's exact
   numbers (income retained, bills change, one-time cost, months) and press **Run shock**.
3. **Read the verdict and the cushion chart:** "$X short every month, empty in month Y, $Z short by the end" (or "makes
   it with $X left"). The bars are the cushion at the end of each month; red below zero is the shortfall.
4. **The two official plans:** Prepare now (cash target, how long to save it) and If it happens (what to free up each
   month).
5. **What to do:** the best-balance plan under the plans section, as numbered steps with dates. "All four finalists
   are in My Plan. The agents tried about 300 and threw out the ones that don't fit this person's life."
6. **If there's time:** open Pulp, press **Talk**, and ask "what happens if I lose my job?". Turn on **Agents** to show
   the workflow beside the chat. Or press **Explain this** on the cushion chart.

Fallback: if anything is slow, every official number is on the Shocks page without AI. The agents label themselves
offline when no model runs.

## 3. Questions to expect

- **"Where do the numbers come from?"** The judges' definitions, implemented and tested (229 backend tests). No model
  produces a number; the agents only choose, ask and phrase.
- **"Is the finding real or simulated?"** The survival split is simulated with the official formula; the loan check is
  recorded outcomes (loan status in loans.csv), 14.3% against 4.8%.
- **"Who is Élise?"** A fictional person built to fit the anonymized records, labelled as such, so a short demo can
  start from a plausible life. Everything she "says" can be corrected or undone.
- **"What does a customer actually gain?"** Time (years of statements read in seconds), money (avoidable costs found in
  their own records and the shortfall a plan prevents), perspective (the blind spot) and control (four real plans,
  every change undoable).

## 4. Demo video (2 to 3 minutes), shot list

| Time | Shot | Say |
|---|---|---|
| 0:00 | Intro, then Overview for 74916 | The problem in one line; money in, out, cushion |
| 0:20 | Biggest discovery card | "Never negative, yet fails a layoff" |
| 0:35 | Shocks: flip "Laid off" | Verdict and cushion chart, both official plans |
| 1:05 | Shuffle the personal deck, deal a world event | "A deck dealt for her life" |
| 1:20 | My Plan: what to do first, the four plans | 300 plans tried, why each step |
| 1:50 | Pulp voice: "I might lose my job" with Agents on | Agents passing work, profile updated |
| 2:20 | Insights: spending versus savings cups, loan check | The finding, recorded against simulated |
| 2:45 | Agents page: replay a run | "Every agent step is recorded and replayable" |

## Rehearsal accounts

| Account | Why |
|---|---|
| 74916 | Élise, 58, shared rural household, cash wages; fails a layoff; Life Fit rules out demanding plans |
| 20111 | Borrower near 60 with uneven cash income; goes negative on timing, not shortage; CPP at 60 appears |
| 47788 | 21, urban, steady cash wage; thin margin |
| 88789 | Has lived through income drops before; holds a layoff |
