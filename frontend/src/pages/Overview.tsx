import { Activity, ArrowRight, CalendarDays, Landmark, MessageCircle, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import DiscoveryHighlight from '../components/insights/DiscoveryHighlight'
import BenefitsPanel from '../components/benefits/BenefitsPanel'
import { Detail, ShowFullDetail } from '../components/Detail'
import ExplainButton from '../components/ExplainButton'
import PageAnswer, { Num } from '../components/PageAnswer'
import { Tangerine } from '../components/PulpMascot'
import ThreadFigure from '../components/stage/ThreadFigure'
import '../components/twist-deck.css'
import { Card, fmt } from '../components/ui'
import type { Profile } from '../services/api'
import { useApp } from '../stores/useApp'
import { useShowDetail } from '../stores/view'
import '../components/clarity.css'

const monthFormat = new Intl.DateTimeFormat('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function recordMonth(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00Z`)
  return Number.isNaN(date.valueOf()) ? value : monthFormat.format(date)
}

export default function Overview() {
  const profile = useApp((state) => state.profile)
  const openPulp = useApp((state) => state.openPulp)
  const showDetail = useShowDetail()
  if (!profile) return <DemoAccountPicker />

  const { account_id, typical_inflow, typical_spending, typical_surplus } = profile
  const chartMax = Math.max(typical_inflow, typical_spending, 1)
  const runway = profile.baseline_runway
  const runwayLabel = runway === null ? 'No monthly shortfall'
    : runway === 0 ? '0 months'
    : runway >= 120 ? '120+ months'
    : `${profile.baseline_runway_label} months`
  const runwayNote = runway === null ? 'Typical money in covers money out, so the cushion is not being drawn down.'
    : runway === 0 ? 'The historical figures give this account no positive cash buffer.'
    : 'The cash buffer divided by the monthly shortfall, with no shock applied.'

  return (
    <div className="bank-overview" key={account_id}>
      <PageAnswer>{answer(profile)}</PageAnswer>
      {/* Which records the answer comes from, and where to go next: a quiet row under the answer, not a banner. */}
      <section className="bank-account-summary" aria-labelledby="bank-summary-title">
        <div>
          <h2 id="bank-summary-title">Account {account_id}</h2>
          <p><span className="bank-demo-badge"><span aria-hidden="true" /> Historical demo data</span> <span aria-hidden="true">·</span> <CalendarDays size={15} aria-hidden="true" /> {recordMonth(profile.first_month)} to {recordMonth(profile.last_month)} <span aria-hidden="true">·</span> {profile.months_available} {profile.months_available === 1 ? 'month' : 'months'} of records</p>
        </div>
        <div className="bank-actions">
          {/* Both outline: in this quiet row neither should outshine the answer above it. */}
          <Link className="bank-button" to="/shock"><Activity size={17} aria-hidden="true" /> Run a shock</Link>
          <Link className="bank-button" to="/plan">View my plan <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      {/* The typical month is the evidence for the answer, so it comes straight after it; the discovery and the benefits follow. */}
      <div className="bank-overview-grid">
        <Card title="How does a typical month look?" className="bank-flow" right={<ExplainButton topic="typical_month" label="your typical month" />}>
          <p>These figures use the middle of the monthly totals in the records, in Canadian dollars.</p>
          <dl className="bank-flow-rows">
            {([
              ['Money in', typical_inflow],
              ['Money out', typical_spending],
            ] as const).map(([label, amount]) => (
              <div key={label} className="bank-flow-row">
                <dt>{label}</dt>
                <dd className="bank-money">{fmt.money(amount)}</dd>
                <span className="bank-flow-track" aria-hidden="true"><span style={{ width: `${Math.max(0, amount) / chartMax * 100}%` }} /></span>
              </div>
            ))}
          </dl>
          <div className="bank-flow-total">
            <span>{typical_surplus < 0 ? 'Typical monthly shortfall' : 'Typical monthly amount left'}</span>
            <strong className="bank-money" style={{ color: typical_surplus < 0 ? 'var(--bank-orange)' : typical_inflow > typical_spending ? 'var(--bank-green)' : undefined }}>{fmt.money(Math.abs(typical_surplus))}</strong>
          </div>
          {/* The answer's second half, in Simple view where the Cash buffer card is tucked away: the same cushion and the
              same months of spending (cushion ÷ typical money out). */}
          {!showDetail && profile.buffer > 0 && (
            <div className="bank-flow-total bank-flow-cushion">
              <span>Cash cushion</span>
              <strong className="bank-money">{fmt.money(profile.buffer)}{typical_surplus >= 0 && typical_spending > 0 && <span className="bank-flow-aside"> · about {(profile.buffer / typical_spending).toFixed(1)} months of spending</span>}</strong>
            </div>
          )}
          <section className="bank-runway" aria-labelledby="bank-runway-title">
            <div className="bank-flow-total">
              <h3 id="bank-runway-title">Baseline runway <ExplainButton topic="runway" label="your runway" /></h3>
              <strong className="bank-money" style={runway === null ? { color: 'var(--bank-green)' } : undefined}>{runwayLabel}</strong>
            </div>
            <p>{runwayNote}</p>
          </section>
          <details className="bank-picture">
            <summary>See your month as a picture</summary>
            <PictureWhatIf profile={profile} />
          </details>
        </Card>

        <Detail><div className="bank-balance-cards">
          <Card title={<><Wallet size={19} aria-hidden="true" /> Cash buffer</>} className="bank-balance" right={<ExplainButton topic="cushion" label="your cushion" />}>
            <strong className="bank-money">{fmt.money(profile.buffer)}</strong>
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
        </div></Detail>
      </div>

      <DiscoveryHighlight accountId={account_id} compact />

      <BenefitsPanel accountId={account_id} />

      <Detail><aside className="bank-next">
        <Tangerine className="bank-next-mascot" />
        <div>
          <h2>What next?</h2>
          <p>Try a shock to see how long your cushion would last, or look at the person PULP thinks is behind these records.</p>
        </div>
        <div className="bank-next-actions">
          <button type="button" className="bank-button" onClick={() => openPulp('__intro__')}><MessageCircle size={16} aria-hidden="true" /> Talk it through with Pulp</button>
          <Link to="/profile">Who PULP thinks you are <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link to="/insights">How you compare with others <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </aside></Detail>
      <ShowFullDetail what="Overview" />
    </div>
  )
}

/** The month as a picture, with what-if sliders: money in, spending and household bills move the cup live. */
function PictureWhatIf({ profile }: { profile: Profile }) {
  const [di, setDi] = useState(0)
  const [ds, setDs] = useState(0)
  const [db, setDb] = useState(0)
  const I = profile.typical_inflow * (1 + di)
  const S = profile.typical_spending * (1 + ds) + profile.household_bills * db
  const B = profile.buffer
  const gap = S - I
  const runway = B <= 0 ? 0 : gap <= 0 ? null : Math.min(120, B / gap)
  const changed = di !== 0 || ds !== 0 || db !== 0
  const left = I - S
  const left0 = profile.typical_surplus
  const sliders: [string, number, (v: number) => void, number, number, string | undefined][] = [
    ['Money in', di, setDi, -50, 30, undefined],
    ['Spending', ds, setDs, -30, 30, undefined],
    ['Household bills', db, setDb, -20, 50, profile.household_bills > 0 ? undefined : 'No labelled bills in the records, so this cannot move spending.'],
  ]
  return (
    <>
      <ThreadFigure beat={{ id: `picture-${profile.account_id}`, visual: 'picture', caption: '', duration_s: 0, params: {
        inflow: I, outflow: S, buffer: B, months_of_spending: S > 0 ? B / S : 0,
        runway_label: runway == null ? 'no shortfall (120+)' : runway.toFixed(1) } }} />
      <fieldset className="whatif">
        <legend>What if</legend>
        {sliders.map(([label, v, set, min, max, note]) => (
          <label key={label} className="lp-slider">
            <span className="lp-slider-head"><b>{label}</b><output>{v > 0 ? '+' : ''}{Math.round(v * 100)}%</output></span>
            <input type="range" min={min} max={max} step={5} value={Math.round(v * 100)} onChange={(e) => set(Number(e.target.value) / 100)} />
            {note && <small>{note}</small>}
          </label>
        ))}
        <p className="whatif-result" role="status">
          {left >= 0 ? `${fmt.money(left)} left over a month` : `${fmt.money(-left)} short a month`}
          {changed && <> · actual {left0 >= 0 ? `${fmt.money(left0)} left over` : `${fmt.money(-left0)} short`} ({left - left0 >= 0 ? '+' : '−'}{fmt.money(Math.abs(left - left0))})</>}
          {' '}· {(S > 0 ? B / S : 0).toFixed(1)} months of spending in the cup · runway {runway == null ? 'no shortfall' : `${runway.toFixed(1)} months`}
        </p>
        {changed && <button type="button" className="lp-btn ghost" onClick={() => { setDi(0); setDs(0); setDb(0) }}>Reset</button>}
      </fieldset>
    </>
  )
}

/** The answer to "How am I doing?" in one sentence: what a typical month leaves (or lacks), and how far the cushion
 *  goes, all from this account's records with no shock applied. Whole dollars, as in the card below. */
function answer(p: Profile): ReactNode {
  const left = Math.round(p.typical_surplus)
  const hasCushion = p.buffer > 0
  if (left >= 0) {
    const months = p.typical_spending > 0 ? p.buffer / p.typical_spending : 0
    const month = left === 0
      ? <>In a typical month what comes in about matches what goes out</>
      : <>You keep about <Num>{fmt.money(left)}</Num> in a typical month</>
    return hasCushion
      ? <>{month}, and your <Num>{fmt.money(p.buffer)}</Num> cushion would cover about <Num>{months.toFixed(1)} months</Num> of spending.</>
      : <>{month}, but there is no cash cushion in the records to fall back on.</>
  }
  const runway = p.baseline_runway
  const lasts = runway != null && runway >= 120 ? 'more than ten years' : `about ${p.baseline_runway_label} months`
  return hasCushion && runway !== 0
    ? <>You spend about <Num>{fmt.money(-left)}</Num> more than comes in each month, so your <Num>{fmt.money(p.buffer)}</Num> cushion would last <Num>{lasts}</Num>.</>
    : <>You spend about <Num>{fmt.money(-left)}</Num> more than comes in each month, with no cash cushion in the records to cover the gap.</>
}
