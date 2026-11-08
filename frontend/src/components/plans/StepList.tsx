/* A plan as a short numbered list a person can act on: what to do, when, and what it is worth. */
import type { LifePlan } from '../../services/api'
import { CATEGORY, dollars } from './palette'

function when(start: number, end: number, horizon: number, longTerm: boolean): string {
  const m = (n: number) => (longTerm && n >= 12 ? (n % 12 === 0 ? `year ${n / 12}` : `month ${n}`) : `month ${n}`)
  if (start <= 1 && end >= horizon) return 'From now on'
  if (start <= 1) return `Now until ${m(end)}`
  if (end >= horizon) return `From ${m(start)}`
  if (start === end) return `In ${m(start)}`
  return `${m(start)[0].toUpperCase()}${m(start).slice(1)} to ${m(end)}`
}

function worth(monthly: number, once: number, category: string): string {
  const parts: string[] = []
  const verb = monthly < 0 ? 'costs' : category === 'income' ? 'adds' : category === 'spending' || category === 'debt' || category === 'timing' ? 'saves' : 'frees'
  if (monthly) parts.push(`${verb} about ${dollars(Math.abs(monthly)).replace('−', '')} a month`)
  if (once) parts.push(`${once > 0 ? 'brings in' : 'costs'} about ${dollars(Math.abs(once)).replace('−', '')} once`)
  return parts.join(', ')
}

export default function StepList({ plan, horizon, longTerm }: { plan: LifePlan; horizon: number; longTerm: boolean }) {
  if (!plan.steps.length) return <p className="lp-steps-empty">Keep living as you do now. This is the plan every other plan is measured against.</p>
  const steps = [...plan.steps].sort((a, b) => a.month_start - b.month_start)
  return (
    <ol className="lp-steps">
      {steps.map((s, i) => {
        const cat = CATEGORY[s.category] ?? CATEGORY.spending
        const reason = plan.reasoning?.find((r) => r.step === plan.steps.indexOf(s) + 1)
        return (
          <li key={`${s.decision}-${i}`}>
            <span className="lp-step-num" style={{ background: cat.color }} aria-hidden="true">{i + 1}</span>
            <div>
              <p className="lp-step-title"><b>{s.title}</b> <span className="lp-step-when">{when(s.month_start, s.month_end, horizon, longTerm)}</span></p>
              <p className="lp-step-detail">{s.detail}{!s.detail.includes('$') && worth(s.monthly_effect, s.one_off, s.category) ? ` It ${worth(s.monthly_effect, s.one_off, s.category)}.` : ''}</p>
              {reason && <p className="lp-step-why">Why this step: {reason.because} {reason.moves && reason.moves !== 'small effect on its own' ? <>It moves {reason.moves}.</> : null}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** One sentence on what following the plan leads to. */
export function outcomeLine(plan: LifePlan, horizon: number, longTerm: boolean): string {
  const o = plan.outcome
  const cash = `${dollars(o.end_cash)} in the account after ${longTerm ? `${Math.round(horizon / 12)} years` : `${horizon} months`}`
  const lead = plan.survives === false && plan.first_short_month ? `Money still runs short in month ${plan.first_short_month}` : 'No month runs short'
  const goals = o.goals.length ? `; goals ${Math.round(plan.components.goals * 100)}% of the way` : ''
  return `${lead}; ${cash}${goals}.`
}
