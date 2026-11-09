# Architecture

How PULP is put together, from the CSV files to the page in your browser. Reconciled with the code on November 9, 2026.
Start with the [README](../README.md) for what PULP does; this page is for people who want to change it.

**The rule everything follows:** agents interpret, code calculates. Models choose what to look at, what to ask and how to
say it. Every number shown comes from deterministic Python, and every model output that contains a number is checked
against the engine (or thrown away) before it reaches the screen.

---

## 1. The big picture

```mermaid
flowchart TB
    subgraph Browser["Browser · React 19 + TypeScript + Vite"]
        Pages["Pages: Overview, Shocks, My Plan, Insights,<br/>Profile, Tour, Agents, Report, Docs"]
        Panel["Pulp panel: chat, voice, saved chats,<br/>agent workflow column"]
        Stores["Zustand stores: useApp, view, agentFeed"]
        Local[("localStorage:<br/>account, view, saved chats")]
    end

    subgraph Server["FastAPI · one Docker image"]
        Routes["REST routes<br/>api/routes.py, reports.py,<br/>insights.py, decision.py"]
        SSE["Conversation stream<br/>GET /api/agent/stage"]
        Voice["Voice relay<br/>WS /api/agent/voice/{id}"]
        subgraph Services["services/"]
            Engine["Engine<br/>tangerine_metrics, scenario_engine"]
            Stage1["Stage 1<br/>features, hunter, archetypes,<br/>narrator, persona, discovery"]
            Stage2["Stage 2<br/>director, context_manager, intake"]
            Stage3["Stage 3<br/>shocks, shock_dealer, life_fit,<br/>life_planner, council"]
            Trace["Recording<br/>agent_trace, agent_runs"]
        end
    end

    Data[("data/*.csv<br/>data/derived/*")]
    Ctx[("storage/context/{id}.json<br/>profile, change log, plan history, runs")]
    Gemini["Gemini 3.5 Flash<br/>via Google ADK"]
    Live["Gemini 3.8 Live<br/>native audio"]

    Pages --> Routes
    Panel --> SSE
    Panel <--> Voice
    Stores --- Local
    Routes --> Services
    SSE --> Stage2
    Voice --> Stage2
    Stage2 --> Stage3
    Services --> Engine
    Stage1 --> Data
    Engine --> Data
    Stage2 --> Ctx
    Stage3 --> Ctx
    Trace --> Ctx
    Stage1 -.-> Gemini
    Stage2 -.-> Gemini
    Stage3 -.-> Gemini
    Voice <-.-> Live
```

Dotted lines are optional: with no `GEMINI_API_KEY`, every model role falls back to deterministic code and the trace
labels those turns as offline. The engine, the official numbers, the twist cards, the plan search and the tour need no
model at all.

---

## 2. Where the code lives

### Backend (`backend/app/`)

| Layer | Files (under `services/` unless noted) | Responsibility |
|---|---|---|
| HTTP | `api/routes.py`, `api/reports.py`, `api/insights.py`, `api/decision.py` | REST endpoints and the SSE conversation stream |
| Voice | `api/voice.py` | Gemini Live socket, audio relay, `conversation_turn` delegation |
| Engine | `tangerine_metrics.py`, `scenario_engine.py`, `financial_profiles.py` | The judges’ formulas, shock reports, reproducible projections |
| Records | `data_store.py`, `features.py`, `resilience_history.py` | Loading CSVs through explicit column roles, 79 behavioural signals, historical patterns and flags |
| Stage 1 | `hunter.py`, `archetypes.py`, `narrator.py`, `persona.py`, `persona_voice.py`, `goal_ideas.py`, `discovery.py`, `demographics.py`, `stage1_report.py` | Research findings, clusters, prose, the fictional persona, goal ideas, the biggest discovery |
| Stage 2 | `director.py`, `context_manager.py`, `intake.py`, `gemini_agent.py`, `explain.py` | Turn orchestration, the profile and its change log, extraction, plain explanations |
| Stage 3 | `stage3.py`, `shocks.py`, `shock_dealer.py`, `life_fit.py`, `life_planner.py`, `council.py`, `life_actions.py` | Hearing a shock, the personal deck, fit scoring, the plan search, the council |
| Recording | `agent_trace.py`, `agent_runs.py` | Stage traces and replayable runs (40 runs per account, 120 events each) |
| Other | `financial_overview.py`, `roadmap.py`, `strategy_optimizer.py`, `benefits.py`, `cohort_analysis.py`, `adk_runtime.py`, `vultr_inference.py` | Balances, next steps, goal strategies, the “What PULP gives you” summary, peers, model runtime |
| Config | `config.py` | Paths (`PULP_DATA_DIR`, `PULP_STORAGE_DIR`), model names, keys |

### Frontend (`frontend/src/`)

| Area | Files | Responsibility |
|---|---|---|
| Shell | `App.tsx`, `components/Layout.tsx`, `components/workspace.tsx`, `header.css`, `brand.css` | Routes, header (logo, account chip, Ask Pulp), four tabs, Behind the scenes link, footer, Simple and Full detail |
| Tabs | `pages/Overview.tsx`, `ShockLab.tsx`, `Plan.tsx`, `Insights.tsx`, `components/PageAnswer.tsx` | One question and one answer per tab, then the detail |
| Account | `pages/Profile.tsx`, `Twin.tsx`, `Goals.tsx`, `Roadmap.tsx`, `Briefings.tsx` | The person, balances, goals, next steps, briefings |
| Behind the scenes | `pages/Tour.tsx`, `components/tour/*`, `pages/Agents.tsx`, `components/agents/*`, `pages/Report.tsx`, `pages/Docs.tsx` | The guided tour, the agent runs, the Stage 1 report, the developer docs |
| Pulp | `components/pulp/PulpPanel.tsx`, `PulpLauncher.tsx`, `services/voice.ts` | Chat, voice, saved chats, the launcher with its expressions and hints |
| Visuals | `components/stage/*Visual.tsx`, `components/insights/JuiceCups.tsx`, `components/plans/*` | The pictures (juice glass, cushion bars, shuffle, cups, plan search) |
| State | `stores/useApp.ts`, `stores/view.ts`, `stores/agentFeed.ts` | Account and shock inputs, view mode, live agent activity |
| Client | `services/api.ts` | Typed API client and every response type |

---

## 3. Stage 1: from records to a person

Stage 1 runs before anyone says a word. The heavy parts run offline and are committed, so the server starts fast.

```mermaid
flowchart LR
    subgraph Offline["Offline, run by a developer"]
        TX[("transactions.csv<br/>about 1M rows")] --> BTX["scripts/build_tx_features.py"]
        BTX --> TXF[("data/derived/tx_features.csv")]
        RS["scripts/run_stage1.py"] --> ARC[("data/derived/archetypes.json")]
        RS --> HF[("data/derived/hunter_findings.json")]
    end
    subgraph Startup["When the API starts"]
        CSV[("data/*.csv")] --> FEAT["features.py<br/>79 signals × 4,500 accounts"]
        TXF --> FEAT
        FEAT --> FLAGS["resilience_history.py<br/>flags with evidence"]
        ARC --> ARCH["archetypes.py"]
        HF --> HUNT["hunter.py"]
    end
    subgraph PerAccount["Per account, on first request"]
        FLAGS --> NAR["narrator.py<br/>a few plain sentences"]
        ARCH --> PER["persona.py<br/>fictional person, goals, worries"]
        FEAT --> PER
        PER --> SEED["context_manager<br/>seeds the profile (logged)"]
        FLAGS --> DISC["discovery.py<br/>the biggest discovery"]
    end
```

- **Schema Scout** is a fixed map from this dataset’s columns to roles (`features.py`, `ROLES`). Automatic mapping for
  another bank’s export is not implemented.
- **Pattern Hunter** is an ADK agent with a budget of 24 exploration calls (recording a finding does not count) and tools (`list_features`, `describe`,
  `survival_by_quantile`, `correlation`, `compare_flag`, `crosstab_survival`, `record_finding`). It chooses the tests;
  the tools compute every number. Without a key, a deterministic battery runs instead.
- **Archetype Namer**: k-means with k = 6 and a fixed seed groups the accounts in code; the model only names them.
- **Persona Builder** builds the persona from code (sizes, weights, evidence) and, in the background, lets the model
  rewrite the words. A rewrite that adds a digit is rejected.

---

## 4. Stage 2: a conversation turn

Typed messages and voice share one function, `director.stage_stream`, so they can never disagree.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (Pulp panel)
    participant R as GET /api/agent/stage
    participant D as Director
    participant C as Companion and context_manager
    participant X as stage3.detect
    participant P as Life Planner
    participant E as Engine

    B->>R: message, account_id (EventSource)
    R->>D: stage_stream(...)
    D->>C: extract details from the message
    C->>C: apply_now: change the profile, log it (version + 1)
    C-->>B: event "profile" {changes, version, spoken}
    D->>X: is this a shock or a big decision?
    alt a shock was heard (for example "I might lose my job")
        X-->>D: layoff, r = 0.55, 6 months
        D->>P: run(mode = shock)
        P->>E: simulate the candidates
        P-->>B: event "lifeplans" {plans, search, objective}
    end
    D->>E: the numbers for the reply
    D-->>B: event "storyboard" {reply, beats, reply_source}
    D-->>B: events "agent", "handoff", "trace" (who did what)
    R-->>B: event "done"
```

**Stream events:** `agent`, `handoff`, `memory`, `trace`, `profile`, `lifeplans`, `storyboard`, `done`, `error`. The
voice relay forwards the same names inside `pipeline_event` messages.

**Commands the chat understands** (sent as the message text): `__intro__`, `explain:<topic>?…`,
`twist:random`, `twist:<card_key>`, `twist:<card_key>@<character_id>`, `decision:small`, `decision:big`.

### Voice

```mermaid
sequenceDiagram
    participant M as Mic and speaker (voice.ts)
    participant V as WS /api/agent/voice/{id}
    participant L as Gemini Live
    participant D as director.stage_stream

    M->>V: PCM audio frames, or {type: "text"}
    V->>L: relay audio (with the persona brief)
    L-->>V: transcript, audio
    V-->>M: transcript, audio
    L->>V: tool call conversation_turn(message)
    V->>D: the same turn as typing
    D-->>V: profile, lifeplans, storyboard
    V-->>M: pipeline_event (same names), walkthrough, visual
    V->>L: tool result (grounded numbers)
    L-->>M: spoken answer
```

Browser message types: `ready`, `transcript`, `turn_complete`, `walkthrough`, `visual`, `context_proposal`,
`pipeline_event`, `state_changed`, `status`, `error`, `closed`. A server restart drops a live call; reconnect from the mic.

---

## 5. The profile and its change log

The profile (goals, worries, constraints, preferences, upcoming events) lives in the account’s context document. Agents
change it directly; every change is an entry with who, what, before, after, why and the new version.

```mermaid
stateDiagram-v2
    [*] --> Seeded: Persona Builder seeds goals and worries (v2)
    Seeded --> Refined: background model rewrite (v3)
    Refined --> Talking
    Talking --> Talking: Companion applies a change (version + 1)
    Talking --> Undone: you say "no", or press Undo
    Undone --> Talking: an "undo" entry is logged (version + 1)
    Talking --> Replanned: plans rebuilt from the profile as it is now
    Replanned --> Talking
```

- `context_manager.apply_now(...)` applies and logs; `undo(change_id)` reverses one entry and logs the reversal.
- `POST /api/profile/{id}/undo/{change_id}` exposes undo to the History tab and the chat.
- Plans read the profile at run time, so weights move with what you said (a worry about your job moves weight toward
  the cushion).

---

## 6. Stage 3: from a shock to four plans

```mermaid
flowchart TD
    trig["A card is turned over, a shock is typed,<br/>or Pulp hears one"] --> inp["stage3.shock_inputs<br/>r, h, one-off, duration, start month"]
    inp --> cat["life_planner.catalog + life_fit.extra_decisions<br/>about 24 decisions for this account"]
    cat --> fit["life_fit.assess<br/>fit 0 to 1 with a reason per decision"]
    fit --> gen["life_planner.generate<br/>up to 320 combinations of 1 to 3 dated steps"]
    gen --> sim["life_planner.simulate<br/>month by month over the horizon"]
    sim --> scr["screens per rule<br/>poor fit, no loan, no transfer, too much change, ..."]
    scr --> par["_pareto over gap covered, cushion, goals"]
    par --> fin["finalists: best on each axis + best weighted score,<br/>kept distinct (decision overlap below 0.5)"]
    fin --> why["_plan_doc: why each step,<br/>measured by rerunning without it"]
    why --> cau["cautionary: up to 3 plans that still run short"]
    cau --> store["_store: plan_history in the context document"]
    store --> out["LifePlanResult with its own trace"]
```

The month-by-month simulation: spare money fills the cushion, then goals by weight; a gap drains the cushion, then goal
savings, then becomes shortfall. The objective is in the [README](../README.md#how-the-plans-are-chosen) and in
[agent contracts](agents/v2-contracts.md).

The older **council** (`council.py`, `POST /api/agent/plan`) still runs for the Shocks page: a deterministic grid,
optional Strategist proposals that code clamps and re-scores, an optional Challenger review of the scored set, then
ranking. Strategist and Challenger run in sequence, not in parallel.

---

## 7. What is stored where

| Store | Where | What | Lifetime |
|---|---|---|---|
| Source records | `data/*.csv` | The supplied tables | Read-only |
| Derived features | `data/derived/` | `features.csv`, `tx_features.csv`, `archetypes.json`, `hunter_findings.json` | Rebuilt by the scripts |
| Context document | `backend/app/storage/context/{id}.json` (`PULP_STORAGE_DIR`), or Redis REST | Profile, change log, conversation history, plan history, agent runs, persona doc | Until deleted (`DELETE /api/context/{id}`) |
| Saved chats | Browser `localStorage`: `pulp.chats.{id}` (index), `pulp.chat.{id}.{chatId}` | Up to 20 chats per account, visuals included, plan results trimmed | Until sign-out |
| Preferences | Browser `localStorage` | Loaded account, Simple or Full detail, mute, agents column | Until cleared |

### Saved chats in the browser

```mermaid
stateDiagram-v2
    [*] --> Opening: account loaded
    Opening --> Resumed: current chat used under 3 hours ago
    Opening --> Fresh: otherwise, a new chat with a greeting
    Fresh --> Saved: first message sent (added to "Your chats")
    Resumed --> Saved
    Saved --> Saved: every message (debounced save)
    Saved --> Fresh: New chat
    Saved --> Resumed: open an earlier chat from Your chats
    Saved --> [*]: sign out clears every chat
```

A single long thread saved by an earlier version is converted once into the first saved chat (“Earlier: …”).

---

## 8. Full API map

The in-app developer docs at `/developers` list request and response examples; FastAPI’s schema is at `/docs`.

| Area | Routes |
|---|---|
| Status | `GET /api/health`, `GET /api/agent/status`, `GET /api/accounts/sample` |
| Customer | `GET /api/customers/{id}`, `/history`, `/cohort`, `/insights`, `/overview`, `/briefing`, `/discovery`, `/benefits` |
| Demographics | `GET /api/insights/demographics/{id}` |
| Official numbers | `POST /api/shocks/calculate`, `POST /api/shocks/compare-purchase` |
| Scenarios | `POST /api/scenarios/simulate`, `GET /api/scenarios/branches/{id}` |
| Goals and steps | `POST /api/strategies/compare`, `GET /api/roadmap/{id}`, `POST /api/decisions/compare`, `POST /api/decision/interpret` |
| Research | `GET /api/research/summary`, `/archetypes`, `/hunter`, `/features`, `/validation`, `/pulp` |
| Conversation | `GET /api/agent/stage` (SSE), `WS /api/agent/voice/{id}`, `POST /api/agent/explain`, `POST /api/agent/chat` |
| Profile | `GET /api/profile/{id}`, `GET /api/profile/{id}/goal-ideas`, `POST /api/profile/{id}/goals`, `POST /api/profile/{id}/undo/{change_id}`, `POST /api/profile/{id}/rebuild` |
| Context | `GET/DELETE /api/context/{id}`, `POST /api/context/propose`, `/confirm`, `/edit` |
| Twist cards | `GET /api/agent/deck`, `POST /api/agent/shock-dealer`, `GET /api/agent/characters` |
| Plans | `POST /api/agent/life-plans`, `GET /api/plans/history/{id}`, `POST /api/agent/plan`, `GET /api/agent/session/{id}`, `POST /api/replan`, `GET /api/replan/{id}/diff` |
| Agents | `GET /api/agent/personas`, `GET /api/agents/trace/{id}`, `GET /api/agents/runs/{id}`, `GET /api/agents/runs/{id}/{run_id}`, `GET /api/agent/run` |
| Report | `GET /api/report/stage1` |

---

## 9. Hosting

```mermaid
flowchart LR
    gh["GitHub: push to master"] --> ci["Actions job 'test'<br/>pytest (formula, director, council,<br/>planning session), voice test, build"]
    ci --> cd["Actions job 'deploy'<br/>SSH to the Vultr host"]
    cd --> dc["docker compose up -d --build<br/>then wait for /api/health"]
    dc --> app["Container 'app'<br/>uvicorn, 1 worker, port 8000<br/>data mounted at /app/data"]
    app --> cad["Caddy<br/>automatic HTTPS"]
    cad --> web["askpulp.com"]
```

The image is built in two stages (Node builds the frontend, Python serves it with the API). It runs one worker, so
process-local locks are enough; this is not a distributed transaction. The public demo has no per-user authorization.
See [deployment](deployment.md) and [limitations](limitations.md).

---

## 10. Changing things safely

- **A new number:** add it to the engine and a test in `backend/tests/`; let agents only refer to it.
- **A new agent:** give it a contract in [agents/v2-contracts.md](agents/v2-contracts.md), a deterministic fallback,
  and a `trace` event so it shows up on the Agents page and in the tour.
- **A new page:** add it to `workspace.tsx` (a tab, an account page or a How it works page) so the heading, Simple view
  and footer work, and add a browser test that checks it fits a phone.
- **Before pushing:** run the four checks in [testing](testing.md). Every push to `master` deploys.
