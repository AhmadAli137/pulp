/* The Agents page: every agent across the three stages, as a relay you can play, step and inspect.
   Stage traces come from GET /api/agents/trace/{id}; until that answers, a sample built from this account's own engine
   numbers is shown (labelled) and the page keeps checking, switching to live data on its own. */
import { Component, Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { MessageCircle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import AgentRelay from '../components/agents/AgentRelay'
import AgentSymbol, { STAGE_COLOR, agentKey, metaFor, type Stage } from '../components/agents/AgentSymbol'
import SearchFunnel from '../components/agents/SearchFunnel'
import { ROSTER, mockLifePlans, mockTrace } from '../components/agents/fixtures'
import { api, type AgentTrace, type LifePlan, type LifePlanResult, type Persona, type PlanSearch, type ProfileChange } from '../services/api'
import { useApp } from '../stores/useApp'
import { short, useActiveAgents, useAgentFeed } from '../stores/agentFeed'
import '../components/agents/agents.css'

/* Package B's funnel visual, loaded only if it exists, so this page builds before it lands. */
type SearchViewProps = { search: PlanSearch; plans: LifePlan[]; animate?: boolean }
const searchModules = import.meta.glob<{ default: ComponentType<SearchViewProps> }>('../components/plans/PlanSearchView.tsx')
const searchLoader = Object.values(searchModules)[0]
const PlanSearchView = searchLoader ? lazy(searchLoader) : null
class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

const COLUMNS: Record<1 | 2 | 3, string[][]> = {
  1: [['data'], ['schema_scout'], ['feature_forge'], ['pattern_hunter', 'archetype_namer'], ['narrator'], ['persona_builder'], ['shock_generator', 'profile']],
  2: [['you'], ['companion'], ['profile', 'director'], ['engine'], ['stage']],
  3: [['you', 'companion'], ['shock_generator', 'strategist'], ['life_planner', 'engine'], ['validator'], ['challenger', 'director'], ['stage']],
}
const STAGE_COPY: Record<1 | 2 | 3, { title: string; lede: string; roster: string[] }> = {
  1: { title: 'From records to a person', lede: 'Before you say a word, eight anonymized bank tables are surveyed, measured and read for patterns, then turned into a short story and a realistic but fictional life, so Pulp asks the right questions from the first message.', roster: ['schema_scout', 'feature_forge', 'pattern_hunter', 'archetype_namer', 'narrator', 'persona_builder'] },
  2: { title: 'Getting to know you', lede: 'As you talk, the Companion updates your profile directly. Each change is logged with who made it and why, and can be undone. The Director then decides what to show, asking the Engine for every number.', roster: ['companion', 'director', 'engine'] },
  3: { title: 'When life happens', lede: 'Mention a shock or a big decision and Stage 3 starts on its own: a personal shock is set, hundreds of multi-step plans are generated and simulated, infeasible ones are screened out, and four distinct finalists are argued for.', roster: ['shock_generator', 'shock_dealer', 'strategist', 'life_planner', 'validator', 'challenger'] },
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
  const changes = log?.filter((c) => c.kind !== 'seed').slice(-5).reverse() ?? turns.flatMap((t) => t.profile ?? []).slice(-5).reverse()
  const stages = trace?.data.stages ?? []
  const allKeys = ROSTER.map((r) => r.key)

  return (
    <div className="agents-page">
      <section className="agents-hero" aria-label="How the agents work">
        <div>
          <p><strong>Agents interpret, code calculates.</strong> Pulp squeezes the insight out of financial and life data, and it takes a team of specialised agents to do it. The ones marked AI read, decide and phrase; the ones marked code compute every number. No model ever produces a figure you see: each one comes from the engine and is checked before it is shown.</p>
          <p>Below is everything they do for this account, stage by stage. Press play to watch the work pass from one agent to the next, or switch to <em>Technical</em> to see each step's kind, timing and the exact data handed on.</p>
          <div className="agents-rule"><span><Sparkles size={13} />AI: Gemini on Google ADK</span><span className="code">Code: Python, deterministic</span>{trace && !trace.live && <span className="agents-sample" title="The live trace endpoint has not answered yet; this sample uses this account's engine numbers.">Sample trace · switches to live automatically</span>}</div>
        </div>
        <div className="agents-legend" aria-label="Stage colours">
          {([1, 2, 3, 0] as Stage[]).map((s) => (
            <div key={s}><AgentSymbol agent={s === 1 ? 'pattern_hunter' : s === 2 ? 'companion' : s === 3 ? 'strategist' : 'engine'} size={28} /><span><b>{s === 0 ? 'Shared' : `Stage ${s}`}</b> · {s === 1 ? 'from records to a person' : s === 2 ? 'getting to know you' : s === 3 ? 'when life happens' : 'the engine, used by every stage'}</span></div>
          ))}
        </div>
      </section>

      <section className="agents-live" aria-label="Live agent activity">
        <div className="agents-live-title"><strong>{active.size ? 'Agents working now' : 'Live from your conversation'}</strong><span>{latest ? `${latest.label}: ${latest.events.length} steps` : 'Talk to Pulp and the agents light up here.'}</span></div>
        <div className="agents-live-strip">
          {allKeys.map((k) => <span key={k} className={`agent-chip ${active.has(k) ? 'on' : ''}`}><AgentSymbol agent={k} size={22} personas={personas} active={active.has(k)} />{metaFor(k, personas).name}</span>)}
        </div>
        <button type="button" className="agents-try" onClick={() => openPulp('__intro__')}><MessageCircle size={15} />Try it: open Pulp</button>
      </section>

      {latest && (
        <section className="agents-stage" style={{ ['--stage-color' as string]: STAGE_COLOR[2] }} aria-label="Your latest conversation turn">
          <div className="agents-stage-head"><span className="agents-stage-num">Live</span><div><h2>Your last turn, as it happened</h2><p>{latest.label} · recorded from the Pulp conversation on this device.</p></div></div>
          <AgentRelay key={`live-${latest.turn}`} events={latest.events} personas={personas} compact={narrow} live label="Latest conversation turn" />
        </section>
      )}

      {!trace && <p className="agents-loading" role="status">Loading the agents’ trace…</p>}
      {stages.map((st) => {
        const n = st.stage as 1 | 2 | 3
        const copy = STAGE_COPY[n]
        const side = n === 3 && plans?.search
        return (
          <section key={n} className="agents-stage" style={{ ['--stage-color' as string]: STAGE_COLOR[n] }} aria-labelledby={`agents-stage-${n}`}>
            <div className="agents-stage-head">
              <span className="agents-stage-num">Stage {n}</span>
              <div><h2 id={`agents-stage-${n}`}>{copy.title}</h2><p>{st.summary || copy.lede}</p></div>
            </div>
            {n === 1 && <p className="agents-press"><svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><path d="M5 0C5 0 0 6.2 0 9.2a5 5 0 0 0 10 0C10 6.2 5 0 5 0Z" fill="#ed8a53" /></svg>The press: raw records go in on the left, each agent presses out something more useful, and insight comes out on the right.</p>}
            <div className={`agents-stage-body ${side || n === 2 ? 'with-side' : ''}`}>
              <AgentRelay events={st.events} personas={personas} columns={narrow ? undefined : COLUMNS[n]} compact={narrow} label={`Stage ${n} relay`} />
              {n === 2 && (
                <aside className="agents-stage-side" aria-label="Recent profile updates">
                  <h3>Recent profile updates</h3>
                  {changes.length ? (
                    <ul className="agents-changes">{changes.map((c) => <li key={c.id}><AgentSymbol agent={c.agent} size={20} personas={personas} /><span><b>{c.label}</b> {short(c.before)} → {short(c.after)}{c.undone ? ' (undone)' : ''}</span></li>)}</ul>
                  ) : <p>No changes yet. Tell Pulp about a goal or a worry and the Companion writes it straight to your profile, with an undo.</p>}
                  <p><Link to="/profile">See the full history on your profile</Link></p>
                </aside>
              )}
              {side && plans?.search && (
                <aside className="agents-stage-side" aria-label="Plan search">
                  <h3>{plans.search.generated} plans in, {plans.plans.length} finalists out</h3>
                  <p>{plans.shock.label}. {plansLive ? 'From the latest planner run.' : 'Sample run with this account’s numbers.'}</p>
                  {PlanSearchView ? (
                    <Guard fallback={<SearchFunnel search={plans.search} />}><Suspense fallback={<SearchFunnel search={plans.search} />}><PlanSearchView search={plans.search} plans={plans.plans} animate /></Suspense></Guard>
                  ) : <SearchFunnel search={plans.search} />}
                  <ul className="agents-finalists">{plans.plans.map((p) => <li key={p.id}><b>{p.role_label ?? p.name}</b><span>{p.name}</span></li>)}</ul>
                </aside>
              )}
            </div>
            <div className="agents-roster" aria-label={`Stage ${n} agents`}>
              {copy.roster.map((k) => { const p = personas.find((x) => agentKey(x.key) === k); return p ? <AgentCard key={k} p={p} personas={personas} /> : null })}
            </div>
          </section>
        )
      })}
      {stages.length > 0 && (
        <section className="agents-stage" style={{ ['--stage-color' as string]: STAGE_COLOR[0] }} aria-label="Shared agent">
          <div className="agents-stage-head"><span className="agents-stage-num">Every stage</span><div><h2>The one source of numbers</h2><p>Every stage calls the same engine: the judges’ formula, the month-by-month simulator and the plan scorer.</p></div></div>
          <div className="agents-roster">{['engine'].map((k) => { const p = personas.find((x) => agentKey(x.key) === k); return p ? <AgentCard key={k} p={p} personas={personas} /> : null })}</div>
        </section>
      )}
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
