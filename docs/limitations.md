# Limitations and unfinished work

## Data and personal context

The supplied records cover one anonymized banking dataset, with monthly records from 2020-01 through 2025-12 (see
[data/README.md](../data/README.md)). They are not a live connection, proof of current affordability or identification
of the person using the demo. Current income, essential commitments, accessible savings and life changes need the
person's own confirmation.

Card and cash totals do not identify discretionary categories. A transfer does not establish its purpose, ownership or
accessibility. Pension inflows do not establish employment or willingness to work.

Personas are fictional. The Persona Builder's occupation, household and life-stage lines are guesses from the records,
shown with a confidence and their evidence; they are not facts about anyone. Persona names and wording can change when a
profile is rebuilt.

Official typical-month metrics smooth the whole history; the buffer is an average balance, not a verified uncommitted
balance today. Decision profiles also report recent paired monthly room and observation periods. Those measurements
answer different questions and should not be silently swapped for one another.

The app uses mapped CSV columns and optional offline transaction-derived artefacts. Automatic Schema Scout ingestion,
arbitrary Excel schema interpretation, live bank synchronization and a continuously refreshed personal profile feed are
not implemented.

## Questions and recommendations

Question selection is a heuristic based on missing context, relevance and repetition. Profile questions connect
evidence to decisions, but there is no learned optimization or human outcome study showing they are the best possible
questions.

A model can still misread a short answer, pick an unsuitable tool or skip a useful clarification. In the conversation,
personal details are applied to the profile directly and logged; the person can undo each change, or say "no" right
after. Structured extraction, numeric checks and deterministic tools reduce errors; they are not proof that every
statement is right. The offline extractor is deliberately limited and may miss phrasing or misclassify an answer.

The candidate grid, the Strategist and the Life Planner explore a bounded set of levers, not every possible life choice.
The Life Planner builds about 300 plans per run from a fixed decision catalog. Its decision effects (a weekend job at
about 18% of income, a cheaper move saving a quarter of bills, and so on) are stated assumptions, not estimates from the
data. Life Fit scores are rules, not measurements of a person's real capacity. A numerically strong plan may still be
impractical; modeled outcomes stay conditional even after details are confirmed.

## Arithmetic and evidence

The 55% retained-income layoff preset is a challenge assumption, not a current eligibility or benefit calculation. It
does not model benefit caps, waiting periods or personal entitlement. Preset repair costs and durations are
hypothetical scenarios, not personalized quotes.

Simulation bootstraps the account's recorded months and assumes the specified shock behavior. It cannot represent every
future event or market condition. Model shortfall shares are not real-world probabilities. Deterministic monthly paths
and fractional official runway differ at month boundaries; upfront shortfalls can happen before a month-end plotted
point.

Population findings and matched-pair outcomes are conditional on the dataset, eligibility and the chosen stress.
Association is not causation. District comparisons reflect the supplied data (Czech source geography), not a live
Canadian salary benchmark. Keep denominator and date labels when presenting findings.

## Voice, chat and provider availability

Voice uses Gemini Live, microphone permission and a WebSocket-capable backend. Text-only mode is silent. Legacy
browser-speech helpers are not the voice fallback. No key, quota exhaustion, network failure or an unavailable model
disables native voice. Offline calculations and limited typed fallback remain, but do not reproduce full model
behavior.

Saved chats live in the browser's `localStorage`, per account: up to 20 chats, each trimmed to its last 60 messages.
They do not follow the person to another browser or device, are lost if site data is cleared, and are removed on
sign-out. Pulp's profile memory is on the server and is separate from these chat transcripts.

Vultr's optional inference provider covers the companion and extraction paths; it does not replace the native Gemini
Live session or all ADK roles. Repository model names and older measured latencies are not guarantees of future
provider availability. No fixed free-tier quota is assumed.

## The guided tour

The tour at `/tour` shows only what was recorded or computed for the loaded account. A step whose source is missing
(no profile changes yet, say) is left out rather than invented; chapter 2 shows at most the four latest changes. If the
records cannot be loaded at all, the tour says which part failed. Opening the tour runs one real plan search
(`POST /api/agent/life-plans`, layoff at 55% for 6 months, no model), which is recorded as an agent run and added to the
account's plan history. Its Simple view pictures are illustrations of those counts, not separate data.

## Storage, privacy and operations

This is a public demo with selectable anonymized accounts, not a production personal-banking authorization system.
Anyone can load any demo account. Conversation history is kept separately from confirmed structured context;
describing storage as only user-confirmed facts would be wrong. Saved state can include proposals, history, plan
results and snapshots.

File storage and process-local locks assume a single worker. Optional Redis REST persistence does not give atomic
multi-worker confirmation. Authentication, per-user authorization, production retention controls and distributed
transactions are still needed before using this architecture for private customer accounts.

The frontend build still emits a large-bundle warning (the main chunk is about 1 MB before gzip). Desktop and phone
checks and regression tests are not a full accessibility or performance audit. Deployment has health checks but no
automatic rollback. CI runs only part of the test suite (see [testing](testing.md)).

## Not shipped

- Automatic Schema Scout or arbitrary spreadsheet import.
- The historical Consultant + Advocate + Challenger revision and acceptance protocol and its approval-receipt
  contracts.
- Live bank feeds, autonomous payments, transfers, trades or product applications.
- Reinforcement learning, independently validated personalized financial advice, or guaranteed optimal questions.
- Notifications, email or any automatic delivery of briefings.
- A2UI or Rive; visuals use the existing React, SVG, chart and motion stack.

See [the agent inventory](agents/README.md) for the difference between runtime roles, deterministic components and
proposed future roles.

## Loan purpose

Loan-purpose hypotheses use coarse monthly patterns and heuristic thresholds, not calibrated probabilities. Loan
proceeds and purchase funding cannot be traced from those totals; original principal is not outstanding debt, and
historical status is not a current payment assessment. A confirmed purpose improves questions but does not fill in
rates, current balances, settlement rules or verified affordability.
