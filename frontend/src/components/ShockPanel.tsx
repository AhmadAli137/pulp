import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { matchesShockInputs, type Beat, type ShockInputs, type ShockReport } from '../services/api'
import { useApp } from '../stores/useApp'
import { Tangerine } from './PulpMascot'
import PurchaseComparison from './PurchaseComparison'
import ScenarioPlans from './ScenarioPlans'
import ShockCashChart from './ShockCashChart'
import ThreadFigure from './stage/ThreadFigure'
import TwistDeck from './TwistDeck'
import { Card, DataTable, ErrorBox, fmt } from './ui'

export default function ShockPanel() {
  const {
    profile, accountId, shockInputs, setInputs, runShock, shock, shockLoading, shockError,
    accessible, shockHasHappened, setShockHasHappened,
  } = useApp()
  const [draft, setDraft] = useState<Partial<Record<keyof ShockInputs, string>>>({})
  if (!profile) return null

  const editing = Object.keys(draft).length > 0
  const report = !editing && matchesShockInputs(shock, accountId, shockInputs) ? shock : null
  const field = (key: keyof ShockInputs, scale = 1) => ({
    value: draft[key] ?? Number((shockInputs[key] * scale).toPrecision(15)),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setDraft({ ...draft, [key]: event.target.value })
    },
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input = (key: keyof ShockInputs, scale = 1) => draft[key] == null ? shockInputs[key] : Number(draft[key]) / scale
    if (editing) {
      setInputs({ income_fraction: input('income_fraction', 100), bills_increase: input('bills_increase', 100), one_off_cost: input('one_off_cost'), horizon_months: input('horizon_months') })
      setDraft({})
    }
    void runShock()
  }

  return (
    <div className="stack scenario">
      <Card title="Set up a shock">
        <p className="scenario-intro">Draw a twist card, shuffle the deck for a random one, or enter your own changes. If income has stopped, enter only what you can count on, including 0% when nothing is confirmed.</p>
        <TwistDeck editing={editing} onPick={() => setDraft({})} />
        <form className="grid scenario-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="shock-income">Income retained</label>
            <div className="unit"><input id="shock-income" type="number" step="any" min="0" max="500" required {...field('income_fraction', 100)} /><span>%</span></div>
          </div>
          <div className="field">
            <label htmlFor="shock-bills">Household bills change</label>
            <div className="unit"><input id="shock-bills" type="number" step="any" min="-100" max="1000" required {...field('bills_increase', 100)} /><span>%</span></div>
          </div>
          <div className="field">
            <label htmlFor="shock-upfront">One-time cost</label>
            <div className="unit"><input id="shock-upfront" type="number" step="any" min="0" required {...field('one_off_cost')} /><span>CAD</span></div>
          </div>
          <div className="field">
            <label htmlFor="shock-duration">Duration</label>
            <div className="unit"><input id="shock-duration" type="number" step="1" min="1" max="120" required {...field('horizon_months')} /><span>months</span></div>
          </div>
          <button className="btn primary" type="submit" disabled={shockLoading}>Run shock</button>
        </form>
        <label className="scenario-happened"><input type="checkbox" checked={shockHasHappened} onChange={(event) => setShockHasHappened(event.target.checked)} /> This shock has already happened</label>
        <p className="small muted">The layoff preset assumes 55% of typical inflow for the full period. Change this to reflect what you can verify. A bills change applies to recorded household bills only.</p>
        {shockLoading && <p className="scenario-working" role="status"><span aria-hidden="true" /> Calculating your shock…</p>}
        {!report && !shockLoading && !shockError && <p className="scenario-working" role="status">Run the shock to update your results and both plans.</p>}
        <ErrorBox msg={shockError} />
      </Card>
      {report && !shockLoading && <ShockResults report={report} responseFirst={shockHasHappened} showTable={accessible} />}
    </div>
  )
}

function ShockResults({ report, responseFirst, showTable }: { report: ShockReport; responseFirst: boolean; showTable: boolean }) {
  const { baseline, shocked, verdict, upfront_cost: upfront } = report
  const months = verdict.horizon_months
  const tone = verdict.exact_at_horizon ? 'exact' : verdict.survives ? 'ok' : 'bad'
  const runway = shocked.runway_status === 'no_shortfall' ? 'No monthly shortfall' : `${shocked.runway_label} months${shocked.runway_status === 'capped' ? ' (display limit)' : ''}`
  const heading = verdict.exact_at_horizon ? 'Cash covers exactly this period'
    : shocked.buffer_left < 0 ? 'More cash is needed upfront'
    : shocked.buffer_left === 0 ? 'The cash cushion is used up at the start'
    : verdict.survives ? 'Cash covers this period' : 'Cash runs short before the end'

  return (
    <>
      <section className={`verdict scenario-verdict ${tone}`} aria-label="Shock result" role="status">
        <span aria-hidden="true"><Tangerine className="scenario-mascot" /></span>
        <div>
          <h2>{heading}</h2>
          <p>
            In this scenario, <strong className="scenario-amount">{fmt.money(shocked.income_after, 2)}</strong> comes in each month
            and <strong className="scenario-amount">{fmt.money(shocked.spending_after, 2)}</strong> goes out.
            {upfront > 0 && <> The <strong className="scenario-amount">{fmt.money(upfront, 2)}</strong> one-time cost is due at the start.</>}
          </p>
          <p>
            {shocked.buffer_left < 0
              ? <>The upfront cash gap is <strong className="scenario-amount">{fmt.money(-shocked.buffer_left, 2)}</strong>. Later income cannot cover a bill due today.</>
              : verdict.exact_at_horizon
                ? <>The estimate reaches <strong className="scenario-amount">$0</strong> at month {months}.</>
                : verdict.survives
                  ? <>Estimated cash left at month {months} is <strong className="scenario-amount">{fmt.money(verdict.cash_left_at_horizon, 2)}</strong>.</>
                  : verdict.shortfall_over_horizon > 0
                    ? <>Over {months} months, an estimated <strong className="scenario-amount">{fmt.money(verdict.shortfall_over_horizon, 2)}</strong> is still needed.</>
                    : 'Regular income covers ongoing spending under these assumptions, with no cash cushion at the start.'}
          </p>
          <p className="small muted">Runway · {runway}. Assumes the same income and spending for all {months} {months === 1 ? 'month' : 'months'}.</p>
          {report.warnings?.map((w) => <p key={w} className="scenario-warning" role="note">{w}</p>)}
        </div>
      </section>
      <Card title="Your cushion, month by month" className="scenario-figure">
        <ThreadFigure beat={timelineBeat(report)} />
      </Card>
      {responseFirst && <ScenarioPlans report={report} responseFirst />}
      <ShockCashChart report={report} showTable={showTable} />
      {!responseFirst && <ScenarioPlans report={report} responseFirst={false} />}
      <PurchaseComparison key={`${report.account_id}:${JSON.stringify(report.applied_inputs)}`} report={report} showTable={showTable} />
      <Card title="How the numbers work">
        <p className="scenario-intro">Your cash buffer estimates how much you could draw on from recent balances. The one-time cost comes out first. Each month with a shortfall uses more of what is left.</p>
        <details open={showTable || undefined} className="scenario-details">
          <summary>View inputs and formulas</summary>
          <DataTable caption="Shock inputs and formulas" headers={['Measure', 'Without shock', 'After shock']} rows={[
            ['Income · typical inflow × income retained', fmt.money(baseline.income_after, 2), fmt.money(shocked.income_after, 2)],
            ['Spending · typical spending + change in household bills', fmt.money(baseline.spending_after, 2), fmt.money(shocked.spending_after, 2)],
            ['Cash after one-time cost · starting buffer − upfront cost', fmt.money(baseline.buffer_left, 2), fmt.money(shocked.buffer_left, 2)],
            ['Monthly gap · spending − income', fmt.money(baseline.monthly_gap, 2), fmt.money(shocked.monthly_gap, 2)],
          ]} />
          <p className="small muted">Runway is cash after upfront costs divided by the monthly gap when both are positive. It is zero when upfront costs exhaust the buffer, and shown as no monthly shortfall when income covers spending and cash remains. Results use unrounded inputs.</p>
          <p className="small muted">{report.tipping_point.note}</p>
        </details>
        <p><Link to="/plan">Open My Plan</Link></p>
      </Card>
    </>
  )
}

/** The engine's shock report drawn as the month-by-month cushion figure (same figure Pulp uses in conversation). */
function timelineBeat(report: ShockReport): Beat {
  const s = report.shocked
  const months = report.verdict.horizon_months
  const inputs = report.applied_inputs
  const runsOut = s.buffer_left <= 0 ? 0 : s.runway != null && s.runway < months ? Math.round(s.runway * 10) / 10 : null
  const what = [
    inputs.income_fraction !== 1 ? `income at ${Math.round(inputs.income_fraction * 100)}%` : null,
    inputs.bills_increase ? `bills ${inputs.bills_increase > 0 ? '+' : ''}${Math.round(inputs.bills_increase * 100)}%` : null,
    inputs.one_off_cost ? `one-off ${fmt.money(inputs.one_off_cost)}` : null,
  ].filter(Boolean).join(', ') || 'no shock'
  return {
    id: `shock-${report.account_id}-${months}`, visual: 'timeline', caption: '', duration_s: 0,
    params: {
      duration_months: months, income_before: report.baseline.income_after, income_after: s.income_after, spending_after: s.spending_after,
      monthly_gap: s.monthly_gap, buffer_start: s.buffer_left, runs_out_month: runsOut, runway_label: s.runway_label, verdict: report.verdict.verdict,
      events: [{ month: 0, label: what }, runsOut != null ? { month: runsOut, label: 'cushion empty' } : { month: months, label: 'still standing' }],
    },
  }
}
