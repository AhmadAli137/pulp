/* How your plans changed: every planner run, newest first, with what triggered it, the profile version, the four
   finalists as role-coloured chips and the sentences on what moved; plus the best-balance score over runs per mode. */
import { useState } from 'react'
import type { PlanHistoryEntry } from '../../services/api'
import { ROLE, domainOf, roleOf } from './palette'
import './plans.css'

const W = 640, H = 220, M = { l: 48, r: 18, t: 14, b: 44 }
const MODE = { shock: { label: 'If a shock hits', color: '#E86A0C' }, long_term: { label: 'Long term', color: '#2F7A5B' } } as const

function when(at: string) {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function PlanScoreChart({ history }: { history: PlanHistoryEntry[] }) {
  // Runs are spaced evenly in the order they happened (they often come minutes apart); ticks give the times.
  const pts = history.map((e) => ({ t: new Date(e.at).getTime(), at: e.at, mode: e.plan_mode, s: e.finalists.find((f) => f.role === 'best_tradeoff')?.score ?? null }))
    .filter((p): p is { t: number; at: string; mode: PlanHistoryEntry['plan_mode']; s: number } => p.s != null && !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t)
  if (pts.length < 1) return null
  const n = pts.length
  const X = (i: number) => M.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - M.l - M.r)
  const yd = domainOf(pts.map((p) => p.s))
  const Y = (s: number) => H - M.b - Math.max(0, Math.min(1, (s - yd.lo) / (yd.hi - yd.lo || 1))) * (H - M.t - M.b)
  const xt = n <= 3 ? pts.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1]
  return (
    <figure className="ph-chart" aria-label="Best balance score over planner runs">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Best balance score across ${n} runs`}>
        {yd.ticks.map((v) => (
          <g key={v}><line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} className="lp-grid" /><text x={M.l - 8} y={Y(v) + 4} textAnchor="end" className="lp-tick">{Math.round(v * 100)}</text></g>
        ))}
        {xt.map((i, k) => <text key={i} x={X(i)} y={H - M.b + 18} textAnchor={n === 1 ? 'middle' : k === 0 ? 'start' : k === xt.length - 1 ? 'end' : 'middle'} className="lp-tick">{when(pts[i].at)}</text>)}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" className="lp-axis">Planner runs, oldest to newest →</text>
        <text transform={`translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" className="lp-axis">Best balance score</text>
        {(Object.keys(MODE) as (keyof typeof MODE)[]).map((m) => {
          const s = pts.map((p, i) => ({ ...p, i })).filter((p) => p.mode === m)
          if (!s.length) return null
          const last = s[s.length - 1]
          return (
            <g key={m}>
              <path d={s.map((p, k) => `${k ? 'L' : 'M'} ${X(p.i)} ${Y(p.s)}`).join(' ')} fill="none" stroke={MODE[m].color} strokeWidth={2.5} />
              {s.map((p) => <circle key={p.i} cx={X(p.i)} cy={Y(p.s)} r={4.5} fill="#fff" stroke={MODE[m].color} strokeWidth={2.5}><title>{`${MODE[m].label} · ${when(p.at)} · score ${Math.round(p.s * 100)}`}</title></circle>)}
              <text x={X(last.i) + (last.i === n - 1 ? -8 : 8)} y={Y(last.s) - 9} textAnchor={last.i === n - 1 ? 'end' : 'start'} className="lp-tick" style={{ fill: MODE[m].color }} fontWeight={800}>{Math.round(last.s * 100)}</text>
            </g>
          )
        })}
      </svg>
      <ul className="lp-legend">{(Object.keys(MODE) as (keyof typeof MODE)[]).map((m) => <li key={m}><i className="lp-line" style={{ background: MODE[m].color }} />{MODE[m].label}</li>)}</ul>
    </figure>
  )
}

export default function PlanHistory({ history, preview }: { history: PlanHistoryEntry[] | null; preview?: boolean }) {
  const [all, setAll] = useState(false)
  if (history == null) return <p className="ph-empty" role="status">Loading the planners’ history…</p>
  if (!history.length) return <p className="ph-empty">No plans yet. Each time the planners run, after a twist card, a shock you mention to Pulp or a change to your goals, the result is kept here so you can see what moved.</p>
  return (
    <div className="ph">
      {preview && <p className="small muted">Preview history: the plan history endpoint is not answering yet.</p>}
      <PlanScoreChart history={history} />
      <ol className="ph-list">
        {(all ? history : history.slice(0, 6)).map((e) => (
          <li key={e.id} className={`ph-item ${e.plan_mode}`}>
            <div className="ph-meta">
              <b>{when(e.at)}</b>
              <span className={`ph-mode ${e.plan_mode}`}>{MODE[e.plan_mode]?.label ?? e.plan_mode}</span>
              <span>{e.trigger}</span>
              {e.plan_mode === 'shock' && e.shock_label && <span>· {e.shock_label}</span>}
              <span>· profile v{e.profile_version}</span>
            </div>
            <div className="ph-chips">
              {e.finalists.map((f) => {
                const r = ROLE[roleOf(f.role)]
                return <span key={f.role + f.name} className="ph-chip" style={{ ['--role' as string]: r.color }} title={`${f.role_label}: ${f.name}`}><b style={{ color: r.color }}>{r.short}</b><span>{f.name}</span><b>{Math.round(f.score * 100)}</b></span>
              })}
            </div>
            {e.changed.length > 0 && <ul className="ph-changed">{e.changed.map((c) => <li key={c}>{c}</li>)}</ul>}
          </li>
        ))}
      </ol>
      {history.length > 6 && <button type="button" className="lp-btn" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show ${history.length - 6} earlier runs`}</button>}
    </div>
  )
}
