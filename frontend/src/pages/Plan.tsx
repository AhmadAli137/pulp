import { useState } from 'react'
import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import LifePlansView from '../components/plans/LifePlansView'
import PlanHistory from '../components/plans/PlanHistory'
import { useLifePlans, usePlanHistory } from '../components/plans/usePlanData'
import { SqueezeLoader } from '../components/PulpMascot'
import ScenarioPlans from '../components/ScenarioPlans'
import '../components/twist-deck.css'
import { Card, ErrorBox, fmt } from '../components/ui'
import { matchesShockInputs } from '../services/api'
import { PRESETS, useApp } from '../stores/useApp'

type Tab = 'long' | 'shock'

export default function Plan() {
  const { accountId, profile, shock, shockInputs, shockHasHappened, shockLoading, shockError } = useApp()
  const ready = !shockLoading && matchesShockInputs(shock, accountId, shockInputs)
  const [tab, setTab] = useState<Tab | null>(null)
  const active: Tab = tab ?? (ready ? 'shock' : 'long')
  const longTerm = useLifePlans(accountId, { mode: 'long_term', trigger: 'Opened My Plan' }, !!profile && active === 'long')
  const shockPlans = useLifePlans(accountId, { mode: 'shock', inputs: shockInputs, happened: shockHasHappened, label: (shock?.applied_inputs.preset && PRESETS[shock.applied_inputs.preset]?.label) || 'This shock', trigger: 'Opened My Plan' }, !!profile && ready && active === 'shock')
  const history = usePlanHistory(profile ? accountId : null, `${longTerm.result?.recommended ?? ''}|${shockPlans.result?.recommended ?? ''}`)
  if (!profile) return <DemoAccountPicker />

  return (
    <div className="stack">
      {ready && shock && (
        <Card title="Your current scenario" right={<Link to="/shock">Change shock</Link>}>
          <p>{shock.applied_inputs.horizon_months} {shock.applied_inputs.horizon_months === 1 ? 'month' : 'months'} with <strong className="scenario-amount">{fmt.money(shock.shocked.income_after, 2)}</strong> coming in each month,
            <strong className="scenario-amount"> {fmt.money(shock.shocked.spending_after, 2)}</strong> in regular monthly spending,
            and <strong className="scenario-amount">{fmt.money(shock.applied_inputs.one_off_cost, 2)}</strong> in upfront costs.</p>
          {shockHasHappened && <p className="small muted">You marked this shock as already happened. Your backup plan comes first.</p>}
        </Card>
      )}

      <div className="plan-tabs" role="tablist" aria-label="Which plan">
        <button type="button" role="tab" aria-selected={active === 'long'} className={active === 'long' ? 'on' : ''} onClick={() => setTab('long')}>Long term</button>
        <button type="button" role="tab" aria-selected={active === 'shock'} className={active === 'shock' ? 'on' : ''} onClick={() => setTab('shock')}>If a shock hits</button>
      </div>

      {active === 'long' && (
        <Card title="Your long-term plan" className="plan-card">
          <p className="scenario-intro">Five years with no shock: the same search over the same real decisions, aimed mainly at your goals and your cushion.</p>
          {longTerm.result ? <LifePlansView key={`lt-${longTerm.result.account_id}`} result={longTerm.result} /> : <SqueezeLoader label="Squeezing five years of options from your records…" />}
        </Card>
      )}

      {active === 'shock' && (ready && shock ? (
        <>
          <ScenarioPlans report={shock} responseFirst={shockHasHappened} />
          <Card title="Plans for this shock" className="plan-card" right={<Link to="/shock">Compare again</Link>}>
            {shockPlans.result ? <LifePlansView key={`s-${JSON.stringify(shockPlans.result.shock)}`} result={shockPlans.result} /> : <SqueezeLoader label="Squeezing plans out of your records…" />}
          </Card>
        </>
      ) : (
        <Card title="Plan for a shock">
          <p>{shockLoading ? 'Calculating your plan…' : 'Run a shock to get a preparation plan, a backup plan and multi-step plans for getting through it.'}</p>
          <ErrorBox msg={shockError} />
          <p><Link to="/shock">Go to Shocks</Link></p>
        </Card>
      ))}

      <Card title="How your plans changed">
        <p className="scenario-intro">Every time the planners run, after a twist card, a shock you mention to Pulp or a change to your goals, the four finalists are kept here.</p>
        <PlanHistory history={history.history} preview={!history.live && history.history != null} />
      </Card>
    </div>
  )
}
