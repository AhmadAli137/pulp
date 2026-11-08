# PULP consolidation and verification

Updated November 7, 2026. The active checkout is the repository root, with GitHub origin `AhmadAli137/pulp` and branch `master`. All ongoing changes belong here. The retired comparison checkout must not be edited or pushed. The historical Entire remote is not the publishing destination.

## Changes brought into this application

- Simulation records immediate funding failure before later monthly income and includes an initially negative balance in cumulative shortfall. Buffer percentile charts and minimum-buffer statistics still describe monthly boundaries; an intramonth upfront shortfall may occur between those plotted points.
- Strategy capacity is `max(0, inflow - spending + confirmed reduction)`, with reductions bounded by current spending. A reduction cannot fund savings until it covers an existing deficit.
- Non-emergency goals without a budget no longer receive an invented target. Contributions and completion claims wait for a target. Emergency targets use the selected stress, and the roadmap uses that same comparison.
- Legacy goal comparisons project through the goal deadline and disclose extensions through `requested_horizon_months`, `projection_note`, and the visible explanation. The future reviewed workflow requires an explicitly approved horizon instead.
- Stale context confirmation returns HTTP 409. Existing confirmation idempotency remains intact.
- Voice scenarios stay staged until explicit confirmation, display their stated values, and preserve unspecified inputs. Account and calculation request guards prevent older responses from replacing newer selections.
- The agent handbook now has one contract, runtime prompts, implementation guidance, team milestones, and validated synthetic examples. Older guide paths redirect to the canonical documents.

The TypeScript routes, mascot, Gemini relay, Vultr provider, Redis/file context support, and deployment remain in place. The separate intake and three-role ADK planning system is a blueprint, not shipped orchestration.

## Reproduced checks

| Check | Result |
|---|---|
| Backend suite | 84 passed; temporary context, no live AI or Redis |
| Production frontend | TypeScript and Vite build passed |
| Browser suite | 11 passed against isolated API on port 8002 |
| Handbook validator | Two synthetic fixtures, arithmetic, references, negative checks, and 26 local links passed |
| Full organizer export | 4,500 accounts, 185,326 monthly rows, 1,056,320 transactions |
| Transaction reconciliation | Zero-cent maximum inflow and outflow differences |
| Supplementary research | Recomputed longitudinal groups and inflow deciles; separate denominators from original research |

The deployment and full-export `monthly_summary.csv` files have identical SHA-256 hashes. See [data-validation.json](data-validation.json), [supplementary findings](pulp-findings.json), and the [root README](../README.md) for commands. The browser suite covers home navigation, accept/reload, decline, mobile layout, intro replay, chat failure, microphone denial, simulation, missing goal budget, invalid account, and voice proposal confirmation.

Live Gemini/Vultr calls and production deployment were not exercised by these offline regressions. Vite still reports a large JavaScript bundle. Redis support is preserved, but transactional multi-worker acceptance and authentication remain implementation requirements described in the handbook.

## Next colleague task

Start with the [post-intake implementation prompt](agents/IMPLEMENTATION_PROMPT.md) and [delivery milestones](agents/06-delivery.md). Implement explicit scenario contracts and a pure evaluator before connecting the Consultant, Advocate, and Challenger. Keep scenario approval, memory confirmation, and plan acceptance separate.
