import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ContextDoc, type HistoryRow } from '../services/api'
import { useApp } from '../stores/useApp'
import { CashFlowChart, LiquidityChart, VulnerabilityChart } from '../charts'
import { Card, Chip, DataTable, Empty, KV, Tip, fmt } from '../components/ui'

export default function Twin() {
  const { accountId, profile, accessible, refreshContext } = useApp()
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [ctx, setCtx] = useState<ContextDoc | null>(null)
  const [vuln, setVuln] = useState<{ name: string; runway: number | null; label: string }[]>([])

  useEffect(() => {
    if (!accountId) return
    api.history(accountId).then((h) => setHistory(h.history)).catch(() => undefined)
    api.context(accountId).then((c) => setCtx(c.context)).catch(() => undefined)
    const shocks = [
      { name: 'Baseline', body: { income_fraction: 1, bills_increase: 0, one_off_cost: 0 } },
      { name: 'Layoff, EI 55%', body: { preset: 'layoff' } },
      { name: 'Bills up 15%', body: { income_fraction: 1, bills_increase: 0.15, one_off_cost: 0 } },
      { name: 'Furnace repair', body: { preset: 'furnace' } },
      { name: 'Layoff + bills 15%', body: { preset: 'combined' } },
      { name: 'Income to 70%', body: { income_fraction: 0.7, bills_increase: 0, one_off_cost: 0 } },
    ]
    Promise.all(shocks.map((s) => api.shock({ account_id: accountId, ...s.body }).then((r) => ({ name: s.name, runway: r.shocked.runway, label: r.shocked.runway_label })))).then(setVuln).catch(() => undefined)
  }, [accountId])

  if (!profile || !accountId) return <Empty>Select an account first.</Empty>

  const remove = async (field: string, id: string) => {
    await api.edit(accountId, { field, operation: 'remove', value: {}, target_id: id }, true)
    await useApp.getState().refreshSession()
    const c = await api.context(accountId)
    setCtx(c.context)
    void refreshContext()
  }
  const item = (field: string, items: ContextDoc['goals']) => items.map((it) => (
    <div key={it.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid #eef2ef' }}>
      <div>
        <span className="strong">{String(it.value.label ?? it.value.type ?? it.value.choice ?? '')}</span>
        <span className="small muted"> {Object.entries(it.value).filter(([k]) => !['label', 'type'].includes(k)).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'number' && k.includes('amount') ? fmt.money(v) : String(v)}`).join(' · ')}</span>
        <div className="tiny muted">{it.source.replace(/_/g, ' ')} · {it.confirmed ? 'confirmed' : 'unconfirmed'} · {new Date(it.updated_at).toLocaleString()}</div>
      </div>
      <button className="btn ghost sm danger" onClick={() => remove(field, it.id)} aria-label={`Delete ${field} item`}>Delete</button>
    </div>
  ))
  const inflow = Object.entries(profile.inflow_mix).sort((a, b) => b[1] - a[1])
  const outflow = Object.entries(profile.outflow_mix).sort((a, b) => b[1] - a[1])
  const totalIn = inflow.reduce((s, [, v]) => s + v, 0) || 1
  const totalOut = outflow.reduce((s, [, v]) => s + v, 0) || 1

  return (
    <div className="stack">
      <div className="grid cols-2">
        <Card title={<span className="obs">From your account records</span>} right={<Chip>Recorded history</Chip>}>
          <KV rows={[
            ['Money coming in each month', fmt.money(profile.typical_inflow)], ['Money going out each month', fmt.money(profile.typical_spending)],
            ['Regular commitments', fmt.money(profile.typical_fixed_costs)], ['Household bills', fmt.money(profile.household_bills)],
            ['Insurance (median)', fmt.money(profile.typical_insurance)], ['Loan payments (median)', fmt.money(profile.typical_loan_payments)],
            ['Buffer B', fmt.money(profile.buffer)], ['Active loan payment P', fmt.money(profile.active_loan_payment)],
            ['Income variability (CV)', fmt.num(profile.income_cv, 2)], ['Spending ÷ income', fmt.pct(profile.spending_ratio)],
            ['Days ending below zero (all history)', fmt.int(profile.observed_negative_balance_days)], ['Lowest balance ever', fmt.money(profile.observed_min_balance)],
          ]} />
          {profile.loan && <p className="small muted" style={{ marginTop: 10 }}>Loan {profile.loan.loan_id}: {fmt.money(profile.loan.amount)} over {profile.loan.duration_months} months, {fmt.money(profile.loan.monthly_payment)}/mo, started {profile.loan.loan_start}, status {profile.loan.status} ({profile.loan.status_meaning}).</p>}
          {profile.standing_orders.length > 0 && <p className="small muted" style={{ marginTop: 6 }}>Standing orders (snapshot): {profile.standing_orders.map((s) => `${s.purpose} ${fmt.money(s.amount)}`).join(', ')}.</p>}
        </Card>
        <Card title={<span className="ctx">Personal context (what you told PULP)</span>} right={<Chip tone="gold">confirmed by you · v{ctx?.context_version ?? 1}</Chip>}>
          {!ctx || (ctx.goals.length + ctx.concerns.length + ctx.constraints.length + ctx.preferences.length + ctx.upcoming_events.length === 0) ? (
            <p className="small muted">Nothing confirmed yet. The default plan assumes an emergency-fund goal and an income-loss stress. <Link to="/companion">Talk to the companion</Link> to add goals, worries and constraints.</p>
          ) : (
            <div className="stack">
              {ctx.goals.length > 0 && <div><h3>Goals</h3>{item('goals', ctx.goals)}</div>}
              {ctx.concerns.length > 0 && <div><h3>Concerns</h3>{item('concerns', ctx.concerns)}</div>}
              {ctx.constraints.length > 0 && <div><h3>Constraints</h3>{item('constraints', ctx.constraints)}</div>}
              {ctx.preferences.length > 0 && <div><h3>Preferences</h3>{item('preferences', ctx.preferences)}</div>}
              {ctx.upcoming_events.length > 0 && <div><h3>Upcoming events</h3>{item('upcoming_events', ctx.upcoming_events)}</div>}
            </div>
          )}
          <p className="tiny muted" style={{ marginTop: 10 }}>{ctx?.identity_note ?? 'Context is supplied by whoever speaks for this anonymized account.'}</p>
          {ctx?.strategy_snapshots?.length ? <p className="tiny muted">Recent updates: {ctx.strategy_snapshots.slice(-3).map((s) => `${new Date(s.at).toLocaleTimeString()} ${s.trigger ?? ''}`).join(' · ')}</p> : null}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title={<>Historical cash flow <Tip text="Monthly money_in and money_out from the summary file. Dashed lines are the medians I and S." /></>}>
          {history.length > 0 && <CashFlowChart history={history} I={profile.typical_inflow} S={profile.typical_spending} />}
        </Card>
        <Card title={<>Historical liquidity <Tip text="Average and minimum end-of-day balance by month. The dashed line is the official buffer B." /></>}>
          {history.length > 0 && <LiquidityChart history={history} B={profile.buffer} />}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title={<>Financial vulnerability <Tip text="Official runway under several shocks. Bars past the 6-month line survive a six-month horizon." /></>}>
          {vuln.length > 0 && <VulnerabilityChart rows={vuln} />}
          {accessible && <DataTable headers={['Shock', 'Runway']} rows={vuln.map((v) => [v.name, v.label])} />}
        </Card>
        <Card title="Where the money comes from and goes (all months)">
          <div className="grid cols-2">
            <div>
              <h3 className="small muted">Inflow mix</h3>
              <DataTable headers={['Source', 'Share']} rows={inflow.map(([k, v]) => [k.replace(/_/g, ' '), fmt.pct(v / totalIn)])} />
            </div>
            <div>
              <h3 className="small muted">Outflow mix</h3>
              <DataTable headers={['Use', 'Share']} rows={outflow.map(([k, v]) => [k.replace(/_/g, ' '), fmt.pct(v / totalOut)])} />
            </div>
          </div>
        </Card>
      </div>

      {accessible && history.length > 0 && (
        <Card title="Monthly history table">
          <div style={{ maxHeight: 320, overflow: 'auto' }}>
            <DataTable headers={['Month', 'In', 'Out', 'Bills', 'Avg balance', 'Min balance', 'Days < 0']} rows={history.map((h) => [h.month, fmt.money(h.money_in), fmt.money(h.money_out), fmt.money(h.household_bills), fmt.money(h.avg_daily_balance), fmt.money(h.min_balance), h.days_below_zero])} />
          </div>
        </Card>
      )}
    </div>
  )
}
