/* Where you stand: one bullet bar per goal (target = full bar, saved by the deadline = fill, today's course = thin
   marker) and a cushion row (months of the shock covered, lowest cash). Every bar carries its numbers. */
import type { LifePlan } from '../../services/api'
import { dollars, monthLabel, pct } from './palette'

export default function StandingPanel({ plan, baseline, shockMonths, longTerm = false, compact = false, sMonthly }: {
  plan: LifePlan; baseline: LifePlan; shockMonths: number; longTerm?: boolean; compact?: boolean; sMonthly?: number
}) {
  const o = plan.outcome, b = baseline.outcome
  // goal ids can repeat (two goals of one type), so pair goals with today's course by position
  const goals = o.goals.map((g, i) => ({ g, bg: b.goals[i]?.label === g.label ? b.goals[i] : b.goals.find((x) => x.label === g.label) })).sort((x, y) => y.g.weight - x.g.weight)
  const cushion = !longTerm && shockMonths > 0 && (
    <div className="lp-stand-row lp-stand-cushion">
      <div className="lp-stand-head">
        <strong>Months of the shock covered</strong>
        <span className="lp-stand-num">{o.months_covered} of {shockMonths}</span>
      </div>
      <div className="lp-bullet" role="img" aria-label={`${o.months_covered} of ${shockMonths} months covered; today’s course covers ${b.months_covered}`}>
        <span className="lp-bullet-fill cushion" style={{ width: `${Math.min(1, o.months_covered / shockMonths) * 100}%` }} />
        <span className="lp-bullet-mark" style={{ left: `${Math.min(1, b.months_covered / shockMonths) * 100}%` }} title={`Today’s course: ${b.months_covered}`} />
      </div>
      <p className="lp-stand-note">
        Lowest cash <b className={o.min_cash < 0 ? 'neg' : ''}>{dollars(o.min_cash)}</b>
        {' '}(today’s course {dollars(b.min_cash)}) · cash at the end <b>{dollars(o.end_cash)}</b>
        {o.shortfall_total > 0 && <> · still short <b className="neg">{dollars(o.shortfall_total)}</b></>}
      </p>
    </div>
  )
  const longCushion = longTerm && (
    <div className="lp-stand-row lp-stand-cushion">
      <div className="lp-stand-head"><strong>Cushion at {monthLabel(o.cash_path.length - 1, true)}</strong><span className="lp-stand-num">{dollars(o.end_cash)}</span></div>
      <p className="lp-stand-note">{sMonthly ? <>About <b>{(o.end_cash / sMonthly).toFixed(1)} months</b> of spending · </> : null}today’s course {dollars(b.end_cash)} · lowest cash {dollars(o.min_cash)}</p>
    </div>
  )
  return (
    <div className={`lp-stand ${compact ? 'compact' : ''}`}>
      {!longTerm && cushion}
      {goals.map(({ g, bg }, gi) => {
        const fill = Math.min(1, g.saved_at_deadline / Math.max(1, g.target))
        return (
          <div key={`${g.goal_id}-${gi}`} className="lp-stand-row">
            <div className="lp-stand-head">
              <strong>{g.label}</strong>
              <span className="lp-weight" title="Share of the goals score">weight {pct(g.weight)}</span>
              <span className="lp-stand-num">{dollars(g.saved_at_deadline)} <span className="muted">of {dollars(g.target)}</span></span>
            </div>
            <div className="lp-bullet" role="img" aria-label={`${g.label}: ${dollars(g.saved_at_deadline)} of ${dollars(g.target)} by month ${g.deadline_month} (${pct(g.progress)}); today’s course ${bg ? dollars(bg.saved_at_deadline) : 'n/a'}`}>
              <span className="lp-bullet-fill" style={{ width: `${fill * 100}%` }}><em>{pct(g.progress)}</em></span>
              {bg && <span className="lp-bullet-mark" style={{ left: `${Math.min(1, bg.saved_at_deadline / Math.max(1, g.target)) * 100}%` }} title={`Today’s course: ${dollars(bg.saved_at_deadline)}`} />}
            </div>
            {!compact && (
              <p className="lp-stand-note">
                by {monthLabel(g.deadline_month, longTerm)}{bg && g.deadline_month !== bg.deadline_month ? ` (moved from ${monthLabel(bg.deadline_month, longTerm)})` : ''} ·{' '}
                {g.reached_month != null ? <span className="ok">reached in {longTerm ? monthLabel(g.reached_month, true) : `month ${g.reached_month}`}</span> : <span className="warn">not by the deadline</span>}
                {bg && <> · today’s course {dollars(bg.saved_at_deadline)}</>}
              </p>
            )}
          </div>
        )
      })}
      {longCushion}
      {!compact && <p className="lp-stand-key"><i className="lp-key-fill" /> this plan <i className="lp-key-mark" /> today’s course <i className="lp-key-track" /> target</p>}
    </div>
  )
}
