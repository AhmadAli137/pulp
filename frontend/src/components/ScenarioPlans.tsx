import type { ShockReport } from '../services/api'
import { Card, KV, fmt } from './ui'
import ExplainButton from './ExplainButton'
import './scenario.css'

export default function ScenarioPlans({ report, responseFirst }: { report: ShockReport; responseFirst: boolean }) {
  const { goal_plan: goal, backup_plan: backup, verdict } = report
  const months = verdict.horizon_months
  const a = report.applied_inputs
  const sp = { r: a.income_fraction, h: a.bills_increase, o: a.one_off_cost, d: a.horizon_months }
  const prepare = (
    <Card title="Prepare now" right={<ExplainButton topic="prepare_now" label="Prepare now" shock={sp} />}>
      <p className="scenario-intro">Build an emergency fund for {months} {months === 1 ? 'month' : 'months'} of this shock.</p>
      <KV rows={[
        ['Cash target', fmt.money(goal.cash_needed, 2)],
        ['Estimated cash on hand', fmt.money(goal.current_buffer, 2)],
        ['Still to save', <strong className="scenario-amount">{fmt.money(goal.additional_buffer_needed, 2)}</strong>],
        [goal.capacity_to_save_per_month < 0 ? 'Typical monthly shortfall' : 'Typical amount left each month', fmt.money(Math.abs(goal.capacity_to_save_per_month), 2)],
        ['Time to reach the target', goal.months_to_target == null ? (goal.reachable_from_surplus ? 'Target covered' : 'Needs a monthly surplus') : `${fmt.num(goal.months_to_target)} months`],
      ]} />
      <p className="scenario-action">
        {goal.additional_buffer_needed === 0
          ? 'Keep this money available for the expenses in your shock.'
          : goal.capacity_to_save_per_month > 0
            ? 'Check how much you can actually set aside each month after regular expenses, then use that amount to build your fund.'
            : 'Start by finding a way to cover regular expenses. Once money is left over each month, you can build toward the target.'}
      </p>
    </Card>
  )
  const respond = (
    <Card title="If it happens" right={<ExplainButton topic="if_it_happens" label="If it happens" shock={sp} />}>
      <p className="scenario-intro">Check what you need today, then plan for the months ahead.</p>
      <KV rows={[
        ['Extra cash needed today', <strong className="scenario-amount">{fmt.money(backup.immediate_need, 2)}</strong>],
        ['Cash available after the upfront cost', fmt.money(Math.max(0, backup.buffer_left), 2)],
        ['Monthly shortfall before changes', fmt.money(backup.recurring_gap, 2)],
        [`Free up each month to cover ${months} ${months === 1 ? 'month' : 'months'}`, fmt.money(backup.monthly_improvement_needed, 2)],
        ['Total shortfall if nothing changes', fmt.money(backup.unresolved_gap_over_horizon, 2)],
      ]} />
      <p className="scenario-action">
        {backup.immediate_need > 0
          ? 'Cover the upfront gap first. List the bills due before your next confirmed income and check which expenses can wait.'
          : backup.recurring_gap > 0
            ? 'Protect essentials first. Check what you could actually free up or bring in each month before committing cash to extras.'
            : 'Income covers regular spending in this scenario. Recheck the plan if income or essential costs change.'}
      </p>
    </Card>
  )

  return (
    <section id="resilience-plans" className="stack" aria-label="Resilience plans">
      <div className="grid cols-2">{responseFirst ? <>{respond}{prepare}</> : <>{prepare}{respond}</>}</div>
      <p className="small muted">The cash estimate comes from recent account balances. Use the cash and regular expenses you can verify before acting on either plan.</p>
    </section>
  )
}
