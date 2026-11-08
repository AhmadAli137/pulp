# Architecture

```
frontend (React 19 + Vite + TypeScript, Recharts, zustand)
  pages/      AgentHome (conversation and Pip) / ShockLab · Twin · Explore (fan chart + branches + official calculator) · Goals (strategies, before/after)
              Roadmap · Insights (discovery + cohort) · Companion (chat, voice, proposals) · Settings
  components/ Layout (nav + account box), ShockPanel (twist controls, verdict, plans, show-the-math), ui
  charts/     cash flow, liquidity, fan, branches, vulnerability, strategy, replanning, quartile, pairs, cohort, goal
  stores/     useApp (account, shock inputs/results, context summary, last replan, accessibility)
  services/   api.ts (typed client, /api proxied to the backend)
  services/   voice.ts (Gemini native PCM audio over backend WebSocket)
  hooks/      useSpeech (browser SpeechRecognition + speechSynthesis)

backend (FastAPI + pandas + numpy + Pydantic)
  services/data_store.py          loads CSVs once; per-account slices; sample ids
  services/tangerine_metrics.py   official I S F H B P, shock, verdict, explanation, plans, tipping point  (pure)
  services/financial_profiles.py  per-account metrics + vectorised population table
  services/cohort_analysis.py     similar-customer comparison; findings.json loader + headline
  services/scenario_engine.py     deterministic + Monte Carlo projection, presets, branches
  services/strategy_optimizer.py  four explicit strategies under a context-shaped stress; weighted score
  services/context_manager.py     structured memory (Redis/Upstash or local JSON per account), proposals, confirmation, versions
  services/feedback_loop.py       replan, snapshot, diff with materiality rules
  services/gemini_agent.py        Gemini/Vultr tools + validated extraction; offline engine; question heuristic
  services/council.py             Stage 3 council: fan-out grid + Google ADK Strategist/Challenger + validation; sync and streaming entry points
  services/explainer.py           scene script (habit, runway, two futures, lever) built in code; Explainer LlmAgent rewrites narration only
  services/director.py            the Director: owns the stage; deterministic storyboards for opening and twist cards, Director LlmAgent with engine tools for free text; captions number-checked
  services/features.py            Stage 1 Feature Forge: ~58 behavioural signals per account from semantic roles; rule-based flags with evidence
  services/archetypes.py          Stage 1: k-means archetypes described in numbers (code), named by Gemini on ADK (or rules)
  services/narrator.py            Stage 1 Profile Narrator: grounded sentences per account (ADK LlmAgent, template fallback, cached)
  services/hunter.py              Stage 1 Pattern Hunter: ADK hypothesis loop with statistical tools + deterministic battery
  services/adk_runtime.py         one way to run any ADK agent: session, message, state, tool log
  scripts/run_stage1.py           offline Stage 1 run -> data/derived/archetypes.json, hunter_findings.json (committed)
  services/roadmap.py             actions by timeframe
  api/routes.py                   REST endpoints; schemas/ Pydantic models
  scripts/analyze_population.py   reproducible discovery → docs/findings.json, docs/findings_chart.png
  storage/context/*.json          confirmed context per account (git-ignored)
```

## Request flow for the judge's twist

1. `GET /api/customers/{id}` returns the official metrics with "show the math" and population percentiles.
2. `POST /api/shocks/calculate` with r, h, C, T (or a preset) returns baseline and shocked results, the horizon
   verdict, the driver explanation, both plans and the tipping point. No AI involved.
3. The Explore screen calls `POST /api/scenarios/simulate` and `GET /api/scenarios/branches/{id}` for the
   Monte Carlo views; the official calculator stays visible underneath and is never altered by simulation.

## The closed loop

```
message ─▶ /api/agent/chat ─▶ (Gemini with tools | offline extractor) ─▶ proposal (pending)
confirm ─▶ /api/context/confirm ─▶ context_manager.apply (version +1) ─▶ feedback_loop.replan
        ─▶ strategy_optimizer.compare (stress shaped by concerns, weights by preferences)
        ─▶ snapshot stored ─▶ diff vs previous ─▶ UI: companion notice + Goals before/after + roadmap
```

Everything authoritative is deterministic Python; the model only converses, interprets and proposes.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | status, account count, Gemini configured |
| GET | /api/accounts/sample | sample ids with tags |
| GET | /api/customers/{id} | official profile |
| GET | /api/customers/{id}/history | monthly rows, mixes, observed distress |
| GET | /api/customers/{id}/cohort | similar-customer comparison |
| GET | /api/research/summary | discovery findings + headline |
| POST | /api/shocks/calculate | official shock, verdict, plans |
| POST | /api/scenarios/simulate | Monte Carlo + deterministic + baseline |
| GET | /api/scenarios/branches/{id} | five branching futures |
| POST | /api/strategies/compare | strategy comparison under context |
| GET | /api/roadmap/{id} | actions by timeframe |
| GET/DELETE | /api/context/{id} | read / delete context |
| POST | /api/context/propose, /confirm, /edit | staged updates, confirmation (+ replan), direct edits |
| POST | /api/agent/chat | companion turn |
| POST | /api/agent/plan | Stage 3 council: fan-out grid, Strategist + Challenger on Google ADK, validated ranking |
| GET | /api/customers/{id}/insights | Stage 1 profile: flags with evidence, archetype, narrator sentences |
| GET | /api/agent/run | server-sent events: insight, council stages and live agent events, plan, scenes, done |
| GET | /api/agent/stage | the stage: one turn (opening, twist card, or free text) as agent events, memory and a storyboard of beats |
| GET | /api/agent/deck | the twist deck of realistic Canadian shocks |
| POST | /api/agent/explain | council plus Explainer scene script in one response |
| GET | /api/research/archetypes | archetype clusters with statistics and names |
| GET | /api/research/hunter | Pattern Hunter findings (ADK run) or the deterministic battery |
| GET | /api/research/features?feature= | layoff survival by quantile of any feature |
| POST | /api/replan · GET /api/replan/{id}/diff | replan on demand; last diff |

OpenAPI docs are served at `/docs`.


## Stage 1: inferred profiles (Google ADK for the model roles)

```
CSVs ─▶ features.build_feature_table (roles → ~58 signals, flags)      code, ~15 s, cached
     ─▶ archetypes.cluster_accounts (k-means) ─▶ describe_clusters      code
     ─▶ LlmAgent archetype_namer (Gemini, output_schema)                 names, life-stage/occupation guesses with confidence
     ─▶ LlmAgent pattern_hunter (Gemini, 7 statistical tools, budget)   findings that clear n>=100 and >=10 pp / |rho|>=0.2
     ─▶ per account on load: LlmAgent profile_narrator (Gemini)          3-4 sentences, each tied to a flag key, else template
```

The model never sees raw rows: it receives cluster medians, tool results and flag evidence strings. `scripts/run_stage1.py`
runs the batch offline and commits the artefacts; the API serves them and recomputes the deterministic parts when they
are missing.

## The stage and the Director (Google ADK)

The home screen is a stage: one visual at a time, Pip narrating, a beat timeline, the input below. `director.py` decides
what to show for each turn and streams it over `GET /api/agent/stage`:

```
__intro__  ─▶ opening storyboard (code): picture → river/cup/calendar/ribbon per flag → crowd → ask
twist:<key>─▶ deal a card from SHOCK_DECK → council (its agent events stream live) → shuffle/cards → timeline → swarm → podium → dial → fork → math → ask
free text  ─▶ memory (offline extraction, proposals) + Director LlmAgent with tools (get_profile, get_cohort, deal_or_set_shock,
              run_council[with_agents], show_math) → beats: visual + source + caption; params attached by code; captions number-checked
```

Visual vocabulary: picture, cup, river, timeline, fork, calendar, dial, crowd, ribbon, cards, shuffle, swarm, podium, math, none.

## Planning council (Google ADK)

`services/council.py` implements the Stage 3 council described in the [agent handbook](agents/README.md):

```
POST /api/agent/plan ─▶ freeze_request (metrics, shock, goal, weights, confirmed context)
                     ─▶ fan_out: grid of levers scored by scenario_engine.simulate (code)
                     ─▶ ADK ParallelAgent "pulp_council"
                           ├─ LlmAgent strategist (Gemini, tool score_strategy → engine)
                           └─ LlmAgent challenger (Gemini, no tools)
                     ─▶ validation: clamp + re-score every Strategist lever, attach Challenger flags
                     ─▶ deterministic ranking (objective shown in the response)
```

Without the ADK or a Gemini key the route still answers with the grid (`mode: offline`). The intake companion stays on
the existing `/api/agent/chat` and voice relay; the full three-stage design is in the handbook.

See [consolidation notes](consolidation.md) for financial edge cases, browser isolation, and data verification. Local context files are a single-worker prototype; Redis persistence alone does not provide atomic version-checked updates across workers.
