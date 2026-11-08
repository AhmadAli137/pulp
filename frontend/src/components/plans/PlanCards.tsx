/* The four finalists as cards labelled by role, the plans that fall short for comparison, and the weight sliders
   ("What matters most to you") that re-rank every candidate client-side. */
import { AlertTriangle } from 'lucide-react'
import type { LifePlan, LifePlanResult } from '../../services/api'
import { Tangerine } from '../PulpMascot'
import { CATEGORY, ROLE, pct, roleOf } from './palette'

export type UserWeights = { shortfall: number; resilience: number; goals: number }

function Bars({ c, longTerm }: { c: LifePlan['components']; longTerm: boolean }) {
  const rows: [string, number, boolean][] = [
    ...(!longTerm && c.shortfall != null ? [['Gap covered', c.shortfall, false] as [string, number, boolean]] : []),
    ['Cushion', c.resilience, false], ['Goals', c.goals, false], ['Disruption', c.disruption, true],
  ]
  return (
    <dl className="lp-comp">
      {rows.map(([k, v, bad]) => (
        <div key={k}><dt>{k}</dt><dd><span className={`lp-comp-bar ${bad ? 'bad' : ''}`}><i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} /></span><b>{pct(v)}</b></dd></div>
      ))}
    </dl>
  )
}

export function FinalistCards({ plans, selectedId, onSelect, userBestId, longTerm }: {
  plans: LifePlan[]; selectedId: string; onSelect: (id: string) => void; userBestId?: string | null; longTerm: boolean
}) {
  return (
    <div className="lp-cards" role="group" aria-label="Finalist plans">
      {plans.map((p) => {
        const role = ROLE[roleOf(p.role)]
        const on = p.id === selectedId
        const balance = p.role === 'best_tradeoff'
        const cats = [...new Set(p.steps.map((s) => s.category))]
        return (
          <button key={p.id} type="button" className={`lp-card ${on ? 'on' : ''} ${balance ? 'balance' : ''}`} aria-pressed={on} onClick={() => onSelect(p.id)} style={{ ['--role' as string]: role.color }}>
            <span className="lp-card-mood" aria-hidden="true"><Tangerine mood={p.survives === false ? 'concerned' : 'celebrate'} label="" /></span>
            <span className="lp-role">{p.role_label ?? role.label}</span>
            {userBestId === p.id && !balance && <span className="lp-tag">best for your weights</span>}
            <strong className="lp-card-name">{p.name}</strong>
            <span className="lp-card-cats" aria-label="Kinds of steps">{cats.map((k) => { const C = CATEGORY[k]; return <span key={k} className="lp-cat-dot" style={{ background: C.color }} title={C.label}><C.Icon size={11} color="#fff" aria-hidden="true" /></span> })}</span>
            <span className="lp-card-summary" title={p.summary}>{p.summary}</span>
            <span className="lp-card-score"><b>{Math.round(p.score * 100)}</b> score{p.survives === false ? ' · runs short' : ''}</span>
            <Bars c={p.components} longTerm={longTerm} />
            {p.flags.length > 0 && <span className="lp-card-flags">{p.flags.map((f) => <span key={f.risk} title={f.because}><AlertTriangle size={11} aria-hidden="true" /> {f.risk}</span>)}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function FallsShort({ plans, onSelect, selectedId }: { plans: LifePlan[]; onSelect?: (id: string) => void; selectedId?: string }) {
  if (!plans.length) {
    return <p className="lp-allgood"><span className="lp-allgood-mark" aria-hidden="true"><Tangerine mood="celebrate" label="" /></span>Every plan we tried makes it through this shock.</p>
  }
  return (
    <div className="lp-short-row">
      {plans.map((p) => (
        <button key={p.id} type="button" className={`lp-short ${selectedId === p.id ? 'on' : ''}`} onClick={() => onSelect?.(p.id)} aria-pressed={selectedId === p.id}>
          <span className="lp-card-mood" aria-hidden="true"><Tangerine mood="concerned" label="" /></span>
          <strong>{p.name}</strong>
          <span className="lp-short-when">{p.first_short_month != null ? `Runs short in month ${p.first_short_month}` : 'Runs short'}</span>
          {p.fails_because && <span className="lp-short-why">{p.fails_because}</span>}
        </button>
      ))}
    </div>
  )
}

export function WeightSliders({ value, onChange, stated, longTerm, onReset }: {
  value: UserWeights; onChange: (w: UserWeights) => void; stated: UserWeights; longTerm: boolean; onReset: () => void
}) {
  const rows: [keyof UserWeights, string, string][] = [
    ...(!longTerm ? [['shortfall', 'Covering the gap', 'Paying every bill while the shock lasts'] as [keyof UserWeights, string, string]] : []),
    ['resilience', 'Cushion', 'Cash left to absorb the next surprise'],
    ['goals', 'Goals', 'Progress toward your goals by their dates'],
  ]
  const total = rows.reduce((a, [k]) => a + value[k], 0) || 1
  return (
    <fieldset className="lp-weights">
      <legend>What matters most to you</legend>
      {rows.map(([k, label, hint]) => (
        <label key={k} className="lp-slider">
          <span className="lp-slider-head"><b>{label}</b><output>{Math.round((value[k] / total) * 100)}%</output></span>
          <input type="range" min={0} max={100} step={5} value={Math.round(value[k] * 100)} aria-describedby={`w-${k}`}
            onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) / 100 })} />
          <small id={`w-${k}`}>{hint} · agents used {Math.round((stated[k] / (rows.reduce((a, [kk]) => a + stated[kk], 0) || 1)) * 100)}%</small>
        </label>
      ))}
      <button type="button" className="lp-btn ghost" onClick={onReset}>Reset to the agents’ weights</button>
    </fieldset>
  )
}

export const statedWeights = (r: LifePlanResult): UserWeights => ({
  shortfall: r.objective.weights.shortfall ?? (r.plan_mode === 'long_term' ? 0 : 0.3),
  resilience: r.objective.weights.resilience, goals: r.objective.weights.goals,
})
