import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import ScenarioPlans from '../components/ScenarioPlans'
import ThreadFigure from '../components/stage/ThreadFigure'
import '../components/twist-deck.css'
import { Card, ErrorBox, fmt } from '../components/ui'
import { matchesShockInputs, type Beat, type PlanResult } from '../services/api'
import { useApp } from '../stores/useApp'

export default function Plan() {
  const { accountId, profile, shock, shockInputs, shockHasHappened, shockLoading, shockError, activePlan, planStale } = useApp()
  if (!profile) return <DemoAccountPicker />

  if (shockLoading || !matchesShockInputs(shock, accountId, shockInputs)) {
    return (
      <Card title="Plan for a shock">
        <p>{shockLoading ? 'Calculating your plan…' : 'Run a shock to get a preparation plan and a backup plan based on your account.'}</p>
        <ErrorBox msg={shockError} />
        <p><Link to="/shock">Go to Shocks</Link></p>
      </Card>
    )
  }

  const inputs = shock.applied_inputs
  const months = inputs.horizon_months
  return (
    <div className="stack">
      <Card title="Your current scenario" right={<Link to="/shock">Change shock</Link>}>
        <p>{months} {months === 1 ? 'month' : 'months'} with <strong className="scenario-amount">{fmt.money(shock.shocked.income_after, 2)}</strong> coming in each month,
          <strong className="scenario-amount"> {fmt.money(shock.shocked.spending_after, 2)}</strong> in regular monthly spending,
          and <strong className="scenario-amount">{fmt.money(inputs.one_off_cost, 2)}</strong> in upfront costs.</p>
        {shockHasHappened && <p className="small muted">You marked this shock as already happened. Your backup plan comes first.</p>}
      </Card>
      <ScenarioPlans report={shock} responseFirst={shockHasHappened} />
      {activePlan && !planStale && activePlan.account_id === accountId && (
        <Card title="What you could actually do" className="scenario-figure" right={<Link to="/shock">Compare again</Link>}>
          <ThreadFigure beat={actionsBeat(activePlan)} />
          <p className="small muted">Ranked by the planning council for the shock you compared. Every number is from the engine.</p>
        </Card>
      )}
    </div>
  )
}

function actionsBeat(plan: PlanResult): Beat {
  const stay = plan.stay_the_course?.prob_shortfall_under_stress
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const actions = plan.ranked.filter((c) => c.label !== plan.stay_the_course?.label).slice(0, 3).map((c) => ({
    title: c.action ?? c.label, how: c.how ?? c.means ?? '', horizon: 'this month' as const,
    effect: stay != null ? `shortfall risk ${pct(stay)} → ${pct(c.prob_shortfall_under_stress)}` : `shortfall risk ${pct(c.prob_shortfall_under_stress)}`,
    source: c.source,
  }))
  return { id: `actions-${plan.account_id}`, visual: 'actions', caption: '', duration_s: 0, params: { headline: 'What you could actually do', actions } }
}
