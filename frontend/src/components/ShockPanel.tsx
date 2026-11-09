import { useState, type FormEvent, type ReactNode } from 'react'
import { matchesShockInputs, type Beat, type ShockInputs, type ShockReport } from '../services/api'
import { useApp } from '../stores/useApp'
import PurchaseComparison from './PurchaseComparison'
import ScenarioPlans from './ScenarioPlans'
import { MoreLinks } from './workspace'
import ShockCashChart from './ShockCashChart'
import ThreadFigure from './stage/ThreadFigure'
import TwistDeck from './TwistDeck'
import { Card, DataTable, ErrorBox, fmt } from './ui'
import { Detail } from './Detail'
import ExplainButton from './ExplainButton'
import PageAnswer, { Num } from './PageAnswer'

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
      <PageAnswer pending={shockLoading || !report} busy={shockLoading}>{shockAnswer(shockLoading ? null : report, shockLoading, editing, shockError)}</PageAnswer>
      <Card title="Set up a shock">
        <p className="scenario-intro">Turn over a card, or type your own numbers below. If income has stopped, enter only what you can count on, including 0% when nothing is confirmed.</p>
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
        <Detail><p className="small muted">The layoff preset assumes 55% of typical inflow for the full period. Change this to reflect what you can verify. A bills change applies to recorded household bills only.</p></Detail>
        {shockLoading && <p className="scenario-working" role="status"><span aria-hidden="true" /> Calculating your shock…</p>}
        {!report && !shockLoading && !shockError && <p className="scenario-working" role="status">Run the shock to update your results and both plans.</p>}
        <ErrorBox msg={shockError} />
      </Card>
      {report && !shockLoading && <ShockResults report={report} responseFirst={shockHasHappened} showTable={accessible} />}
    </div>
  )
}

/** The answer to "What if life happens?" for the shock that was run, said with the shock itself so it stands on its own:
 *  does the cash last the period, and by how much. Whole dollars from the official report; the verdict and the tables
 *  below carry the detail. */
function shockAnswer(report: ShockReport | null, loading: boolean, editing: boolean, error: string | null): ReactNode {
  if (loading) return 'Working out what this shock would do to your cash…'
  if (error && !report) return 'That shock could not be worked out; try again below.'
  if (!report) return editing ? 'Run the shock below to see how long your cash would last.' : 'Pick a shock below to see how long your cash would last.'
  const { shocked, verdict, applied_inputs: ai } = report
  const period = `${verdict.horizon_months} ${verdict.horizon_months === 1 ? 'month' : 'months'}`
  const percent = (v: number) => `${Math.round(v * 100)}%`
  const what: string[] = []
  if (ai.income_fraction === 0) what.push('income stops')
  else if (ai.income_fraction < 1) what.push(`income drops to ${percent(ai.income_fraction)}`)
  else if (ai.income_fraction > 1) what.push(`income rises to ${percent(ai.income_fraction)}`)
  if (ai.bills_increase > 0) what.push(`bills go up ${percent(ai.bills_increase)}`)
  else if (ai.bills_increase < 0) what.push(`bills go down ${percent(-ai.bills_increase)}`)
  if (ai.one_off_cost > 0) what.push(`a ${fmt.money(ai.one_off_cost)} cost lands`)
  const when = what.length ? `If ${what.length < 2 ? what[0] : `${what.slice(0, -1).join(', ')} and ${what.at(-1)}`}` : 'With no shock'
  if (shocked.buffer_left < 0) return <>{when}, you would need <Num>{fmt.money(-shocked.buffer_left)}</Num> more cash than you have on day one.</>
  if (verdict.exact_at_horizon) return <>{when}, your cash would last exactly the <Num>{period}</Num>, reaching <Num>$0</Num> at the end.</>
  if (verdict.survives) return <>{when}, you would get through the <Num>{period}</Num> with about <Num>{fmt.money(verdict.cash_left_at_horizon)}</Num> left at the end.</>
  if (verdict.shortfall_over_horizon <= 0) return <>{when}, regular income still covers spending, but there is no cash cushion to start with.</>
  const runsOut = shocked.buffer_left === 0 || shocked.runway_status === 'exhausted'
    ? <>your cash cushion would be used up at the start</>
    : <>your cash would run out after about <Num>{shocked.runway_label} months</Num></>
  return <>{when}, {runsOut}, and you would be about <Num>{fmt.money(verdict.shortfall_over_horizon)}</Num> short by month <Num>{verdict.horizon_months}</Num>.</>
}

function ShockResults({ report, responseFirst, showTable }: { report: ShockReport; responseFirst: boolean; showTable: boolean }) {
  const { baseline, shocked } = report

  return (
    <>
      {/* The answer above says whether the cash lasts and by how much, and the cushion card's own header gives the money
          in and out, so no line of figures sits between them; only the engine's warnings, if any. */}
      {report.warnings?.length ? <div className="scenario-warnings">{report.warnings.map((w) => <p key={w} className="scenario-warning" role="note">{w}</p>)}</div> : null}
      <CushionWhatIf report={report} />
      {responseFirst && <ScenarioPlans report={report} responseFirst />}
      <ShockCashChart report={report} showTable={showTable} />
      {!responseFirst && <ScenarioPlans report={report} responseFirst={false} />}
      {/* Once, after the damage and its numbers in either order: what to do about it lives on My Plan. */}
      <MoreLinks className="scenario-handoff" links={[{ to: '/plan', text: 'What should I do? See My Plan' }]} />
      <details className="disclose">
        <summary>Can a purchase wait? Compare paying now with waiting</summary>
        <PurchaseComparison key={`${report.account_id}:${JSON.stringify(report.applied_inputs)}`} report={report} showTable={showTable} />
      </details>
      <Detail><details className="disclose" open={showTable || undefined}>
        <summary>How the numbers work</summary>
        <p className="scenario-intro">Your cash buffer estimates how much you could draw on from recent balances. The one-time cost comes out first. Each month with a shortfall uses more of what is left.</p>
        <div className="scenario-details">
          <DataTable caption="Shock inputs and formulas" headers={['Measure', 'Without shock', 'After shock']} rows={[
            ['Income · typical inflow × income retained', fmt.money(baseline.income_after, 2), fmt.money(shocked.income_after, 2)],
            ['Spending · typical spending + change in household bills', fmt.money(baseline.spending_after, 2), fmt.money(shocked.spending_after, 2)],
            ['Cash after one-time cost · starting buffer − upfront cost', fmt.money(baseline.buffer_left, 2), fmt.money(shocked.buffer_left, 2)],
            ['Monthly gap · spending − income', fmt.money(baseline.monthly_gap, 2), fmt.money(shocked.monthly_gap, 2)],
          ]} />
          <p className="small muted">Runway is cash after upfront costs divided by the monthly gap when both are positive. It is zero when upfront costs exhaust the buffer, and shown as no monthly shortfall when income covers spending and cash remains. Results use unrounded inputs.</p>
          <p className="small muted">{report.tipping_point.note}</p>
        </div>
      </details></Detail>
    </>
  )
}

/** The cushion figure with two what-if sliders. The runway follows the official rule: cash after the one-off cost
    divided by the monthly gap, 0 when nothing is left, "no shortfall" when income covers spending. */
function CushionWhatIf({ report }: { report: ShockReport }) {
  const r0 = report.applied_inputs.income_fraction, m0 = report.verdict.horizon_months
  const [r, setR] = useState(r0)
  const [months, setMonths] = useState(m0)
  const changed = r !== r0 || months !== m0
  const income = report.baseline.income_after * r
  const spending = report.shocked.spending_after
  const gap = spending - income
  const left = report.shocked.buffer_left
  const runway = left <= 0 ? 0 : gap <= 0 ? null : Math.min(120, left / gap)
  const label = runway == null ? 'no shortfall (120+)' : runway.toFixed(1)
  const official = report.shocked.runway_label
  const ai = report.applied_inputs
  const covers = runway == null || runway >= months
  return (
    <Card title="Your cushion, month by month" className="scenario-figure" right={<ExplainButton topic="cushion_chart" label="the cushion chart" shock={{ r, h: ai.bills_increase, o: ai.one_off_cost, d: months }} />}>
      <p className="scenario-intro">Cash left at the end of each month, assuming the same income and spending for all {m0} {m0 === 1 ? 'month' : 'months'}.</p>
      {/* At the shock that was run the figure's verdict line and the runway line would only repeat the answer at the top,
          so they appear once the sliders move away from it. */}
      <ThreadFigure beat={timelineBeat(report, changed ? { r, months, income, gap, runway, label } : undefined)} />
      <fieldset className="whatif">
        <legend>What if</legend>
        <label className="lp-slider"><span className="lp-slider-head"><b>Income kept</b><output>{Math.round(r * 100)}%</output></span>
          <input type="range" min={0} max={100} step={5} value={Math.round(r * 100)} onChange={(e) => setR(Number(e.target.value) / 100)} /></label>
        <label className="lp-slider"><span className="lp-slider-head"><b>Months the shock lasts</b><output>{months} mo</output></span>
          <input type="range" min={1} max={24} step={1} value={months} onChange={(e) => setMonths(Number(e.target.value))} /></label>
        <p className="whatif-result" role="status">{changed && <>
          Runway <b>{runway == null ? 'no shortfall' : `${label} months`}</b> · {covers ? 'covers' : 'does not cover'} {months} months
          {' '}· official result {official === 'no shortfall (120+)' ? 'no shortfall' : `${official} months`} at {Math.round(r0 * 100)}% for {m0} months
        </>}</p>
        {changed && <button type="button" className="lp-btn ghost" onClick={() => { setR(r0); setMonths(m0) }}>Reset</button>}
      </fieldset>
    </Card>
  )
}

/** The engine's shock report drawn as the month-by-month cushion figure (same figure Pulp uses in conversation). */
function timelineBeat(report: ShockReport, wi?: { r: number; months: number; income: number; gap: number; runway: number | null; label: string }): Beat {
  const s = report.shocked
  const months = wi?.months ?? report.verdict.horizon_months
  const inputs = wi ? { ...report.applied_inputs, income_fraction: wi.r } : report.applied_inputs
  const runway = wi ? wi.runway : s.runway
  const runsOut = s.buffer_left <= 0 ? 0 : runway != null && runway < months ? Math.round(runway * 10) / 10 : null
  const what = [
    inputs.income_fraction !== 1 ? `income at ${Math.round(inputs.income_fraction * 100)}%` : null,
    inputs.bills_increase ? `bills ${inputs.bills_increase > 0 ? '+' : ''}${Math.round(inputs.bills_increase * 100)}%` : null,
    inputs.one_off_cost ? `one-off ${fmt.money(inputs.one_off_cost)}` : null,
  ].filter(Boolean).join(', ') || 'no shock'
  return {
    id: `shock-${report.account_id}-${months}-${inputs.income_fraction}`, visual: 'timeline', caption: '', duration_s: 0,
    params: {
      duration_months: months, income_before: report.baseline.income_after, income_after: wi ? wi.income : s.income_after, spending_after: s.spending_after,
      monthly_gap: wi ? wi.gap : s.monthly_gap, buffer_start: s.buffer_left, runs_out_month: runsOut, runway_label: wi ? wi.label : s.runway_label,
      verdict: wi ? (runsOut == null ? 'what if: the cushion lasts' : 'what if: the cushion runs out') : report.verdict.verdict,
      events: [{ month: 0, label: what }, runsOut != null ? { month: runsOut, label: 'cushion empty' } : { month: months, label: 'still standing' }],
      hide_verdict: !wi,
    },
  }
}
