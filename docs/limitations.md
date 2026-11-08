# Limitations and unfinished work

## Data and personal context

The supplied records cover 2020-01 through 2025-12 for one anonymized banking dataset. They are not a live connection, proof of current affordability or identification of the person using the demo. Current income, essential commitments, accessible savings and life changes require confirmation.

Card and cash totals do not identify discretionary categories. A transfer does not establish its purpose, ownership or accessibility. Pension inflows do not establish employment or willingness to work. Archetype descriptions may include tentative occupation/life-stage guesses; these are displayed as guesses, not confirmed facts.

Official typical-month metrics smooth the whole history; the buffer is an average balance, not a verified uncommitted balance today. Decision profiles additionally report recent paired monthly room and observation periods. Those measurements answer different questions and should not be silently substituted for one another.

The app uses mapped CSV columns and optional offline transaction-derived artifacts. Automatic Schema Scout ingestion, arbitrary Excel schema interpretation, live bank synchronization and a continuously refreshed personal profile feed are not implemented.

## Questions and recommendations

Question selection is a heuristic based on missing context, relevance and repetition. New profile questions connect evidence to decisions, but there is no learned optimization or human outcome study showing they are the best possible questions.

A model can still misinterpret a short answer, select an unsuitable tool or omit a useful clarification. Structured extraction, numeric checks, proposal confirmation and deterministic tools reduce errors; they are not semantic proof that every statement is correct. The offline extractor is deliberately limited and may miss phrasing or misclassify an answer. Review proposals before confirming them.

The candidate grid and Strategist explore a bounded set of levers, not every possible life choice. A numerically strong candidate may be impractical. Options carry missing-context questions when spending flexibility or income capacity is unknown; modeled outcomes remain conditional even after those details are confirmed.

## Arithmetic and evidence

The 55% retained-income layoff preset is a challenge assumption, not a current eligibility or benefit calculation. It does not implement benefit caps, waiting periods or personal entitlement. Preset repair costs and durations are hypothetical scenarios, not personalized quotes.

Simulation bootstraps the account's recorded months and assumes the specified shock behavior. It cannot represent every future event or market condition. Model shortfall shares are not real-world probabilities. Deterministic monthly paths and fractional official runway differ at discrete boundaries; upfront shortfalls can happen before a month-end plotted point.

Population findings and matched-pair outcomes are conditional on the dataset, eligibility and selected stress. Association is not causation. District comparisons reflect the supplied data, not a live Canadian salary benchmark. Retain denominator and date labels when presenting findings.

## Voice and provider availability

The active home uses Gemini Live, microphone permission and a WebSocket-capable backend. Text-only mode is silent. Legacy browser-speech helpers are not the current voice fallback. No key, quota exhaustion, network failure or unavailable model can disable native voice. Offline calculations and limited typed fallback remain, but do not reproduce full model behavior.

Vultr's optional inference provider covers companion/extraction paths; it does not replace the native Gemini Live session or all ADK roles. Repository model names and older measured latencies are not guarantees of future provider availability. No fixed free-tier quota is assumed.

## Storage, privacy and operations

This is a public demo with selectable anonymized accounts, not a production personal-banking authorization system. Conversation history is retained separately from confirmed structured context; describing storage as only user-confirmed facts would be inaccurate. Saved state can include proposals, history, plan results and snapshots.

File storage and process-local locks assume a single worker. Optional Redis REST persistence does not provide atomic multi-worker confirmation. Authentication, per-user authorization, production retention controls and distributed transactions remain necessary before using this architecture for private customer accounts.

The frontend build currently emits a large-bundle warning. Desktop/mobile checks and regression tests are not a full accessibility or performance audit. Deployment has health checks but no automatic rollback.

## Not shipped

- Automatic Schema Scout or arbitrary spreadsheet import.
- The historical Consultant + Advocate + Challenger revision/acceptance protocol and its approval-receipt contracts.
- Live bank feeds, autonomous payments, transfers, trades or product applications.
- Reinforcement learning, independently validated personalized financial advice, or guaranteed optimal questions.
- A2UI/Rive migration; current visuals use the existing React/SVG/chart/motion stack.

See [the agent inventory](agents/README.md) for the distinction between runtime roles, deterministic components and proposed future roles.
