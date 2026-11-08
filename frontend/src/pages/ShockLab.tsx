import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type SampleAccount } from '../services/api'
import { useApp } from '../stores/useApp'
import ShockPanel from '../components/ShockPanel'
import CouncilPanel from '../components/CouncilPanel'
import ProfileInsights from '../components/ProfileInsights'
import ShockCards from '../components/ShockCards'
import { Card, Chip, Empty, Spinner, Tile, fmt } from '../components/ui'

/* The judge's exact-input calculator: baseline tiles, twist controls, verdict, plans. */
export default function ShockLab() {
  const { profile, loadAccount, loadingProfile, context, lastReplan } = useApp()
  const [samples, setSamples] = useState<SampleAccount[]>([])
  const [range, setRange] = useState<[number, number] | null>(null)
  useEffect(() => { api.samples().then((s) => { setSamples(s.accounts); setRange(s.id_range) }).catch(() => undefined) }, [])

  if (!profile) {
    return (
      <Card title="Pick an account to begin" right={range && <span className="small muted">IDs {range[0]} to {range[1]} in accounts.csv</span>}>
        {loadingProfile ? <Empty><Spinner /> Loading account…</Empty> : samples.length === 0 ? <Empty>Enter any account_id in the top-right box.</Empty> : (
          <div className="grid cols-3">
            {samples.map((s) => (
              <button key={s.account_id} className="branch" onClick={() => loadAccount(s.account_id)}>
                <div className="row between"><span className="t">Account {s.account_id}</span><Chip tone={s.tag === 'random' ? 'gray' : 'gold'}>{s.tag}</Chip></div>
                <div className="m">In {fmt.money(s.I)} · Out {fmt.money(s.S)} · Buffer {fmt.money(s.B)} · {s.months} months{s.has_active_loan ? ' · active loan' : ''}</div>
              </button>
            ))}
          </div>
        )}
      </Card>
    )
  }

  const goal = context?.goals?.[0] as { label?: string; target_months?: number } | undefined
  const concern = context?.concerns?.[0] as { label?: string } | undefined
  const trend = profile.buffer_rows.length >= 2 ? profile.buffer_rows[profile.buffer_rows.length - 1].avg_daily_balance - profile.buffer_rows[0].avg_daily_balance : null

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          <h2>Account {profile.account_id}</h2>
          <Chip tone="gray">{profile.months_available} months · {profile.first_month} to {profile.last_month}</Chip>
          {profile.account.district_name && <Chip tone="outline">{profile.account.district_name}, {profile.account.region}</Chip>}
          {profile.loan && <Chip tone={profile.loan.running_end_2025 ? 'gold' : 'gray'}>loan {profile.loan.running_end_2025 ? 'running' : 'finished'}</Chip>}
        </div>
        <span className="tiny muted">Observed records from monthly_summary.csv · {profile.data_note}</span>
      </div>
      <div className="grid cols-5">
        <Tile label="Typical monthly inflow" value={fmt.money(profile.typical_inflow)} sub={`I · median money_in · P${Math.round(profile.population_percentiles.typical_inflow)}`} tip="Median of monthly money_in across all months. Includes deposits, transfers, pensions and interest, not only wages." />
        <Tile label="Typical spending" value={fmt.money(profile.typical_spending)} sub={`S · median money_out · ${fmt.pct(profile.spending_ratio)} of inflow`} tip="Median of monthly money_out. Fixed costs are already inside this number." />
        <Tile label="Fixed costs" value={fmt.money(profile.typical_fixed_costs)} sub={`F · bills ${fmt.money(profile.household_bills)} · loan ${fmt.money(profile.active_loan_payment)}`} tip="Median of (household_bills + insurance + loan_payments) per month. Shown for understanding; not added again in runway. Active loan payment P from loans.csv if the loan is still running." />
        <Tile label="Cash buffer" value={fmt.money(profile.buffer)} sub={`B · last ${profile.buffer_months_used} months · P${Math.round(profile.population_percentiles.buffer)}`} tip="Mean of avg_daily_balance over the last six monthly rows, sorted by month, quiet months included." />
        <Tile accent label="Baseline runway" value={profile.baseline_runway_label === 'no shortfall (120+)' ? 'No shortfall' : `${profile.baseline_runway_label} mo`} sub={profile.baseline_gap <= 0 ? `surplus ${fmt.money(profile.typical_surplus)}/mo` : `gap ${fmt.money(profile.baseline_gap)}/mo`} tip="With no shock: if spending already exceeds inflow, buffer ÷ gap; otherwise there is no shortfall (120+)." />
      </div>
      <div className="grid cols-4">
        <Tile label="Primary goal" value={goal?.label ?? 'Emergency fund (default)'} sub={goal?.target_months ? `${goal.target_months} months` : 'Set one on Home or My Goals'} />
        <Tile label="Financial trend" value={trend == null ? '—' : fmt.signed(trend)} sub="change in average balance over the buffer window" />
        <Tile label="Most relevant concern" value={concern?.label ?? 'Income interruption (default stress)'} sub={concern ? 'confirmed by you' : 'nothing confirmed yet'} />
        <Tile gold label="Recommended next action" value={lastReplan ? lastReplan.snapshot.recommended_label : 'Run the layoff twist'} sub={<Link to="/roadmap">See roadmap</Link>} />
      </div>
      <ProfileInsights compact />
      <ShockCards />
      <div id="shock-controls"><ShockPanel compact /></div>
      <CouncilPanel />
    </div>
  )
}
