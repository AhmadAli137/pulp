# Architecture

```
frontend (React 19 + Vite + TypeScript, Recharts, zustand)
  pages/      Overview · Twin · Explore (fan chart + branches + official calculator) · Goals (strategies, before/after)
              Roadmap · Insights (discovery + cohort) · Companion (chat, voice, proposals) · Settings
  components/ Layout (nav + account box), ShockPanel (twist controls, verdict, plans, show-the-math), ui
  charts/     cash flow, liquidity, fan, branches, vulnerability, strategy, replanning, quartile, pairs, cohort, goal
  stores/     useApp (account, shock inputs/results, context summary, last replan, accessibility)
  services/   api.ts (typed client, /api proxied to the backend)
  hooks/      useSpeech (browser SpeechRecognition + speechSynthesis)

backend (FastAPI + pandas + numpy + Pydantic)
  services/data_store.py          loads CSVs once; per-account slices; sample ids
  services/tangerine_metrics.py   official I S F H B P, shock, verdict, explanation, plans, tipping point  (pure)
  services/financial_profiles.py  per-account metrics + vectorised population table
  services/cohort_analysis.py     similar-customer comparison; findings.json loader + headline
  services/scenario_engine.py     deterministic + Monte Carlo projection, presets, branches
  services/strategy_optimizer.py  four explicit strategies under a context-shaped stress; weighted score
  services/context_manager.py     structured memory (JSON per account), proposals, confirmation, versions
  services/feedback_loop.py       replan, snapshot, diff with materiality rules
  services/gemini_agent.py        Gemini tools + validated extraction; offline engine; question heuristic
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
| POST | /api/replan · GET /api/replan/{id}/diff | replan on demand; last diff |

OpenAPI docs are served at `/docs`.
