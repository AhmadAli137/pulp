# Documentation map

Current implementation documentation was reconciled with the repository on November 8, 2026. Source code, executable schemas and tests define runtime behavior; historical proposals do not override them.

## Start here

| Document | Use it for |
|---|---|
| [Repository README](../README.md) | Product overview, quick start and verification commands |
| [Product and design](product.md) | Page map, conversation behavior, visual language and feature connections |
| [Architecture](architecture.md) | Data, voice, intake, council, persistence and API boundaries |
| [Agent inventory](agents/README.md) | Which roles exist and which proposal features remain unimplemented |
| [Methodology](methodology.md) | Official arithmetic, simulation, decision profiles and evidence limits |
| [Deployment](deployment.md) | Vultr, domains, native SSH workflow, health checks and recovery |
| [Testing](testing.md) | Local suites, actual CI coverage and safe test isolation |
| [Limitations](limitations.md) | Data, model, inference, privacy and operational boundaries |
| [Integrations](sponsor-integrations.md) | What each provider and hosting component actually supplies |
| [Implementation history](consolidation.md) | Major changes and dated verification checkpoints |

## Demonstration and research

- [Demo script](../demo/demo-script.md) and [judging map](judging.md): current screen names and truthful demonstration flow.
- [Devpost draft](../submissions/devpost-writeup.md): local submission copy, not evidence that an external submission was updated.
- [Findings](findings.md), [research JSON](findings.json), [supplementary findings](pulp-findings.json), and [data validation](data-validation.json): preserved research artifacts with their own populations and assumptions.
- [Event brief](event-brief.md) and [Tangerine challenge/data dictionary](tangerine-challenge.md): organizer-source reference material, not a current product manual.

## Historical proposals

The numbered [agent blueprint documents](agents/README.md#historical-proposal-package) and files in [prompts](../prompts/intake-voice-agent-prompt.md) describe a separate proposed reviewed-planning protocol. Their synthetic example contracts are not current REST response schemas. Keep this distinction when planning further work.
