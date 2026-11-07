# Limitations

**Data.** The records are a static 2020–2025 snapshot of one anonymized bank (PKDD'99 Financial dataset
re-based by the track organizers into Canadian dollars). They do not label wages versus other inflows, do not
label discretionary spending, and carry no identity. PULP therefore never infers occupation, salary, net
worth, household size or veteran status, and never treats an account as belonging to the person speaking.

**Adapting historical banking data to present-day Canada.** District salaries, unemployment and rents in the
dataset are the bank's original regions; we do not use them in calculations. EI is applied as a flat 55%
replacement from the first month, without the weekly maximum, the waiting period or the 14–45 week duration.
The shock calculator states that cash flows are held constant through the horizon; a judge who wants a
different post-EI assumption must enter it explicitly. No CPI, CMHC or LFS values are used in computations.

**Official metrics.** Medians over the whole history smooth over trends; an account whose income recently
changed is represented by its typical month, not its latest. The buffer uses average daily balances, which can
include money that is spoken for. Accounts with zero median inflow (14) get a runway but are excluded from
cohort and discovery analyses.

**Discovery.** Matched-pair outcomes are simulated under the sponsor formula, not observed events. Greedy
adjacent pairing leaves a few accounts unmatched (10 at 5% tolerance) and could, in principle, be replaced by a
different deterministic matching; sensitivity runs show the conclusion does not depend on the tolerance.
Reversals are uncommon (about 3.5% of pairs); the headline is the population-level contrast between buffer size
and spending ratio, not the rare pairs.

**Simulation.** Monte Carlo paths bootstrap the account's own months, so an account with a short history has
few distinct months to draw from, and the bands understate possibilities the history never showed. Probabilities
are model outputs for a scenario the user chose, never real-world event probabilities.

**Strategies.** Capacity to save is the typical surplus plus any amount the user says they can free up; the
data cannot verify either. Scores depend on stated weights, which are shown. The four strategies are explicit
dollar rules, not an exhaustive search.

**Companion.** Without a Gemini key the companion uses keyword extraction, which is deliberately narrow and can
miss phrasing it does not recognise; it still proposes nothing it did not see. With Gemini, extraction is
schema-validated and retried, then falls back to the offline extractor. Browser speech recognition requires
Chrome or Edge and microphone permission; text always works. ElevenLabs is not integrated.

**Slow loop.** The bank data does not update, so the "financial adaptation" loop is demonstrated only through
explicit user input and simulated scenarios; nothing synchronizes with a live account.

**Not implemented.** Reinforcement learning, payment authorization, newsletters, transfers, product
applications and any autonomous financial action. The Gemini-native audio relay added separately under
`backend/app/api/voice.py` requires a key and was not validated by this build's tests.
