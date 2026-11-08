import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import ScenarioPlans from '../components/ScenarioPlans'
import { Card, ErrorBox, fmt } from '../components/ui'
import { matchesShockInputs } from '../services/api'
import { useApp } from '../stores/useApp'

export default function Plan() {
  const { accountId, profile, shock, shockInputs, shockHasHappened, shockLoading, shockError } = useApp()
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
    </div>
  )
}
