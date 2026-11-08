/* Building blocks for the Profile page and the Overview comparison: persona header, goals with weights, traits on
   percentile tracks, how you are like others, and the timeline of profile changes. */
import {
  Anvil, CloudLightning, Cog, Compass, Ear, Feather, IdCard, Map as MapIcon, Route, Scale, Search, Shield, Swords, Tags, Undo2, User, type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { LifePersona, PersonaGoal, ProfileChange } from '../../services/api'
import './profile.css'

export const AGENT: Record<string, { name: string; Icon: LucideIcon; color: string }> = {
  persona_builder: { name: 'Persona Builder', Icon: IdCard, color: '#6B5B95' },
  companion: { name: 'Companion', Icon: Ear, color: '#2F7A5B' },
  shock_generator: { name: 'Shock Generator', Icon: CloudLightning, color: '#B4532A' },
  life_planner: { name: 'Life Planner', Icon: Route, color: '#E86A0C' },
  strategist: { name: 'Strategist', Icon: Swords, color: '#3B6EA8' },
  challenger: { name: 'Challenger', Icon: Shield, color: '#8B5E3C' },
  director: { name: 'Director', Icon: Compass, color: '#0F766E' },
  engine: { name: 'Engine', Icon: Cog, color: '#54645a' },
  validator: { name: 'Validator', Icon: Scale, color: '#54645a' },
  ranker: { name: 'Ranker', Icon: Scale, color: '#54645a' },
  profile_narrator: { name: 'Profile Narrator', Icon: Feather, color: '#A16207' },
  archetype_namer: { name: 'Archetype Namer', Icon: Tags, color: '#A16207' },
  pattern_hunter: { name: 'Pattern Hunter', Icon: Search, color: '#3B6EA8' },
  feature_forge: { name: 'Feature Forge', Icon: Anvil, color: '#54645a' },
  schema_scout: { name: 'Schema Scout', Icon: MapIcon, color: '#54645a' },
  user: { name: 'You', Icon: User, color: '#183B2D' },
}
export const agentOf = (k: string) => AGENT[k] ?? { name: k.replace(/_/g, ' '), Icon: Cog, color: '#54645a' }

const money = (v: number) => `$${Math.round(v).toLocaleString('en-CA')}`
const HORIZON: Record<string, string> = { short: 'Short', medium: 'Medium', long: 'Long' }

export function PersonaHeader({ persona, preview }: { persona: LifePersona; preview?: boolean }) {
  const c = Math.max(0, Math.min(1, persona.occupation.confidence))
  return (
    <header className="pf-head">
      <div className="pf-avatar" aria-hidden="true">{persona.display_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
      <div className="pf-head-main">
        <span className="pf-badge">Fictional profile built from the records{preview ? ' · preview' : ''}</span>
        <h2>{persona.display_name}</h2>
        <p className="pf-facts">{persona.age != null && <span>{persona.age} years old</span>}<span>{persona.life_stage}</span><span>{persona.household}</span><span>{persona.home}</span></p>
        <div className="pf-occ">
          <div className="pf-occ-head"><strong>{persona.occupation.label}</strong><span>{Math.round(c * 100)}% confident</span></div>
          <span className="pf-conf" role="img" aria-label={`Confidence ${Math.round(c * 100)} percent`}><i style={{ width: `${c * 100}%` }} /></span>
          <small>Evidence: {persona.occupation.evidence}</small>
        </div>
      </div>
    </header>
  )
}

function Dots({ n }: { n: number }) {
  return <span className="pf-dots" role="img" aria-label={`Importance ${n} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
}

export function GoalsTable({ goals }: { goals: PersonaGoal[] }) {
  const sorted = [...goals].sort((a, b) => b.weight - a.weight)
  const total = goals.reduce((a, g) => a + g.weight, 0) || 1
  return (
    <div className="pf-goals">
      <table>
        <caption className="pf-sr">Goals with their weights in the plan objective</caption>
        <thead><tr><th>Goal</th><th>Size</th><th>Horizon</th><th>Importance</th><th>Target</th><th>Weight</th><th>Source</th></tr></thead>
        <tbody>
          {sorted.map((g, i) => (
            <tr key={`${g.id}-${i}`}>
              <td><strong>{g.label}</strong>{g.personal && <span className="pf-personal">From your records</span>}{g.why && <small>{g.why}</small>}{g.evidence && <small className="pf-ev">Evidence: {g.evidence}</small>}</td>
              <td><span className={`pf-size ${g.size}`}>{g.size}</span></td>
              <td>{HORIZON[g.horizon] ?? g.horizon}</td>
              <td><Dots n={Math.round(g.importance)} /></td>
              <td className="num">{money(g.target_amount)}<small>in {g.target_months} months</small></td>
              <td className="pf-wcell"><span className="pf-wbar"><i style={{ width: `${(g.weight / total) * 100}%` }} /></span><b>{Math.round((g.weight / total) * 100)}%</b></td>
              <td><span className={`pf-src ${g.source}`}>{g.source === 'user' ? 'you' : g.source}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pf-note">Weight = importance × urgency (short 1.0, medium 0.75, long 0.5), normalised so the weights add to 100%. The planners use these weights to score how far each plan gets you.</p>
    </div>
  )
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

/** A measure on a 0-100 percentile track with ticks and a marker. */
export function TraitTrack({ t }: { t: LifePersona['traits'][number] }) {
  const p = t.percentile
  return (
    <div className="pf-trait">
      <div className="pf-trait-head"><strong>{t.label}</strong><span>{t.value}{p != null && <em className="pf-pctl">{ordinal(Math.round(p))} percentile</em>}</span></div>
      <div className="pf-track" role="img" aria-label={p == null ? `${t.label}: ${t.value}` : `${t.label}: ${t.value}, higher than ${Math.round(p)}% of accounts`}>
        {[0, 25, 50, 75, 100].map((k) => <i key={k} className="pf-tick" style={{ left: `${k}%` }}><em>{k}</em></i>)}
        {p != null && <span className="pf-marker" style={{ left: `${Math.max(0, Math.min(100, p))}%` }} />}
      </div>
      <small>{t.note}</small>
    </div>
  )
}

export function LikeOthers({ like }: { like: LifePersona['like_others'] }) {
  return (
    <div className="pf-like">
      <p className="pf-like-arch">Like <b>{Math.round(like.share * 100)}%</b> of accounts: <strong>{like.archetype}</strong></p>
      <dl>
        <div><dt>Of people like you who would last a six-month layoff</dt><dd>{Math.round(like.survive6_layoff_pct)}%</dd></div>
        <div><dt>Similar accounts compared</dt><dd>{like.peers_n.toLocaleString()}</dd></div>
      </dl>
      {like.note && <p className="pf-like-note">{like.note}</p>}
    </div>
  )
}

const FIELDS: [string, string, (v: unknown) => string][] = [
  ['importance', 'importance', (v) => `${v}/5`], ['target_amount', 'target', (v) => money(Number(v))], ['target_months', 'months', (v) => `${v}`],
  ['horizon', 'horizon', (v) => String(v)], ['size', 'size', (v) => String(v)], ['label', 'name', (v) => String(v)], ['weight', 'weight', (v) => `${Math.round(Number(v) * 100)}%`],
]
function summary(v: unknown): string {
  if (v == null) return '—'
  if (typeof v !== 'object') return String(v)
  const o = v as Record<string, unknown>
  if (o.target_amount != null) return `${money(Number(o.target_amount))}${o.target_months != null ? ` in ${o.target_months} months` : ''}${o.importance != null ? `, importance ${o.importance}/5` : ''}`
  if (o.label) return String(o.label)
  return Object.entries(o).slice(0, 3).map(([k, x]) => `${k}: ${typeof x === 'object' ? '…' : String(x)}`).join(', ')
}
/** "importance 2/5 → 3/5" for objects, otherwise before → after. */
export function changeText(c: ProfileChange): { before: string; after: string } | { diffs: string[] } {
  if (c.before && c.after && typeof c.before === 'object' && typeof c.after === 'object') {
    const b = c.before as Record<string, unknown>, a = c.after as Record<string, unknown>
    const diffs = FIELDS.filter(([k]) => k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(([k, name, f]) => `${name} ${b[k] == null ? '—' : f(b[k])} → ${f(a[k])}`)
    if (diffs.length) return { diffs }
  }
  return { before: summary(c.before), after: summary(c.after) }
}

function when(at: string) {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  const rel = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`
  return `${d.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${rel}`
}

export function ChangeTimeline({ log, onUndo }: { log: ProfileChange[]; onUndo: (id: string) => Promise<void> }) {
  const [agent, setAgent] = useState('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const agents = useMemo(() => [...new Set(log.map((c) => c.agent))], [log])
  const rows = useMemo(() => [...log].filter((c) => agent === 'all' || c.agent === agent)
    .sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : b.version - a.version)), [log, agent])
  return (
    <div className="pf-log">
      <div className="pf-log-filter" role="group" aria-label="Filter by agent">
        <button type="button" className={agent === 'all' ? 'on' : ''} aria-pressed={agent === 'all'} onClick={() => setAgent('all')}>All agents <b>{log.length}</b></button>
        {agents.map((a) => { const A = agentOf(a); return <button key={a} type="button" className={agent === a ? 'on' : ''} aria-pressed={agent === a} onClick={() => setAgent(a)}><A.Icon size={13} aria-hidden="true" /> {A.name} <b>{log.filter((c) => c.agent === a).length}</b></button> })}
      </div>
      {err && <p className="pf-err" role="alert">{err}</p>}
      {rows.length === 0 ? <p className="pf-note">No changes yet.</p> : (
        <ol className="pf-timeline">
          {rows.map((c) => {
            const A = agentOf(c.agent)
            const t = changeText(c)
            return (
              <li key={c.id} className={`pf-change ${c.undone ? 'undone' : ''} kind-${c.kind}`}>
                <span className="pf-change-badge" style={{ background: A.color }} title={A.name}><A.Icon size={13} color="#fff" aria-hidden="true" /></span>
                <div className="pf-change-body">
                  <div className="pf-change-meta"><time dateTime={c.at}>{when(c.at)}</time><b>{A.name}</b><span className="pf-kind">{c.kind}</span><span className="pf-field">{c.field.replace(/_/g, ' ')}</span><span className="pf-ver">v{c.version}</span></div>
                  <strong className="pf-change-label">{c.label}</strong>
                  {'diffs' in t
                    ? <p className="pf-change-diff">{t.diffs.join(' · ')}</p>
                    : <p className="pf-change-diff">{c.kind === 'seed' || c.kind === 'add' ? <>added: {t.after}</> : <><s>{t.before}</s> → {t.after}</>}</p>}
                  {c.reason && <p className="pf-change-why">{c.reason}</p>}
                  {c.undone && <p className="pf-change-undone">Undone</p>}
                </div>
                {!c.undone && c.kind !== 'undo' && (
                  <button type="button" className="pf-undo" disabled={busy === c.id} aria-label={`Undo: ${c.label}`}
                    onClick={async () => { setBusy(c.id); setErr(null); try { await onUndo(c.id) } catch { setErr('That change could not be undone just now.') } finally { setBusy(null) } }}>
                    <Undo2 size={13} aria-hidden="true" /> Undo
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
