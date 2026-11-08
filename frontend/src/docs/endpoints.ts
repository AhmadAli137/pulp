/* Curated notes for the developer docs. The list of endpoints itself comes from openapi.json, the backend's own schema,
   snapshotted by backend/scripts/export_openapi.py. Examples below were captured from the running API (trimmed). */

export interface EndpointNote {
  /** One sentence on what the endpoint does. Falls back to the route's docstring when absent. */
  summary?: string
  request?: string
  response?: string
  /** Shown as a small note under the card. */
  note?: string
}

export interface Group { id: string; title: string; blurb: string; match: (path: string) => boolean }

export const GROUPS: Group[] = [
  { id: 'api-health', title: 'Health and service', blurb: 'Is the API up, which data and which models it is using.',
    match: (p) => p === '/' || p === '/api/health' || p === '/api/agent/status' },
  { id: 'api-accounts', title: 'Accounts and customers', blurb: 'The official numbers for one account and the records behind them.',
    match: (p) => p.startsWith('/api/accounts') || p.startsWith('/api/customers') },
  { id: 'api-shocks', title: 'Shocks and scenarios', blurb: 'The sponsor formula under a shock, Monte Carlo futures and strategy comparisons.',
    match: (p) => /^\/api\/(shocks|scenarios|strategies|decisions|decision|roadmap)\b/.test(p) },
  { id: 'api-agents', title: 'Agents and conversation', blurb: 'The conversation stream, the planning council, the twist deck and the Shock Dealer.',
    match: (p) => /^\/api\/agents?\//.test(p) && !p.startsWith('/api/agent/life-plans') },
  { id: 'api-profile', title: 'Profile and memory', blurb: 'The persona, the per-account context document and every change made to it.',
    match: (p) => p.startsWith('/api/profile') || p.startsWith('/api/context') },
  { id: 'api-plans', title: 'Plans', blurb: 'The Life Planner search, plan history and replanning.',
    match: (p) => p.startsWith('/api/agent/life-plans') || p.startsWith('/api/plans') || p.startsWith('/api/replan') },
  { id: 'api-research', title: 'Research and insights', blurb: 'Dataset-wide findings, archetypes, validation against loan outcomes, demographics.',
    match: (p) => p.startsWith('/api/research') || p.startsWith('/api/insights') },
  { id: 'api-reports', title: 'Reports', blurb: 'The Stage 1 report, deterministic and model-free.',
    match: (p) => p.startsWith('/api/report') },
]

const CALC_REQ = `curl -X POST https://askpulp.com/api/shocks/calculate \\
  -H "Content-Type: application/json" \\
  -d '{"account_id": 47788, "income_fraction": 0.55, "horizon_months": 6}'`

const CALC_RES = `{
  "account_id": 47788,
  "baseline": { "income_after": 11493.34, "spending_after": 10927.03, "monthly_gap": -566.31,
                "runway_label": "no shortfall (120+)", "runway_status": "no_shortfall" },
  "shocked":  { "inputs": { "I": 11493.34, "S": 10927.03, "H": 0.0, "B": 25792.11, "r": 0.55, "h": 0.0, "one_off": 0.0 },
                "income_after": 6321.33, "spending_after": 10927.03, "monthly_gap": 4605.69,
                "runway": 5.6, "runway_label": "5.6", "runway_status": "finite" },
  "verdict": { "horizon_months": 6, "survives": false, "months_covered": 5.6,
               "verdict": "Does not make it. Cash runs out after 5.6 months, 0.4 months short, a $1,842 shortfall." },
  "goal_plan": { "type": "goal", "title": "Before the shock: build t…" },
  "backup_plan": { … },
  "warnings": []
}`

const STAGE_REQ = `curl -N "https://askpulp.com/api/agent/stage?account_id=47788&message=twist:layoff&use_ai=false"`

const STAGE_RES = `event: handoff
data: {"t": 0.0, "from": "director", "to": "engine", "title": "Twist: Laid off",
       "items": ["You lose your job. EI pays 55% of your usual income for 6 months.", "income x0.55, 6 months"]}

event: handoff
data: {"t": 0.01, "from": "engine", "to": "ranker", "mode": "offline", "title": "Offline run: engine grid only", "items": [ … ]}

event: handoff
data: {"t": 0.01, "from": "ranker", "to": "director", "mode": "offline", "title": "Ranked 4 plans (offline)",
       "items": ["#1 trim spending 10.0% / P(shortfall) 48% / score 0.29", …]}

event: trace
data: {"t": 0.0, "stage": 3, "agent": "life_planner", "kind": "handoff", "title": "320 plans", "to": "engine"}

event: lifeplans
data: { …LifePlanResult… }

event: storyboard
data: {"opening": false, "source": "deck+council", "beats": [ … ], "card": { … },
       "reply": "Laid off. Money in falls to $6,321 against $10,927 out, so the cushion runs out after 5.6 months.",
       "reply_source": "template", "council_mode": "offline"}

event: done
data: {}`

const PLANS_REQ = `curl -X POST https://askpulp.com/api/agent/life-plans \\
  -H "Content-Type: application/json" \\
  -d '{"account_id": 47788, "income_fraction": 0.55, "shock_duration": 6}'`

const PLANS_RES = `{
  "account_id": 47788, "plan_mode": "shock", "shock_starts_in": 3, "horizon_months": 18,
  "objective": { "formula": "score = w_short x gap covered + w_res x cushion + w_goal x sum(goal weight x progress) - w_dis x disruption",
                 "weights": { "shortfall": 0.3, "resilience": 0.3, "goals": 0.3, "disruption": 0.1 }, "goal_weights": [ … ] },
  "search": { "generated": 320, "screened_out": 197, "feasible": 123, "pareto": 27, "finalists": 4,
              "screens": [ { "rule": "No running loan to refinance", "removed": 38 },
                           { "rule": "Extra hours at a job you have lost", "removed": 23 }, … ],
              "candidates": [ … ] },
  "plans": [ {
    "id": "c156", "role": "best_tradeoff", "role_label": "Best balance", "survives": true, "score": 0.547,
    "name": "Weekend job for a year + Trim day-to-day spending 20% + Set a December budget",
    "components": { "shortfall": 1.0, "resilience": 0.814, "goals": 0.2426, "disruption": 0.7 },
    "steps": [ { "month_start": 1, "month_end": 12, "decision": "second_job_12", "title": "Weekend job for a year",
                 "monthly_effect": 2068.8, "category": "income",
                 "detail": "About 10 hours a week of part-time work, roughly $2,069 a month after tax." }, … ],
    "reasoning": [ { "step": 1, "because": "A second income keeps money coming in if the main one stops.",
                     "evidence": "Money in is $11,493 a month, 1.5x the $7,892 average salary in your district",
                     "moves": "cushion +10 pts, goals +12 pts, end cash +$16,528" }, … ],
    "outcome": { "cash_path": [ … 19 points … ], "goal_paths": { … }, "shortfall_total": 0, … }
  }, … three more finalists … ],
  "cautionary": [ { "role": "falls_short", "fails_because": "Runs short in month 8, month 6 of the shock; …" } ],
  "recommended": "c156", "mode": "offline", "trace": [ … ], "elapsed_ms": 48
}`

const DEAL_REQ = `curl -X POST https://askpulp.com/api/agent/shock-dealer \\
  -H "Content-Type: application/json" \\
  -d '{"account_id": 47788, "slot": 4, "exclude_character": "landlord", "use_ai": false}'`

const DEAL_RES = `{
  "slot": 4,
  "character": { "id": "manager", "name": "The Manager", "role": "brings news about your job and hours" },
  "card": { "key": "p_layoff", "title": "Laid off", "r": 0.55, "h": 0.0, "duration": 6, "one_off": 0.0,
            "text": "Your job ends. EI pays 55% of your usual income, about $6,321 a month, for 6 months.",
            "category": "income", "likelihood": "high", "source": "shock_generator",
            "why_you": "Unemployment in your district rose from 0.29% to 0.43%; a layoff is the shock the brief tests first." },
  "reason": "The Manager brings it because unemployment in your district rose from 0.29% to 0.43%; …",
  "source": "local",
  "ms": 2
}`

const PROFILE_RES = `{
  "account_id": 47788, "version": 13, "refining": false,
  "persona": { "fictional": true, "display_name": "Leila Haddad", "age": 21, "life_stage": "Starting out",
               "occupation": { "label": "Cash-paid service or hospitality worker", "confidence": 0.55,
                               "evidence": "99% of money in is cash deposits, regular in 83% of months" },
               "goals": [ … ], "worries": [ … ], "questions": [ … ], "traits": [ … ], "like_others": { … } },
  "goals": [ { "id": "c72e7857", "label": "Move out", "size": "small", "horizon": "short", "importance": 3,
               "target_amount": 21854.05, "target_months": 12, "weight": 0.1644, "source": "conversation" }, … ],
  "log": [ { "id": "2a0c1fed12", "at": "2026-11-08T15:09:20+00:00", "version": 13, "agent": "companion",
             "kind": "undo", "field": "goals", "label": "Sailboat", "reason": "Undid: Sailboat", … }, … ],
  "context": { … }
}`

const TRACE_RES = `{
  "account_id": 47788,
  "stages": [
    { "stage": 1, "title": "From records to a person", "summary": "…", "events": [
        { "t": 0.0, "stage": 1, "agent": "schema_scout", "kind": "start", "title": "Reading the bank's tables" },
        { "t": 0.3, "stage": 1, "agent": "schema_scout", "kind": "tool_call", "title": "list_tables()" },
        { "t": 0.9, "stage": 1, "agent": "schema_scout", "kind": "tool_result", "title": "9 tables, 1,265,006 rows",
          "items": ["accounts.csv: 4,500 rows", "clients.csv: 5,369 rows", …] }, … 60 events ] },
    { "stage": 2, "title": "Getting to know you", "events": [ … 42 events ] },
    { "stage": 3, "title": "When life happens", "events": [ … 13 events ] }
  ]
}`

export const NOTES: Record<string, EndpointNote> = {
  'GET /': { summary: 'Serves the built web app on the single-server build, or a short JSON pointer when the frontend is not built.' },
  'GET /api/health': { summary: 'Liveness and configuration: account count, data folder, whether a model is configured, the context storage backend.',
    response: `{ "ok": true, "accounts": 4500, "gemini_configured": true, "gemini_model": "gemini-3.5-flash",
  "context_storage": "file", "council": true, "ai_provider": "gemini", "ai_label": "Gemini companion" }` },
  'GET /api/agent/status': { summary: 'Which text and live models are configured, with a notice when no key is set.' },
  'GET /api/accounts/sample': { summary: 'A handful of account ids to try, including a surplus account, a deficit account and a loan holder.' },
  'GET /api/customers/{account_id}': { summary: 'The official numbers for one account (I, S, F, H, B, P, baseline runway) with its district and population context.' },
  'GET /api/customers/{account_id}/history': { summary: 'Month-by-month money in and out, the inflow and outflow mix, and observed negative-balance days.' },
  'GET /api/customers/{account_id}/cohort': { summary: 'Matched peers with near-identical income and how they fared under the same shock.' },
  'GET /api/customers/{account_id}/overview': { summary: 'What the account owns and owes, with any balances the person added.' },
  'GET /api/customers/{account_id}/briefing': { summary: 'A daily or weekly briefing of the saved financial picture.' },
  'POST /api/shocks/calculate': { summary: 'The sponsor formula under a shock: income after, spending after, runway, verdict, the Prepare now plan and the If it happens plan.',
    request: CALC_REQ, response: CALC_RES, note: 'Every number on the Shocks page comes from this endpoint. No model is involved.' },
  'POST /api/shocks/compare-purchase': {},
  'POST /api/scenarios/simulate': { summary: 'Monte Carlo paths for a preset or custom scenario, optionally with a strategy applied.' },
  'GET /api/scenarios/branches/{account_id}': { summary: 'Several simulated futures for the account over a horizon, with their shortfall probabilities.' },
  'POST /api/strategies/compare': { summary: 'Compares strategies against the confirmed context with the Monte Carlo engine.' },
  'POST /api/decisions/compare': { summary: 'The same shock report as /api/shocks/calculate, with the one-off cost optionally given in months of spending.' },
  'POST /api/decision/interpret': { summary: 'Turns a sentence into a scenario proposal with Gemini; returns a manual-mode reply when no key is set.' },
  'GET /api/roadmap/{account_id}': { summary: 'Next steps for this week, this month and this year, from the official numbers and confirmed context.' },
  'GET /api/agent/stage': { summary: 'The conversation, as server-sent events. One request is one turn: typed text, a spoken turn relayed from voice, __intro__, decision:small|big or twist:<key>[@character].',
    request: STAGE_REQ, response: STAGE_RES,
    note: 'Event names: agent, handoff, memory, trace, profile, lifeplans, storyboard, done, error. The voice relay forwards agent, handoff, trace, profile and lifeplans as pipeline_event.' },
  'POST /api/agent/chat': { summary: 'The Companion alone: extracts goals, worries and constraints from a message and replies, without the Director.' },
  'GET /api/agent/run': {},
  'POST /api/agent/plan': {},
  'POST /api/agent/explain': {},
  'GET /api/agent/session/{account_id}': { summary: 'The current planning session: the last council result published for this account.' },
  'GET /api/agent/personas': { note: 'The Agents page and the flowchart on this page read their roster from here.' },
  'GET /api/agent/deck': {},
  'POST /api/agent/shock-dealer': { request: DEAL_REQ, response: DEAL_RES,
    note: 'The model picks IDs only. A slow or missing model falls back to a local draw (source: "local").' },
  'GET /api/agent/characters': { summary: 'The cast of characters the Shock Dealer can choose from, and the scenario categories each one fits.' },
  'GET /api/agents/trace/{account_id}': { summary: 'Everything the agents did for this account, by stage: Stage 1 distillation, Stage 2 profile updates, Stage 3 planning.',
    request: 'curl https://askpulp.com/api/agents/trace/47788', response: TRACE_RES },
  'GET /api/profile/{account_id}': { request: 'curl https://askpulp.com/api/profile/47788', response: PROFILE_RES },
  'POST /api/profile/{account_id}/undo/{change_id}': { summary: 'Reverts one logged change and records the undo in the log. Returns the updated profile.' },
  'POST /api/profile/{account_id}/rebuild': {},
  'GET /api/context/{account_id}': { summary: 'The raw context document for the account, its summary and the next question Pulp would ask.' },
  'DELETE /api/context/{account_id}': { summary: 'Deletes everything stored about the account: persona, goals, conversation and plans.' },
  'POST /api/context/propose': { summary: 'Stages changes to the context as a proposal (kept for explicit confirmation flows).' },
  'POST /api/context/confirm': { summary: 'Accepts or rejects a staged proposal.' },
  'POST /api/context/edit': { summary: 'The person edits their own context directly.' },
  'POST /api/agent/life-plans': { request: PLANS_REQ, response: PLANS_RES,
    note: 'mode "long_term" plans 60 months with no shock; the finalist roles become best_tradeoff, best_goals, best_resilience and least_disruption.' },
  'GET /api/plans/history/{account_id}': { summary: 'Every planner run for the account, newest first, with what changed since the previous run of the same kind.' },
  'POST /api/replan': { summary: 'Reruns the planning council after the context changed, with the reason recorded.' },
  'GET /api/replan/{account_id}/diff': { summary: 'What changed between the last two plans.' },
  'GET /api/research/summary': { summary: 'The dataset-wide findings: survival by quartile of buffer and of spending ratio, matched pairs.' },
  'GET /api/research/pulp': { summary: 'The committed research findings document.' },
  'GET /api/insights/demographics/{account_id}': { summary: 'Age, household and district insights for the account, with layoff survival by group.' },
  'GET /api/report/stage1': { summary: 'The Stage 1 report, plain-language and technical halves; with account_id, the account sections come first.' },
}

export const VOICE_MESSAGES: { type: string; dir: 'in' | 'out'; text: string }[] = [
  { type: 'audio', dir: 'in', text: 'Browser to server: base64 PCM, 16 kHz, mono, at most 64 KB per chunk.' },
  { type: 'ready', dir: 'out', text: 'The live session is open; carries the model and voice names.' },
  { type: 'audio', dir: 'out', text: 'Pulp speaking: base64 PCM from Gemini Live.' },
  { type: 'transcript', dir: 'out', text: 'role user or assistant, with the transcribed text.' },
  { type: 'turn_complete', dir: 'out', text: 'Gemini finished speaking for this turn.' },
  { type: 'status', dir: 'out', text: 'A short line for the UI, such as "Thinking it through...", or empty to clear it.' },
  { type: 'pipeline_event', dir: 'out', text: 'An agent, handoff, trace, profile or lifeplans event from the shared conversation turn.' },
  { type: 'visual', dir: 'out', text: 'One visual beat to show beside the conversation.' },
  { type: 'walkthrough', dir: 'out', text: 'Several visual beats in order.' },
  { type: 'context_proposal', dir: 'out', text: 'A staged proposal (legacy confirmation flow).' },
  { type: 'state_changed', dir: 'out', text: 'The turn changed stored state; refresh the profile and plans.' },
  { type: 'tool', dir: 'out', text: 'The result of the conversation_turn tool that Gemini Live called.' },
  { type: 'interrupted', dir: 'out', text: 'The person spoke over Pulp.' },
  { type: 'error', dir: 'out', text: 'The session failed; text and manual controls keep working.' },
]
