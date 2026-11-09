/* "Watch PULP work": a guided, skippable walk through everything the agents did for this account, built only from what
   the backend already recorded or computes (no staged numbers):
     Chapter 1  From records to you      GET /api/agents/trace/{id} (stage 1), /api/customers/{id}/insights, /discovery, /profile
     Chapter 2  How talking updates you  the profile change log (GET /api/profile/{id}) joined to the stage 2 trace
     Chapter 3  When life happens        one POST /api/agent/life-plans run and its own trace, so every count agrees
   Back / Next, Skip chapter, Skip to the end, autoplay, arrow keys, and ?chapter=1|2|3 to start at a chapter. */
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, FastForward, MessageCircle, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import AgentSymbol, { STAGE_COLOR, metaFor, type Stage } from '../components/agents/AgentSymbol'
import { api, type AgentTrace, type DiscoveryResult, type Insights, type LifePlan, type LifePlanResult, type PlanSearch, type ProfileChange, type ProfileDoc, type TraceEvent } from '../services/api'
import { useApp } from '../stores/useApp'
import '../components/tour/tour.css'

type SearchViewProps = { search: PlanSearch; plans: LifePlan[]; animate?: boolean }
const searchModules = import.meta.glob<{ default: ComponentType<SearchViewProps> }>('../components/plans/PlanSearchView.tsx')
const searchLoader = Object.values(searchModules)[0]
const PlanSearchView = searchLoader ? lazy(searchLoader) : null
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

type Chapter = 0 | 1 | 2 | 3 | 4
interface Step { chapter: Chapter; key: string; agent: string; title: string; lede: string; body: ReactNode }

const CHAPTERS: { n: 1 | 2 | 3; title: string; blurb: string }[] = [
  { n: 1, title: 'From records to you', blurb: 'Six agents turn anonymous bank tables into signals, patterns and a fictional person.' },
  { n: 2, title: 'How talking updates you', blurb: 'Every change to your profile, who made it, why, and how to undo it.' },
  { n: 3, title: 'When life happens', blurb: 'One shock, hundreds of plans, the ones that do not fit your life dropped, four kept.' },
]
const AUTOPLAY_MS = 8000
const SHOCK = { income_fraction: 0.55, bills_increase: 0, one_off_cost: 0, shock_duration: 6 }

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-CA')}`
const pct = (n: number) => `${Math.round(n * 100)}%`
const stageOf = (c: Chapter): Stage => (c === 1 || c === 2 || c === 3 ? c : 0)

function useTourData(accountId: number | null) {
  const [trace, setTrace] = useState<AgentTrace | null>(null)
  const [insights, setInsights] = useState<Insights | null>(null)
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null)
  const [profile, setProfile] = useState<ProfileDoc | null>(null)
  const [plans, setPlans] = useState<LifePlanResult | null>(null)
  const [failed, setFailed] = useState<string[]>([])
  useEffect(() => {
    if (!accountId) return
    let stop = false
    setTrace(null); setInsights(null); setDiscovery(null); setProfile(null); setPlans(null); setFailed([])
    const miss = (what: string) => () => { if (!stop) setFailed((f) => [...f, what]) }
    api.agentTrace(accountId).then((d) => { if (!stop) setTrace(d) }).catch(miss('trace'))
    api.insights(accountId, false).then((d) => { if (!stop) setInsights(d) }).catch(miss('insights'))
    api.discovery(accountId).then((d) => { if (!stop) setDiscovery(d) }).catch(miss('discovery'))
    api.lifeProfile(accountId).then((d) => { if (!stop) setProfile(d) }).catch(miss('profile'))
    api.lifePlans({ account_id: accountId, ...SHOCK, use_ai: false }).then((d) => { if (!stop) setPlans(d) }).catch(miss('plans'))
    return () => { stop = true }
  }, [accountId])
  const loading = !failed.length && (!trace || !insights || !profile || !plans)
  return { trace, insights, discovery, profile, plans, failed, loading }
}

/* ---------- small building blocks ---------- */
function Reveal({ children, i = 0 }: { children: ReactNode; i?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.12 + i * 0.09, duration: 0.3 }}>
      {children}
    </motion.div>
  )
}
function InOut({ input, output }: { input: ReactNode; output: ReactNode }) {
  return (
    <div className="tour-io">
      <section className="tour-io-col"><h3>What went in</h3>{input}</section>
      <span className="tour-io-arrow" aria-hidden="true"><ArrowRight size={18} /></span>
      <section className="tour-io-col out"><h3>What came out</h3>{output}</section>
    </div>
  )
}
function Items({ items, max = 8 }: { items?: string[]; max?: number }) {
  if (!items?.length) return null
  return (
    <ul className="tour-items">
      {items.slice(0, max).map((t, i) => <li key={i}><Reveal i={i}>{t}</Reveal></li>)}
      {items.length > max && <li className="tour-more">…and {items.length - max} more</li>}
    </ul>
  )
}
function Badge({ kind }: { kind: 'recorded' | 'simulated' | 'fictional' | 'ai' | 'code' | 'memory' }) {
  const label = { recorded: 'Recorded', simulated: 'Simulated', fictional: 'Fictional', ai: 'AI agent', code: 'Code', memory: 'Memory' }[kind]
  return <span className={`tour-badge tour-badge-${kind}`}>{label}</span>
}
const evs = (trace: AgentTrace | null, stage: 1 | 2 | 3) => trace?.stages.find((s) => s.stage === stage)?.events ?? []
const pick = (events: TraceEvent[], agent: string, kind?: TraceEvent['kind']) => events.filter((e) => e.agent === agent && (!kind || e.kind === kind))
const fmtValue = (v: unknown): string => {
  if (v == null) return 'nothing'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const label = o.label ?? o.text ?? o.type
    const amount = typeof o.target_amount === 'number' ? ` · ${money(o.target_amount)}` : ''
    const months = typeof o.target_months === 'number' ? ` in ${o.target_months} months` : ''
    if (label) return `${label}${amount}${months}`
  }
  return JSON.stringify(v)
}

/* ---------- the steps ---------- */
function buildSteps(d: ReturnType<typeof useTourData>, accountId: number, openPulp: (seed?: string) => void): Step[] {
  const { trace, insights, discovery, profile, plans } = d
  const s1 = evs(trace, 1), s2 = evs(trace, 2)
  const persona = profile?.persona ?? null
  const name = persona?.display_name?.split(' ')[0] ?? `account ${accountId}`
  const steps: Step[] = []

  steps.push({
    chapter: 0, key: 'intro', agent: 'director', title: `How PULP got to know ${name}`,
    lede: `Account ${accountId} is a real, anonymized bank account. Everything below is what the agents actually did with it, step by step. Skip any part.`,
    body: (
      <div className="tour-chapters">
        {CHAPTERS.map((c, i) => (
          <Reveal key={c.n} i={i}>
            <div className="tour-chapter-card" style={{ ['--stage-color' as string]: STAGE_COLOR[c.n] }}>
              <span className="tour-chapter-num">Chapter {c.n}</span>
              <strong>{c.title}</strong>
              <p>{c.blurb}</p>
            </div>
          </Reveal>
        ))}
        <p className="tour-rule"><strong>The rule throughout:</strong> AI agents read, decide and word things; code calculates every number. A model's number is never shown.</p>
      </div>
    ),
  })

  // Chapter 1
  const scout = pick(s1, 'schema_scout')
  const tables = scout.find((e) => e.kind === 'tool_result')
  const roles = scout.find((e) => e.kind === 'output')
  if (tables || roles) steps.push({
    chapter: 1, key: 'scout', agent: 'schema_scout', title: tables?.title ?? 'Reading the bank’s tables',
    lede: 'The Schema Scout maps the bank’s columns to roles (money in, money out, bills, balance), so every later step reads roles, not column names. Any bank’s export would work the same way.',
    body: <InOut input={<Items items={tables?.items} />} output={<Items items={roles?.items} />} />,
  })

  const f = insights?.features ?? {}
  const SIGNALS: [string, string, (v: number) => string][] = [
    ['I', 'Typical money in', money], ['S', 'Typical spending', money], ['B', 'Cash cushion', money],
    ['spending_ratio', 'Share of income spent', pct], ['income_cv', 'How uneven income is', (v) => v.toFixed(2)],
    ['cash_deposit_share', 'Paid in as cash', pct], ['fee_months_share', 'Months with a bank fee', pct], ['neg_months_share', 'Months below zero', pct],
  ]
  const forge = pick(s1, 'feature_forge', 'tool_result')[0]
  if (insights) steps.push({
    chapter: 1, key: 'forge', agent: 'feature_forge', title: forge?.title ?? 'Behaviour signals',
    lede: 'The Feature Forge turns every month of this account’s records into signals: how much, how regular, when bills land, fees, drift, past income drops. Each bar shows where this account sits among all 4,500.',
    body: (
      <div className="tour-signals">
        {SIGNALS.filter(([k]) => typeof f[k]?.value === 'number').map(([k, label, fmt], i) => {
          const p = f[k]?.percentile
          return (
            <Reveal key={k} i={i}>
              <div className="tour-signal">
                <span className="tour-signal-label">{label}</span>
                <strong>{fmt(f[k].value as number)}</strong>
                {typeof p === 'number' && (
                  <span className="tour-signal-bar" title={f[k].doc}>
                    <i style={{ width: `${Math.max(2, p)}%` }} />
                    <em>higher than {Math.round(p)}% of accounts</em>
                  </span>
                )}
              </div>
            </Reveal>
          )
        })}
      </div>
    ),
  })

  const hunter = pick(s1, 'pattern_hunter')
  const calls = hunter.filter((e) => e.kind === 'tool_call')
  const findings = hunter.filter((e) => e.kind === 'output')
  const hunterStart = hunter.find((e) => e.kind === 'start')
  if (hunter.length) steps.push({
    chapter: 1, key: 'hunter', agent: 'pattern_hunter', title: 'Hunting for patterns across all 4,500 accounts',
    lede: `The Pattern Hunter is an AI agent with statistical tools: it decides what to test, and the tools compute the answers${typeof hunterStart?.data?.tool_calls_made === 'number' ? ` (${hunterStart.data.tool_calls_made} tool calls this run)` : ''}. Its strongest findings are then checked against what really happened to people’s loans.`,
    body: (
      <InOut
        input={<ul className="tour-calls">{calls.slice(0, 9).map((e, i) => <li key={i}><Reveal i={i}><code>{e.title}</code></Reveal></li>)}{calls.length > 9 && <li className="tour-more">…and more</li>}</ul>}
        output={
          <ul className="tour-findings">
            {findings.slice(0, 5).map((e, i) => (
              <li key={i}><Reveal i={i + 3}>
                <Badge kind={e.data?.ground_truth ? 'recorded' : 'simulated'} /> <strong>{e.title}</strong>
                {e.items?.[0] && <p>{e.items[0]}</p>}
              </Reveal></li>
            ))}
          </ul>
        }
      />
    ),
  })

  const arche = pick(s1, 'archetype_namer')
  const groups = arche.find((e) => e.kind === 'tool_result')
  const yours = insights?.archetype
  if (yours || groups) steps.push({
    chapter: 1, key: 'archetype', agent: 'archetype_namer', title: yours ? `Who ${name} is like: ${yours.name}` : 'Six behaviour groups',
    lede: 'Code clusters every account into six groups by behaviour (k-means, fixed seed). The Archetype Namer, an AI agent, only names and describes each group from its numbers.',
    body: (
      <ul className="tour-groups">
        {(groups?.items ?? []).map((t, i) => {
          const mine = yours && t.startsWith(yours.name)
          return <li key={i} className={mine ? 'mine' : ''}><Reveal i={i}>{t}{mine && <span className="tour-you">{name}</span>}</Reveal></li>
        })}
        {yours && <li className="tour-note"><Reveal i={7}>{yours.description} Evidence: {yours.evidence}.</Reveal></li>}
      </ul>
    ),
  })

  const flags = insights?.flags ?? []
  const disc = discovery?.discovery
  if (flags.length || disc) steps.push({
    chapter: 1, key: 'narrator', agent: 'narrator', title: 'What is worth telling this person',
    lede: 'Rules raise flags from the signals. The Profile Narrator words the few that matter, and the single biggest discovery is ranked by severity, by how rare it is, and by how unlikely the person is to notice it alone.',
    body: (
      <div className="tour-flags">
        {flags.map((fl, i) => <Reveal key={fl.key} i={i}><div className={`tour-flag sev-${fl.severity}`}><strong>{fl.label}</strong><p>{fl.evidence}</p></div></Reveal>)}
        {disc && (
          <Reveal i={flags.length + 1}>
            <div className="tour-discovery">
              <span>Biggest discovery</span>
              <strong>{disc.title}</strong>
              <p>{disc.plain} {disc.rarity}</p>
              <p className="tour-muted">{discovery?.method}</p>
            </div>
          </Reveal>
        )}
      </div>
    ),
  })

  const refined = pick(s1, 'persona_builder', 'tool_result')[0]
  if (persona) steps.push({
    chapter: 1, key: 'persona', agent: 'persona_builder', title: `The person: ${persona.display_name}`,
    lede: `The Persona Builder imagines a realistic, clearly fictional life that fits the records, so Pulp can ask the right questions from the first message. Every fact points back to the records it came from.${refined ? ` ${refined.title}.` : ''}`,
    body: (
      <div className="tour-persona">
        <Reveal><div className="tour-persona-head">
          <Badge kind="fictional" />
          <strong>{persona.display_name}, {persona.age}</strong>
          <span>{persona.life_stage} · {persona.household} · {persona.home}</span>
        </div></Reveal>
        <dl className="tour-facts">
          <Reveal i={1}><div><dt>Work (a guess, {pct(persona.occupation.confidence)} sure)</dt><dd>{persona.occupation.label}<small>came from: {persona.occupation.evidence}</small></dd></div></Reveal>
          {persona.goals.slice(0, 4).map((g, i) => (
            <Reveal key={g.id} i={i + 2}><div><dt>Goal · weight {pct(g.weight)}</dt><dd>{g.label}: {money(g.target_amount)} in {g.target_months} months<small>came from: {g.evidence}</small></dd></div></Reveal>
          ))}
          {persona.worries.slice(0, 3).map((w, i) => (
            <Reveal key={w.label} i={i + 6}><div><dt>Worry</dt><dd>{w.label}{w.quote && <q>{w.quote}</q>}<small>came from: {w.evidence}</small></dd></div></Reveal>
          ))}
        </dl>
      </div>
    ),
  })

  // Chapter 2
  const log = [...(profile?.log ?? [])].sort((a, b) => a.version - b.version || a.at.localeCompare(b.at))
  const seed = log.filter((c) => c.kind === 'seed')
  const changes = log.filter((c) => c.kind !== 'seed')
  const said = (c: ProfileChange): string | null => {
    const i = s2.findIndex((e) => e.data?.change_id === c.id)
    if (i < 0) return null
    for (let j = i - 1; j >= 0; j--) if (s2[j].agent === 'user') return s2[j].items?.[0] ?? null
    return null
  }
  if (seed.length) steps.push({
    chapter: 2, key: 'seed', agent: 'persona_builder', title: `Where ${name}’s profile starts`,
    lede: 'Before anyone speaks, the profile is seeded from Stage 1: goals and worries, each with its reason. From here on, every change is a logged entry with who made it and why.',
    body: (
      <ul className="tour-log">
        {seed.map((c, i) => <li key={c.id}><Reveal i={i}><span className="tour-log-kind">{c.field === 'goals' ? 'Goal' : 'Worry'}</span><strong>{c.label}</strong><small>{c.reason}</small></Reveal></li>)}
      </ul>
    ),
  })
  const recent = changes.slice(-4)
  recent.forEach((c, i) => {
    const words = said(c)
    const by = metaFor(c.agent).name
    steps.push({
      chapter: 2, key: `change-${c.id}`, agent: c.agent,
      title: `${c.kind === 'undo' ? 'Undone' : c.kind === 'remove' ? 'Removed' : c.kind === 'update' ? 'Updated' : 'Added'}: ${c.label}`,
      lede: words
        ? `${name} said “${words}”. The ${by} turned that into a profile change on its own, applied it straight away and logged it as version ${c.version}.`
        : `The ${by} changed the profile (version ${c.version}).`,
      body: (
        <div className="tour-change">
          {words && <Reveal><div className="tour-bubble">{words}</div></Reveal>}
          <Reveal i={1}>
            <div className="tour-diff">
              <div><span>Before</span><p>{fmtValue(c.before)}</p></div>
              <ArrowRight size={18} aria-hidden="true" />
              <div className="after"><span>After</span><p>{fmtValue(c.after)}</p></div>
            </div>
          </Reveal>
          <Reveal i={2}><p className="tour-reason"><strong>Why:</strong> {c.reason}</p></Reveal>
          <Reveal i={3}><p className="tour-muted">{c.field} · version {c.version} · {new Date(c.at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}{c.undone ? ' · later undone' : ''}{i === 0 && changes.length > recent.length ? ` · ${changes.length - recent.length} earlier changes in History` : ''}</p></Reveal>
        </div>
      ),
    })
  })
  if (profile) steps.push({
    chapter: 2, key: 'control', agent: 'companion', title: 'Nothing changes without a trace',
    lede: 'Saying “no” to Pulp undoes the last change. Every entry can also be undone from the History tab on Profile, and the plans are rebuilt from whatever the profile says now.',
    body: (
      <div className="tour-control">
        <Reveal><p><strong>{changes.length}</strong> change{changes.length === 1 ? '' : 's'} since the profile was seeded, <strong>{changes.filter((c) => c.undone || c.kind === 'undo').length}</strong> undone. Current version: <strong>{profile.version}</strong>.</p></Reveal>
        <Reveal i={1}><div className="tour-actions">
          <button type="button" className="tour-btn" onClick={() => openPulp('I might lose my job')}><MessageCircle size={15} aria-hidden="true" />Try it: tell Pulp “I might lose my job”</button>
          <Link className="tour-btn ghost" to="/profile?tab=history">See the full History</Link>
        </div></Reveal>
        <Reveal i={2}><p className="tour-muted">Trying it adds a real, logged change to this demo profile; say “no” to undo it.</p></Reveal>
      </div>
    ),
  })

  // Chapter 3: one planner run, so every number on these steps agrees
  if (plans) {
    const t3 = plans.trace ?? []
    const fitStart = pick(t3, 'life_fit', 'start')[0], fitOut = pick(t3, 'life_fit', 'output')[0]
    const built = pick(t3, 'life_planner', 'tool_call')[0]
    const screened = pick(t3, 'validator', 'output')[0]
    const ranked = pick(t3, 'ranker', 'output')[0]
    const challenge = pick(t3, 'challenger', 'output')
    const search = plans.search
    const deck = pick(s1, 'shock_generator', 'output')[0]
    steps.push({
      chapter: 3, key: 'shock', agent: 'shock_generator', title: `The shock: ${plans.shock.label}`,
      lede: `The Shock Generator builds a deck of shocks that fit this life, sized from the account’s own numbers. For this walk-through we deal the layoff: income falls to ${pct(plans.shock.r)} (Employment Insurance) for ${plans.shock.duration} months, starting in month ${plans.shock_starts_in ?? 3}.`,
      body: (
        <div>
          <Items items={deck?.items} max={9} />
          <Reveal i={9}><p className="tour-muted">Mention any shock in the chat (“a hospital bill of 4,000”, “what if a recession hits”) and the same thing starts on its own.</p></Reveal>
        </div>
      ),
    })
    if (fitOut) steps.push({
      chapter: 3, key: 'fit', agent: 'life_fit', title: fitOut.title,
      lede: 'Before any plan is built, the Life Fit Assessor reads who the plan is for and scores every possible decision against their age, health, time and household. Decisions that do not fit are ruled out, with the reason.',
      body: <InOut input={<Items items={fitStart?.items} />} output={<Items items={fitOut.items} max={6} />} />,
    })
    if (search) steps.push({
      chapter: 3, key: 'search', agent: 'life_planner', title: `${search.generated} plans built and simulated, ${search.screened_out} screened out`,
      lede: `${built?.title ?? 'The Life Planner combines real decisions into multi-step plans'}. The Engine simulates each one month by month over ${plans.horizon_months} months, then the Validator drops what cannot work for this account.`,
      body: (
        <div className="tour-screens">
          {search.screens.filter((s) => s.removed > 0).map((s, i) => (
            <Reveal key={s.rule} i={i}>
              <div className="tour-screen"><span>{s.rule}</span><i style={{ width: `${Math.max(3, (s.removed / Math.max(...search.screens.map((x) => x.removed))) * 100)}%` }} /><b>{s.removed}</b></div>
            </Reveal>
          ))}
          <Reveal i={search.screens.length}><p className="tour-muted">{screened?.title}. {search.feasible} feasible plans go on.</p></Reveal>
        </div>
      ),
    })
    if (search) steps.push({
      chapter: 3, key: 'frontier', agent: 'validator', title: ranked?.title ?? `${search.pareto} plans on the frontier`,
      lede: 'The Ranker keeps only plans that no other plan beats on every axis at once (gap covered, cushion, goals). Then four finalists are picked that are genuinely different from each other.',
      body: PlanSearchView
        ? <Guard><Suspense fallback={<p className="tour-muted">Drawing the search…</p>}><PlanSearchView search={search} plans={plans.plans} animate /></Suspense></Guard>
        : <p>{search.pareto} on the frontier, {search.finalists} finalists.</p>,
    })
    if (challenge.length) steps.push({
      chapter: 3, key: 'challenger', agent: 'challenger', title: 'The Challenger argues back',
      lede: 'The Challenger looks for plans that seem sensible but still run short, and checks each finalist against what the person told Pulp (time with the household, health, worries).',
      body: <div>{challenge.map((e, i) => <Reveal key={i} i={i}><h4 className="tour-h4">{e.title}</h4><Items items={e.items} max={4} /></Reveal>)}</div>,
    })
    const best = plans.plans.find((p) => p.id === plans.recommended) ?? plans.plans[0]
    const w = plans.objective.weights
    if (best) {
      const c = best.components as LifePlan['components'] & { fit?: number }
      const parts: [string, number][] = [
        ['gap covered', (w.shortfall ?? 0) * (c.shortfall ?? 0)],
        ['cushion', w.resilience * c.resilience],
        ['goal progress', w.goals * c.goals],
        ['disruption', -w.disruption * c.disruption],
        ['poor life fit', -0.15 * (1 - (c.fit ?? 1))],
      ]
      steps.push({
        chapter: 3, key: 'finalists', agent: 'life_planner', title: `Four plans, and why “${best.role_label ?? 'Best balance'}” leads`,
        lede: `Every plan is scored on one stated objective. The weights come from ${name}’s profile (worries move weight toward the cushion), and code does the arithmetic.`,
        body: (
          <div className="tour-finalists">
            <Reveal><p className="tour-formula">{plans.objective.formula}</p></Reveal>
            <Reveal i={1}>
              <div className="tour-sum">
                {parts.map(([k, v]) => <span key={k} className={v < 0 ? 'neg' : ''}><b>{v < 0 ? '−' : '+'}{Math.abs(v).toFixed(3)}</b>{k}</span>)}
                <span className="total"><b>= {best.score.toFixed(2)}</b>{best.name}</span>
              </div>
            </Reveal>
            <ul className="tour-plan-list">
              {plans.plans.map((p, i) => (
                <li key={p.id} className={p.id === best.id ? 'lead' : ''}><Reveal i={i + 2}>
                  <span className="tour-role">{p.role_label}</span><strong>{p.name}</strong><b>{p.score.toFixed(2)}</b>
                </Reveal></li>
              ))}
              <li className="base"><Reveal i={7}><span className="tour-role">Change nothing</span><strong>{plans.baseline.outcome.shortfall_total > 0 ? `${money(plans.baseline.outcome.shortfall_total)} short` : 'no shortfall'}</strong><b>{plans.baseline.score.toFixed(2)}</b></Reveal></li>
            </ul>
          </div>
        ),
      })
    }
  }

  steps.push({
    chapter: 4, key: 'end', agent: 'director', title: 'That is the whole process',
    lede: `Records in, a person out, a profile that changes as ${name} talks, and plans that fit a real life. Every step above is recorded and can be replayed.`,
    body: (
      <div className="tour-actions end">
        <Link className="tour-btn" to="/plan">See {name}’s plan</Link>
        <Link className="tour-btn ghost" to="/agents#run-replay">Replay the raw agent runs</Link>
        <Link className="tour-btn ghost" to="/developers">Developer docs</Link>
        <Link className="tour-btn ghost" to="/report">Stage 1 report</Link>
      </div>
    ),
  })
  return steps
}

/* ---------- the page ---------- */
export default function Tour() {
  const accountId = useApp((s) => s.accountId)
  const openPulp = useApp((s) => s.openPulp)
  const data = useTourData(accountId)
  const [params, setParams] = useSearchParams()
  const steps = useMemo(() => (accountId && !data.loading ? buildSteps(data, accountId, openPulp) : []), [accountId, data, openPulp])
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const reduce = useReducedMotion()
  const top = useRef<HTMLDivElement>(null)

  // Start at ?chapter=N once the steps exist
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !steps.length) return
    started.current = true
    const ch = Number(params.get('chapter'))
    if (ch >= 1 && ch <= 3) { const at = steps.findIndex((s) => s.chapter === ch); if (at >= 0) setI(at) }
  }, [steps, params])
  useEffect(() => { started.current = false; setI(0); setPlaying(false) }, [accountId])

  const go = useCallback((n: number) => {
    setI(Math.max(0, Math.min(steps.length - 1, n)))
    const ch = steps[Math.max(0, Math.min(steps.length - 1, n))]?.chapter
    setParams((p) => { const q = new URLSearchParams(p); if (ch && ch <= 3) q.set('chapter', String(ch)); else q.delete('chapter'); return q }, { replace: true })
  }, [steps, setParams])
  const step = steps[i]
  const nextChapterAt = step ? steps.findIndex((s, k) => k > i && s.chapter > step.chapter) : -1

  useEffect(() => {
    if (!playing) return
    if (i >= steps.length - 1) { setPlaying(false); return }
    const t = window.setTimeout(() => go(i + 1), AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [playing, i, steps.length, go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, go])

  // On phones the chapter strip scrolls: keep the current chapter visible
  const rail = useRef<HTMLElement>(null)
  useEffect(() => {
    const on = rail.current?.querySelector<HTMLElement>('li.on')
    const ol = on?.parentElement
    if (on && ol && ol.scrollWidth > ol.clientWidth) ol.scrollTo({ left: on.offsetLeft - 8, behavior: reduce ? 'auto' : 'smooth' })
  }, [i, reduce])

  // Keep the step's top in view when it changes (long steps on phones)
  useEffect(() => {
    const el = top.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [i, reduce])

  if (!accountId) return <DemoAccountPicker />
  if (data.loading) return <p className="tour-loading" role="status">Gathering what the agents did for account {accountId}…</p>
  if (!step) return <p className="tour-loading" role="alert">The agents’ records could not be loaded ({data.failed.join(', ')}). Try again in a moment.</p>

  const meta = metaFor(step.agent)
  const color = STAGE_COLOR[stageOf(step.chapter)]
  return (
    <div className="tour" ref={top} style={{ ['--stage-color' as string]: color }}>
      <nav className="tour-rail" aria-label="Tour chapters" ref={rail}>
        <ol>
          {[0, 1, 2, 3, 4].map((ch) => {
            const at = steps.findIndex((s) => s.chapter === ch)
            if (at < 0) return null
            const count = steps.filter((s) => s.chapter === ch).length
            const doneHere = steps.slice(0, i + 1).filter((s) => s.chapter === ch).length
            const label = ch === 0 ? 'Start' : ch === 4 ? 'End' : CHAPTERS[ch - 1].title
            const on = step.chapter === ch
            return (
              <li key={ch} className={`${on ? 'on' : ''} ${step.chapter > ch ? 'done' : ''}`} style={{ ['--c' as string]: STAGE_COLOR[stageOf(ch as Chapter)] }}>
                <button type="button" onClick={() => go(at)} aria-current={on ? 'step' : undefined}>
                  <span className="tour-rail-num">{step.chapter > ch ? <Check size={12} aria-hidden="true" /> : ch === 0 || ch === 4 ? '' : ch}</span>
                  <span className="tour-rail-label">{label}</span>
                </button>
                {count > 1 && <span className="tour-rail-dots" aria-hidden="true">{Array.from({ length: count }, (_, k) => <i key={k} className={k < doneHere ? 'on' : ''} />)}</span>}
              </li>
            )
          })}
        </ol>
      </nav>

      <AnimatePresence mode="wait">
        <motion.article key={step.key} className="tour-step" aria-live="polite"
          initial={reduce ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -18 }} transition={{ duration: 0.22 }}>
          <header className="tour-step-head">
            <span className="tour-agent"><AgentSymbol agent={step.agent} size={40} active={playing} /></span>
            <div>
              <p className="tour-eyebrow">
                {step.chapter >= 1 && step.chapter <= 3 ? `Chapter ${step.chapter} · ` : ''}{meta.name}{' '}
                <Badge kind={meta.kind === 'ai' ? 'ai' : meta.kind === 'memory' ? 'memory' : 'code'} />
              </p>
              <h2>{step.title}</h2>
              <p className="tour-lede">{step.lede}</p>
            </div>
          </header>
          <div className="tour-body">{step.body}</div>
        </motion.article>
      </AnimatePresence>

      <div className="tour-controls" role="group" aria-label="Tour controls">
        <button type="button" className="tour-btn ghost" onClick={() => go(i - 1)} disabled={i === 0}><ArrowLeft size={15} aria-hidden="true" />Back</button>
        <span className="tour-count" aria-live="polite">Step {i + 1} of {steps.length}</span>
        <div className="tour-controls-right">
          <button type="button" className="tour-btn ghost" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}{playing ? 'Pause' : 'Autoplay'}
          </button>
          {nextChapterAt > 0 && step.chapter >= 1 && step.chapter <= 3 && (
            <button type="button" className="tour-btn ghost" onClick={() => go(nextChapterAt)}><SkipForward size={15} aria-hidden="true" />Skip chapter</button>
          )}
          {i < steps.length - 1 && <button type="button" className="tour-btn ghost" onClick={() => go(steps.length - 1)}><FastForward size={15} aria-hidden="true" />Skip to the end</button>}
          {i < steps.length - 1
            ? <button type="button" className="tour-btn" onClick={() => go(i + 1)}>Next<ArrowRight size={15} aria-hidden="true" /></button>
            : <button type="button" className="tour-btn" onClick={() => go(0)}><RotateCcw size={15} aria-hidden="true" />Start again</button>}
        </div>
      </div>
      <p className="tour-hint">Arrow keys move between steps. Numbers come from the engine; AI agents only interpret and word them.</p>
    </div>
  )
}
