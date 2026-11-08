
# PULP documentation

| Resource | Use it for |
|---|---|
| [Repository README](../README.md) | What PULP does, the workspace, how numbers and plans are computed, local setup, checks and credits |
| In-app developer docs (`/developers`) | Every API endpoint with examples, the agent flowchart, tech stack and infrastructure |
| [Agent contracts (v2)](agents/v2-contracts.md) | Personas, the profile log and undo, personal shocks, the Shock Dealer, the plan search and its objective, stream events |
| [Agent inventory](agents/README.md) | Which agents run today, what each one reads and writes, and what is still a proposal |
| [Stage 1 report](stage1-report.md) | Everything Stage 1 learns from the data, in plain language and in technical detail |
| [Findings](findings.md) | Research question, comparisons and denominators |
| [Methodology](methodology.md) | Sponsor formulas and the evidence behind scenario calculations |
| [Architecture](architecture.md) | Services, data flow and the conversation pipeline |
| [Limitations](limitations.md) | What the data and the engine cannot tell you |
| [Testing](testing.md) | Backend, browser and voice checks |
| [Tangerine challenge](tangerine-challenge.md) | Event requirements and supplied data dictionary |
| [Deployment](deployment.md) | Hosting, service health and recovery |
| [Demo walkthrough](../demo/demo-script.md) | Pitch, live twist and rehearsal account |

The dataset results and validation artifacts are in [findings.json](findings.json), [pulp-findings.json](pulp-findings.json) and [data-validation.json](data-validation.json). Regenerate the Stage 1 report with `python backend/scripts/build_stage1_report.py`.
