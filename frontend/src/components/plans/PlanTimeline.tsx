/* How you get there: one bar per step across the months (or years), coloured by category with its icon, the shock
   window shaded, the monthly effect on each bar, and the agents' reasoning for each step underneath. */
import type { LifePlan } from '../../services/api'
import { CATEGORY, effectLabel, monthLabel, monthTicks } from './palette'

export default function PlanTimeline({ plan, horizon, shock, longTerm = false, compact = false }: {
  plan: LifePlan; horizon: number; shock?: { start: number; duration: number } | null; longTerm?: boolean; compact?: boolean
}) {
  const at = (m: number) => `${(Math.max(0, Math.min(horizon, m)) / horizon) * 100}%`
  const ticks = monthTicks(horizon, longTerm)
  const minor = longTerm ? Array.from({ length: Math.floor(horizon / 6) + 1 }, (_, i) => i * 6) : []
  const reasons = new Map((plan.reasoning ?? []).map((r) => [r.step, r]))
  const shockEnd = shock ? shock.start + shock.duration - 1 : 0
  if (!plan.steps.length) return <p className="lp-empty">This plan changes nothing: the months play out as they are.</p>
  return (
    <div className={`lp-gantt ${compact ? 'compact' : ''}`} role="table" aria-label={`Steps in ${plan.name}`}>
      <div className="lp-gantt-rows">
        {shock && shock.duration > 0 && (
          <div className="lp-gantt-shock" style={{ left: `calc(var(--lp-label) + 12px + (100% - var(--lp-label) - 12px) * ${shock.start / horizon})`, width: `calc((100% - var(--lp-label) - 12px) * ${Math.min(shock.duration, horizon - shock.start) / horizon})` }} aria-hidden="true">
            <span>shock · {monthLabel(shock.start, longTerm)}–{monthLabel(shockEnd, longTerm)}</span>
          </div>
        )}
        {plan.steps.map((s, i) => {
          const cat = CATEGORY[s.category] ?? CATEGORY.goal
          const point = s.month_end <= s.month_start
          const eff = effectLabel(s)
          const reason = reasons.get(i + 1)
          const span = point ? `month ${s.month_start}` : `${monthLabel(s.month_start, longTerm)} to ${monthLabel(s.month_end, longTerm)}`
          return (
            <div key={`${s.decision}-${i}`} className="lp-gantt-row" role="row">
              <div className="lp-gantt-label" role="rowheader">
                <span className="lp-cat-dot" style={{ background: cat.color }} title={cat.label}><cat.Icon size={12} color="#fff" aria-hidden="true" /></span>
                <span><strong>Step {i + 1} · {s.title}</strong>{!compact && <small>{s.detail}</small>}</span>
              </div>
              <div className="lp-gantt-track" role="cell" aria-label={`${cat.label}, ${span}${eff ? `, ${eff}` : ''}`}>
                {point
                  ? <span className="lp-gantt-point" style={{ left: at(s.month_start), background: cat.color }} />
                  : <span className="lp-gantt-bar" style={{ left: at(s.month_start), width: `calc(${at(s.month_end + 1)} - ${at(s.month_start)})`, background: cat.color }} />}
                {eff && <span className="lp-gantt-eff" style={{ left: `min(calc(${at(s.month_start)} + ${point ? 14 : 6}px), calc(100% - 9em))` }}>{eff}</span>}
              </div>
              {!compact && reason && (
                <p className="lp-gantt-why" role="cell">
                  <b>because</b> {reason.because} <span aria-hidden="true">·</span> <b>evidence</b> {reason.evidence} <span aria-hidden="true">·</span> <b>moves</b> {reason.moves}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <div className="lp-gantt-axis" aria-hidden="true">
        <div />
        <div className="lp-gantt-ticks">
          {minor.map((m) => <i key={`n${m}`} className="minor" style={{ left: at(m) }} />)}
          {ticks.map((m) => <span key={m} style={{ left: at(m) }}>{monthLabel(m, longTerm)}</span>)}
        </div>
      </div>
      <p className="lp-gantt-axis-title">{longTerm ? 'Years from now' : 'Months from now'}</p>
    </div>
  )
}
