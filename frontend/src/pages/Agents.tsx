/* The Agents page, in layers. The first screen reads in twenty seconds: one sentence and three stage cards (who works,
   what goes in, what comes out, one number for this account). Opening a card shows that stage's relay with only its key
   steps, and for Stage 3 the plan search as the hero. Everything else (every step, payloads, Technical mode, the full
   roster with guardrails) sits in one "For the technically curious" section at the bottom. Stage traces come from
   GET /api/agents/trace/{id}; until that answers, a labelled sample built from this account's own numbers is shown. */
import { Component, Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { ChevronDown, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import AgentRelay from '../components/agents/AgentRelay'
import AgentSymbol, { STAGE_COLOR, agentKey, metaFor, type Stage } from '../components/agents/AgentSymbol'
import SearchFunnel from '../components/agents/SearchFunnel'
import { ROSTER, mockLifePlans, mockTrace } from '../components/agents/fixtures'
import { api, type AgentTrace, type LifePlan, type LifePlanResult, type Persona, type PlanSearch, type ProfileChange, type TraceEvent } from '../services/api'
import { useApp } from '../stores/useApp'
import { short, useActiveAgents, useAgentFeed } from '../stores/agentFeed'
import '../components/agents/agents.css'

type SearchViewProps = { search: PlanSearch; plans: LifePlan[]; animate?: boolean }
const searchModules = import.meta.glob<{ default: ComponentType<SearchViewProps> }>('../components/plans/PlanSearchView.tsx')
const searchLoader = Object.values(searchModules)[0]
const PlanSearchView = searchLoader ? lazy(searchLoader) : null
class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

type N = 1 | 2 | 3
const COLUMNS: Record<N, string[][]> = {
  1: [['data'], ['schema_scout'], ['feature_forge'], ['pattern_hunter', 'archetype_namer'], ['narrator'], ['persona_builder'], ['shock_generator', 'profile']],
  2: [['you'], ['companion'], ['profile', 'director'], ['engine'], ['stage']],
  3: [['you', 'companion'], ['shock_dealer', 'shock_generator', 'strategist'], ['life_fit', 'life_planner', 'engine'], ['validator'], ['challenger', 'director'], ['stage']],
}
const STAGES: Record<N, { title: string; flow: string; cast: string[]; roster: string[]; more: string }> = {
  1: {
    title: 'From records to a person', cast: ['schema_scout', 'feature_forge', 'pattern_hunter', 'persona_builder'],
    flow: 'Bank records in, a fictional person with goals and worries out.',
    roster: ['schema_scout', 'feature_forge', 'pattern_hunter', 'archetype_namer', 'narrator', 'persona_builder'],
    more: 'Before you say a word, eight anonymized bank tables are surveyed, measured and read for patterns, then turned into a short story and a realistic but fictional life, so Pulp asks the right questions from the first message. Think of a press: raw records go in, each agent presses out something more useful, and insight comes out.',
  },
  2: {
    title: 'Getting to know you', cast: ['you', 'companion', 'director', 'engine'],
    flow: 'What you say in, an updated profile out, logged and undoable.',
    roster: ['companion', 'director'],
    more: 'As you talk, the Companion updates your profile directly. Each change is logged with who made it and why, and can be undone. The Director then decides what to show, asking the Engine for every number.',
  },
  3: {
    title: 'When life happens', cast: ['shock_dealer', 'life_fit', 'life_planner', 'validator', 'challenger'],
    flow: 'A shock or a decision in, four plans that fit your life out.',
    roster: ['shock_generator', 'shock_dealer', 'life_fit', 'strategist', 'life_planner', 'validator', 'challenger'],
    more: 'Mention a shock or a big decision and Stage 3 starts on its own: a shock is dealt, every decision is checked against your age, time and household, hundreds of multi-step plans are simulated month by month, infeasible ones are screened out, and four distinct finalists are argued for.',
  },
}
const DEFAULT_SHOCK = { income_fraction: 0.55, bills_increase: 0, one_off_cost: 0, shock_duration: 6 }

function useNarrow() {
  const q = '(max-width: 700px)'
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const m = matchMedia(q); const on = () => setNarrow(m.matches)
    m.addEventListener('change', on); return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

/** The number in the last event title matching the pattern (e.g. "78 signals"): later steps refine earlier ones. */
function countFrom(events: TraceEvent[], re: RegExp): number | null {
  for (let i = events.length - 1; i >= 0; i--) { const m = events[i].title.match(re); if (m) return Number(m[1]) }
  return null
}

export default function Agents() {
  const accountId = useApp((s) => s.accountId)
  const profile = useApp((s) => s.profile)
  const openPulp = useApp((s) => s.openPulp)
  const turns = useAgentFeed((s) => s.turns)
  const active = useActiveAgents()
  const narrow = useNarrow()
  const [livePersonas, setLivePersonas] = useState<Persona[]>([])
  const [trace, setTrace] = useState<{ data: AgentTrace; live: boolean } | null>(null)
  const [fetchedPlans, setFetchedPlans] = useState<{ data: LifePlanResult; live: boolean } | null>(null)
  const [log, setLog] = useState<ProfileChange[] | null>(null)
  const [open, setOpen] = useState<N>(1)
  const [mode, setMode] = useState<'plain' | 'technical'>('plain')
  const [curious, setCurious] = useState(false)

  useEffect(() => { api.personas().then((r) => setLivePersonas(r.personas)).catch(() => undefined) }, [])

  // Live trace, else a labelled sample; keep checking every 20 s until the live one answers.
  useEffect(() => {
    if (!accountId) return
    let stop = false, timer = 0
    setTrace(null); setFetchedPlans(null); setLog(null)
    const load = () => {
      api.agentTrace(accountId).then((t) => { if (!stop && t?.stages?.length) setTrace({ data: t, live: true }); else throw new Error('empty') })
        .catch(() => { if (stop) return; setTrace((cur) => cur?.live ? cur : { data: mockTrace(accountId, useApp.getState().profile), live: false }); timer = window.setTimeout(load, 20000) })
    }
    load()
    api.lifeProfile(accountId).then((d) => { if (!stop) setLog(d.log) }).catch(() => undefined)
    return () => { stop = true; clearTimeout(timer) }
  }, [accountId])

  // Plans for the Stage 3 search: the latest from the conversation, else a fresh run with a default layoff.
  const feedPlans = useMemo(() => [...turns].reverse().find((t) => t.plans)?.plans ?? null, [turns])
  useEffect(() => {
    if (!accountId || feedPlans) return
    let stop = false
    api.lifePlans({ account_id: accountId, ...DEFAULT_SHOCK, use_ai: false })
      .then((r) => { if (!stop && r?.plans) setFetchedPlans({ data: r, live: true }); else throw new Error('empty') })
      .catch(() => { if (!stop) setFetchedPlans({ data: mockLifePlans(accountId, useApp.getState().profile), live: false }) })
    return () => { stop = true }
  }, [accountId, feedPlans])

  // Rebuild the sample once the profile arrives so its numbers are this account's.
  useEffect(() => {
    if (!accountId || !profile) return
    setTrace((cur) => cur && !cur.live ? { data: mockTrace(accountId, profile), live: false } : cur)
    setFetchedPlans((cur) => cur && !cur.live ? { data: mockLifePlans(accountId, profile), live: false } : cur)
  }, [accountId, profile])

  const personas = useMemo(() => {
    const byKey = new Map(livePersonas.map((p) => [agentKey(p.key), p]))
    const merged = ROSTER.map((r) => { const l = byKey.get(r.key); return l ? { ...r, ...l, stage: l.stage ?? r.stage, symbol: l.symbol || r.symbol, analogy: l.analogy || r.analogy } : r })
    for (const [k, p] of byKey) if (!merged.some((m) => m.key === k)) merged.push(p)
    return merged
  }, [livePersonas])

  if (!accountId) return <DemoAccountPicker />

  const plans = feedPlans ?? fetchedPlans?.data ?? null
  const plansLive = !!feedPlans || !!fetchedPlans?.live
  const latest = [...turns].reverse().find((t) => t.events.length)
  const changes = log?.filter((c) => c.kind !== 'seed').slice(-3).reverse() ?? turns.flatMap((t) => t.profile ?? []).slice(-3).reverse()
  const nChanges = log ? log.filter((c) => c.kind !== 'seed').length : null
  const stages = trace?.data.stages ?? []
  const byN = (n: N) => stages.find((s) => s.stage === n)
  const s1 = byN(1)?.events ?? []
  const headline: Record<N, string> = {
    1: [
      countFrom(s1, /(\d+)\s+signals/i) != null ? `${countFrom(s1, /(\d+)\s+signals/i)} signals` : null,
      countFrom(s1, /(\d+)\s+(?:archetypes|groups)/i) != null ? `${countFrom(s1, /(\d+)\s+(?:archetypes|groups)/i)} groups` : null,
      countFrom(s1, /(\d+)\s+goals?/i) != null ? `${countFrom(s1, /(\d+)\s+goals?/i)} goals` : null,
    ].filter(Boolean).join(' · ') || `${s1.length} steps`,
    2: nChanges != null ? `${nChanges} profile ${nChanges === 1 ? 'change' : 'changes'} so far` : `${byN(2)?.events.length ?? 0} steps`,
    3: plans?.search ? `${plans.search.generated} plans → ${plans.plans.length} finalists` : `${byN(3)?.events.length ?? 0} steps`,
  }
  const st = byN(open)
  const copy = STAGES[open]

  return (
    <div className="agents-page simple">
      <section className="ag-intro" aria-label="How the agents work">
        <p>A team of agents turns your bank records into a picture of you, listens as you talk, and plans for what life throws at you. <strong>AI agents read and decide; code does every calculation.</strong></p>
        <div className="ag-intro-actions">
          <button type="button" className="agents-try" onClick={() => openPulp('__intro__')}><MessageCircle size={15} />Try it: open Pulp</button>
          {trace && !trace.live && <span className="agents-sample" title="The live trace endpoint has not answered yet; this sample uses this account's engine numbers.">Sample · switches to live automatically</span>}
        </div>
      </section>

      {active.size > 0 && latest && (
        <section className="ag-live" aria-label="Live agent activity">
          <strong>Working now</strong>
          <span className="ag-live-chips">{[...active].map((k) => <span key={k} className="agent-chip on"><AgentSymbol agent={k} size={20} personas={personas} active />{metaFor(k, personas).name}</span>)}</span>
          <span className="ag-live-label">{latest.label}</span>
        </section>
      )}

      {!trace && <p className="agents-loading" role="status">Loading the agents’ work…</p>}

      <div className="ag-cards" aria-label="Stages">
        {([1, 2, 3] as N[]).map((n) => (
          <article key={n} className={`ag-card ${open === n ? 'on' : ''}`} style={{ ['--stage-color' as string]: STAGE_COLOR[n as Stage] }}>
            <span className="ag-card-num">Stage {n}</span>
            <h2><button type="button" className="ag-card-btn" aria-expanded={open === n} aria-controls="ag-stage-detail" onClick={() => setOpen(n)}>{STAGES[n].title}</button></h2>
            <span className="ag-cast" aria-hidden="true">
              {STAGES[n].cast.map((k, i) => <span key={k} className="ag-cast-item">{i > 0 && <i className="ag-cast-line" />}<AgentSymbol agent={k} size={30} personas={personas} /></span>)}
            </span>
            <p className="ag-flow">{STAGES[n].flow}</p>
            <p className="ag-num">{headline[n]}</p>
          </article>
        ))}
      </div>

      {st && (
        <section id="ag-stage-detail" className="ag-detail" style={{ ['--stage-color' as string]: STAGE_COLOR[open as Stage] }} aria-label={`Stage ${open}: ${copy.title}`}>
          <p className="ag-detail-lede">{st.summary || copy.flow} <span className="ag-detail-hint">Press play to watch the work pass from one agent to the next.</span></p>
          {open === 3 && plans?.search && (
            <div className="ag-hero">
              <h3>{plans.search.generated} plans in, {plans.plans.length} finalists out</h3>
              <p className="ag-muted">{plans.shock.label}. {plansLive ? 'From the latest planner run.' : 'Sample run with this account’s numbers.'}</p>
              {PlanSearchView ? (
                <Guard fallback={<SearchFunnel search={plans.search} />}><Suspense fallback={<SearchFunnel search={plans.search} />}><PlanSearchView search={plans.search} plans={plans.plans} animate /></Suspense></Guard>
              ) : <SearchFunnel search={plans.search} />}
              <ul className="ag-finalists">{plans.plans.map((p) => <li key={p.id}><b>{p.role_label ?? p.name}</b><span>{p.name}</span></li>)}</ul>
            </div>
          )}
          <AgentRelay key={`stage-${open}`} events={st.events} personas={personas} columns={narrow ? undefined : COLUMNS[open]} compact={narrow}
            label={`Stage ${open} relay`} mode={mode} simplify />
          {open === 2 && (
            <div className="ag-side">
              <h3>Latest profile changes</h3>
              {changes.length ? (
                <ul className="agents-changes">{changes.map((c) => <li key={c.id}><AgentSymbol agent={c.agent} size={20} personas={personas} /><span><b>{c.label}</b> {short(c.before)} → {short(c.after)}{c.undone ? ' (undone)' : ''}</span></li>)}</ul>
              ) : <p className="ag-muted">None yet. Tell Pulp about a goal or a worry and it lands here, with an undo.</p>}
              <p><Link to="/profile">Full history on your profile</Link></p>
            </div>
          )}
          {open === 2 && latest && (
            <details className="ag-last">
              <summary>Replay your last conversation turn ({latest.events.length} steps)</summary>
              <AgentRelay key={`live-${latest.turn}`} events={latest.events} personas={personas} compact={narrow} live label="Latest conversation turn" mode={mode} simplify />
            </details>
          )}
        </section>
      )}

      <details className="ag-curious" open={curious} onToggle={(e) => setCurious((e.target as HTMLDetailsElement).open)}>
        <summary><ChevronDown size={16} aria-hidden="true" /> For the technically curious</summary>
        <div className="ag-curious-body">
          <div className="ag-curious-row">
            <div className="relay-mode" role="group" aria-label="Detail level">
              <button type="button" aria-pressed={mode === 'plain'} onClick={() => setMode('plain')}>Plain</button>
              <button type="button" aria-pressed={mode === 'technical'} onClick={() => setMode('technical')}>Technical</button>
            </div>
            <span className="ag-muted">Technical shows every step of the stage above with its kind, timing and the exact data handed on.</span>
          </div>
          <p className="ag-rule">AI agents run on Gemini through Google’s Agent Development Kit; code agents are deterministic Python. No model produces a figure you see: every number comes from the engine and is checked before it is shown.</p>
          {([1, 2, 3] as N[]).map((n) => (
            <div key={n} className="ag-roster-group" style={{ ['--stage-color' as string]: STAGE_COLOR[n as Stage] }}>
              <h3>Stage {n} · {STAGES[n].title}</h3>
              <p className="ag-muted">{STAGES[n].more}</p>
              <div className="agents-roster">{STAGES[n].roster.map((k) => { const p = personas.find((x) => agentKey(x.key) === k); return p ? <AgentCard key={k} p={p} personas={personas} /> : null })}</div>
            </div>
          ))}
          <div className="ag-roster-group" style={{ ['--stage-color' as string]: STAGE_COLOR[0] }}>
            <h3>Every stage · the one source of numbers</h3>
            <p className="ag-muted">Every stage calls the same engine: the judges’ formula, the month-by-month simulator and the plan scorer.</p>
            <div className="agents-roster">{['engine'].map((k) => { const p = personas.find((x) => agentKey(x.key) === k); return p ? <AgentCard key={k} p={p} personas={personas} /> : null })}</div>
          </div>
        </div>
      </details>
    </div>
  )
}

function AgentCard({ p, personas }: { p: Persona; personas: Persona[] }) {
  const m = metaFor(p.key, personas)
  return (
    <article className="agent-card">
      <div className="agent-card-head"><AgentSymbol agent={p.key} size={36} personas={personas} /><div><strong>{p.name}</strong><span>{m.analogy}</span></div><span className={`agent-kind ${p.kind}`}>{p.kind === 'ai' ? 'AI' : p.kind}</span></div>
      <p>{p.role}</p>
      <dl><dt>Reads</dt><dd>{p.reads.join(', ')}</dd><dt>Writes</dt><dd>{p.writes.join(', ')}</dd><dt>Runs on</dt><dd>{p.runs_on}</dd></dl>
      <p className="agent-guard"><b>Guardrail:</b> {p.guardrail}</p>
    </article>
  )
}
