import { Activity, ArrowRight, CalendarDays, Landmark, MessageCircle, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import { Tangerine } from '../components/PulpMascot'
import ResilienceEntry from '../components/ResilienceEntry'
import ThreadFigure from '../components/stage/ThreadFigure'
import '../components/twist-deck.css'
import { Card, fmt } from '../components/ui'
import { useApp } from '../stores/useApp'

const monthFormat = new Intl.DateTimeFormat('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function recordMonth(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00Z`)
  return Number.isNaN(date.valueOf()) ? value : monthFormat.format(date)
}

export default function Overview() {
  const profile = useApp((state) => state.profile)
  const openPulp = useApp((state) => state.openPulp)
  if (!profile) return <DemoAccountPicker />

  const { account_id, typical_inflow, typical_spending, typical_surplus } = profile
  const chartMax = Math.max(typical_inflow, typical_spending, 1)
  const runway = profile.baseline_runway
  const runwayLabel = runway === null ? 'No monthly shortfall'
    : runway === 0 ? '0 months'
    : runway >= 120 ? '120+ months'
    : `${profile.baseline_runway_label} months`
  const runwayNote = runway === null ? 'Typical money in covers typical money out.'
    : runway === 0 ? 'The historical figures give this account no positive cash buffer.'
    : 'The cash buffer divided by the monthly shortfall, with no shock applied.'

  return (
    <div className="bank-overview" key={account_id}>
      <section className="bank-account-summary" aria-labelledby="bank-summary-title">
        <div>
          <span className="bank-demo-badge"><span aria-hidden="true" /> Historical demo data</span>
          <h2 id="bank-summary-title">Account {account_id}</h2>
          <p><CalendarDays size={16} aria-hidden="true" /> {recordMonth(profile.first_month)} to {recordMonth(profile.last_month)} <span>·</span> {profile.months_available} {profile.months_available === 1 ? 'month' : 'months'} of records</p>
        </div>
        <div className="bank-actions">
          <Link className="bank-button bank-button-primary" to="/shock"><Activity size={17} aria-hidden="true" /> Run a shock</Link>
          <Link className="bank-button" to="/plan">View my plan <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      <div className="bank-overview-grid">
        <Card title="Your typical month" className="bank-flow">
          <p>These figures use the middle of the monthly totals in the records, in Canadian dollars.</p>
          <dl className="bank-flow-rows">
            {([
              ['Money in', typical_inflow],
              ['Money out', typical_spending],
            ] as const).map(([label, amount]) => (
              <div key={label} className="bank-flow-row">
                <dt>{label}</dt>
                <dd className="bank-money">{fmt.money(amount, 2)}</dd>
                <span className="bank-flow-track" aria-hidden="true"><span style={{ width: `${Math.max(0, amount) / chartMax * 100}%` }} /></span>
              </div>
            ))}
          </dl>
          <div className="bank-flow-total">
            <span>{typical_surplus < 0 ? 'Typical monthly shortfall' : 'Typical monthly amount left'}</span>
            <strong className="bank-money">{fmt.money(Math.abs(typical_surplus), 2)}</strong>
          </div>
          <section className="bank-runway" aria-labelledby="bank-runway-title">
            <div className="bank-flow-total">
              <h3 id="bank-runway-title">Baseline runway</h3>
              <strong className="bank-money">{runwayLabel}</strong>
            </div>
            <p>{runwayNote}</p>
          </section>
          <details className="bank-picture">
            <summary>See your month as a picture</summary>
            <ThreadFigure beat={{ id: `picture-${account_id}`, visual: 'picture', caption: '', duration_s: 0, params: {
              inflow: typical_inflow, outflow: typical_spending, buffer: profile.buffer,
              months_of_spending: typical_spending > 0 ? profile.buffer / typical_spending : 0, runway_label: profile.baseline_runway_label } }} />
          </details>
        </Card>

        <div className="bank-balance-cards">
          <Card title={<><Wallet size={19} aria-hidden="true" /> Cash buffer</>} className="bank-balance">
            <strong className="bank-money">{fmt.money(profile.buffer, 2)}</strong>
            <p>Based on average daily balances from the last {profile.buffer_months_used} {profile.buffer_months_used === 1 ? 'month' : 'months'} in the data.</p>
          </Card>
          <Card title={<><Landmark size={19} aria-hidden="true" /> Typical monthly fixed costs</>} className="bank-balance">
            <strong className="bank-money">{fmt.money(profile.typical_fixed_costs, 2)}</strong>
            <p>Recorded bills, insurance, and loan payments are already part of money out.</p>
            <dl className="bank-cost-breakdown">
              <div><dt>Typical household bills</dt><dd>{fmt.money(profile.household_bills, 2)}</dd></div>
              {profile.active_loan_payment > 0 && (
                <div><dt>Active loan payment</dt><dd>{fmt.money(profile.active_loan_payment, 2)}</dd></div>
              )}
            </dl>
            {profile.active_loan_payment > 0 && <p>Active loan payment uses the recorded amount at the end of 2025.</p>}
          </Card>
        </div>
      </div>

      <aside className="bank-next">
        <Tangerine className="bank-next-mascot" />
        <div>
          <h2>Start with a change you might face</h2>
          <p>Explore what a drop in income or an unexpected bill could change, then make a goal plan and a backup plan.</p>
        </div>
        <div className="bank-next-actions">
          <button type="button" className="bank-button" onClick={() => openPulp('__intro__')}><MessageCircle size={16} aria-hidden="true" /> Talk it through with Pulp</button>
          <Link to="/twin">See account details <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </aside>
      <ResilienceEntry researchOnly />
    </div>
  )
}
