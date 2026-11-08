/* The shared live feed of agent activity. The Pulp panel writes it (typed turns over SSE, voice pipeline events);
   the panel's workflow column and the Agents page read it. Every entry is a TraceEvent, so one relay draws them all. */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { LifePlanResult, ProfileChange, StageAgentEvent, StageHandoffEvent, StageProfileEvent, TraceEvent } from '../services/api'
import { metaFor, splitAgents } from '../components/agents/AgentSymbol'

/** origin 'client' marks a step the panel inferred (e.g. from a profile event); a matching server trace replaces it. */
export interface FeedEvent extends TraceEvent { id: string; turn: number; at: number; origin?: 'client' }
export interface FeedTurn { turn: number; label: string; source: 'text' | 'voice'; startedAt: number; events: FeedEvent[]; plans?: LifePlanResult; profile?: ProfileChange[] }

const MAX_TURNS = 6
const ACTIVE_MS = 2500
const TOOL_WORDS: Record<string, string> = {
  calculate_shock: 'Run the shock', deal_or_set_shock: 'Set up the shock', get_profile: 'Read the numbers', get_financial_profile: 'Read the numbers',
  score_strategy: 'Score an idea', run_council: 'Ask the council', compare_strategies: 'Compare plans', get_insights: 'Read the profile',
  get_cohort: 'Find similar people', show_math: 'Write out the math', simulate: 'Simulate months', life_plans: 'Search plans',
}
export const toolWords = (tool: string) => TOOL_WORDS[tool] ?? tool.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())

interface FeedState {
  turns: FeedTurn[]
  lastActive: Record<string, number>
  seq: number
  /** Open a new turn; returns its number. */
  startTurn: (label: string, source?: 'text' | 'voice') => number
  /** Append a normalised event to a turn (the latest when omitted). */
  push: (ev: Omit<TraceEvent, 'stage' | 't'> & { t?: number; stage?: TraceEvent['stage']; origin?: 'client' }, turn?: number) => void
  pushAgent: (d: StageAgentEvent, turn?: number) => void
  pushHandoff: (d: StageHandoffEvent, turn?: number) => void
  pushTrace: (d: TraceEvent, turn?: number) => void
  pushProfile: (d: StageProfileEvent, turn?: number) => void
  pushPlans: (d: LifePlanResult, turn?: number) => void
  /** Route a voice pipeline_event or SSE event by name. */
  pushNamed: (event: string, data: unknown, turn?: number) => void
  reset: () => void
}

const stageOf = (agent: string): TraceEvent['stage'] => {
  const s = metaFor(splitAgents(agent)[0] ?? agent).stage
  return s === 0 ? 2 : s
}

export const useAgentFeed = create<FeedState>((set, get) => ({
  turns: [],
  lastActive: {},
  seq: 0,
  startTurn: (label, source = 'text') => {
    const turn = (get().turns.at(-1)?.turn ?? 0) + 1
    set((s) => ({ turns: [...s.turns, { turn, label, source, startedAt: Date.now(), events: [] }].slice(-MAX_TURNS) }))
    return turn
  },
  push: (ev, turn) => {
    let target = turn ?? get().turns.at(-1)?.turn
    if (target == null || !get().turns.some((t) => t.turn === target)) target = get().startTurn('Conversation')
    const now = Date.now()
    const seq = get().seq + 1
    // Use the event's own time when it has one; otherwise when it arrived, relative to the start of the turn.
    const owner = get().turns.find((t) => t.turn === target)
    const arrival = owner ? Math.max(0, (now - owner.startedAt) / 1000) : 0
    const t = typeof ev.t === 'number' && Number.isFinite(ev.t) && (ev.t > 0 || !owner?.events.length) ? ev.t : arrival
    const full: FeedEvent = { ...ev, t, stage: ev.stage ?? stageOf(ev.agent), id: `fe-${seq}`, turn: target, at: now }
    const keys = [...splitAgents(ev.agent), ...splitAgents(ev.to)]
    const same = (e: FeedEvent) => e.origin === 'client' && !full.origin && e.agent === full.agent && e.title === full.title && (e.to ?? '') === (full.to ?? '')
    set((s) => ({
      seq,
      turns: s.turns.map((t) => {
        if (t.turn !== target) return t
        const i = t.events.findIndex(same)
        return { ...t, events: i >= 0 ? t.events.map((e, j) => j === i ? { ...full, t: full.t || e.t } : e) : [...t.events, full] }
      }),
      lastActive: { ...s.lastActive, ...Object.fromEntries(keys.map((k) => [k, now])) },
    }))
  },
  pushAgent: (d, turn) => {
    const p = get().push
    if (d.kind === 'tool_call' && d.tool) p({ t: d.t, agent: d.agent, kind: 'tool_call', to: 'engine', title: toolWords(d.tool), data: d.args }, turn)
    else if (d.agent === 'engine' && d.summary) p({ t: d.t, agent: 'engine', kind: 'tool_result', title: d.summary }, turn)
    else if (d.kind === 'tool_result' && d.tool) p({ t: d.t, agent: d.agent, kind: 'tool_result', title: `Reads the result: ${toolWords(d.tool).toLowerCase()}`, data: d.summary ? { summary: d.summary } : undefined }, turn)
    else if (d.kind === 'text' && d.agent !== 'engine') p({ t: d.t, agent: d.agent, kind: 'output', title: 'Writes the answer' }, turn)
  },
  pushHandoff: (d, turn) => {
    // The council labels runs without a model: mode 'offline' on the handoff itself.
    const mode = (d as StageHandoffEvent & { mode?: string }).mode
    get().push({ t: d.t, agent: d.from, kind: 'handoff', to: d.to, title: d.title, items: d.items ?? [], data: mode ? { mode } : undefined }, turn)
  },
  pushTrace: (d, turn) => get().push(d, turn),
  pushProfile: (d, turn) => {
    const changes = d.changes ?? []
    const target = turn ?? get().turns.at(-1)?.turn
    const by = changes[0]?.agent || 'companion'
    get().push({ agent: by, kind: 'output', to: 'profile', origin: 'client', title: `Updated your profile (${changes.length} ${changes.length === 1 ? 'change' : 'changes'})`, items: changes.map((c) => `${c.label}: ${short(c.before)} → ${short(c.after)}`), data: { version: d.version } }, target)
    set((s) => ({ turns: s.turns.map((t) => t.turn === (target ?? s.turns.at(-1)?.turn) ? { ...t, profile: [...(t.profile ?? []), ...changes] } : t) }))
  },
  pushPlans: (d, turn) => {
    const target = turn ?? get().turns.at(-1)?.turn
    const t0 = get().turns.find((t) => t.turn === target)
    // The server streams trace events as they happen; replay the plan's own trace only when none arrived this turn.
    if (!t0?.events.some((e) => e.stage === 3 && e.agent !== 'director')) for (const e of d.trace ?? []) get().push(e, target)
    const s = d.search
    const now = get().turns.find((t) => t.turn === target)
    if (!now?.events.some((e) => /finalist/i.test(e.title))) get().push({ agent: 'validator', kind: 'handoff', to: 'director', title: `${d.plans.length} finalists`, items: d.plans.map((p) => `${p.role_label ?? p.name}: ${p.name}`), data: s ? { generated: s.generated, screened_out: s.screened_out, pareto: s.pareto, finalists: s.finalists } : undefined, stage: 3, origin: 'client' }, target)
    set((st) => ({ turns: st.turns.map((t) => t.turn === (target ?? st.turns.at(-1)?.turn) ? { ...t, plans: d } : t) }))
  },
  pushNamed: (event, data, turn) => {
    const g = get()
    try {
      if (event === 'agent') g.pushAgent(data as StageAgentEvent, turn)
      else if (event === 'handoff') g.pushHandoff(data as StageHandoffEvent, turn)
      else if (event === 'trace') g.pushTrace(data as TraceEvent, turn)
      else if (event === 'profile') g.pushProfile(data as StageProfileEvent, turn)
      else if (event === 'lifeplans') g.pushPlans(data as LifePlanResult, turn)
    } catch { /* a malformed event never breaks the conversation */ }
  },
  reset: () => set({ turns: [], lastActive: {} }),
}))

/** True when the council ran without a model this turn: the engine grid alone ranked the options. */
export function isOfflineTurn(turn: FeedTurn | null | undefined): boolean {
  return !!turn?.events.some((e) => e.data?.mode === 'offline' || /^offline run|agents unavailable|\(offline\)/i.test(e.title))
}
export function short(v: unknown): string {
  if (v == null || v === '') return 'nothing'
  if (typeof v === 'string') return v.length > 40 ? v.slice(0, 39) + '…' : v
  if (typeof v === 'number') return Math.abs(v) >= 1000 ? `$${Math.round(v).toLocaleString()}` : String(v)
  if (typeof v === 'object') { const o = v as Record<string, unknown>; return short(o.label ?? o.value ?? o.type ?? JSON.stringify(v)) }
  return String(v)
}

/** Agent keys that did something in the last 2.5 seconds; re-renders as they fade. */
export function useActiveAgents(): Set<string> {
  const lastActive = useAgentFeed((s) => s.lastActive)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const newest = Math.max(0, ...Object.values(lastActive))
    if (Date.now() - newest > ACTIVE_MS) return
    const id = window.setInterval(() => {
      const n = Date.now(); setNow(n)
      if (n - newest > ACTIVE_MS) clearInterval(id)
    }, 500)
    return () => clearInterval(id)
  }, [lastActive])
  return new Set(Object.entries(lastActive).filter(([, at]) => now - at <= ACTIVE_MS).map(([k]) => k))
}
