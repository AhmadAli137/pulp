import { useState, type FormEvent } from 'react'
import { api, ApiError, type PurchaseComparison as Comparison, type ShockReport } from '../services/api'
import ShockCashChart from './ShockCashChart'
import { Card, DataTable, ErrorBox, fmt } from './ui'

export default function PurchaseComparison({ report, showTable }: { report: ShockReport; showTable: boolean }) {
  const [cost, setCost] = useState('')
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const compare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const { income_fraction, bills_increase, one_off_cost, horizon_months } = report.applied_inputs
    setBusy(true)
    setError(null)
    try {
      setComparison(await api.comparePurchase({ account_id: report.account_id, income_fraction, bills_increase, one_off_cost, horizon_months, purchase_cost: Number(cost) }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not compare these choices. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const months = report.verdict.horizon_months
  const wait = comparison?.wait
  const buy = comparison?.buy
  return (
    <section className="stack" aria-label="Optional spending comparison">
      <Card title="Can this purchase wait?">
        <p className="scenario-intro">Compare keeping your cash with paying for something optional, like a vacation. Use only the amount you could still choose to pay.</p>
        <form className="purchase-form" onSubmit={(event) => void compare(event)}>
          <div className="field">
            <label htmlFor="purchase-cost">Remaining optional cost</label>
            <div className="unit"><input id="purchase-cost" type="number" inputMode="decimal" step="0.01" min="0.01" required value={cost} disabled={busy} onChange={(event) => { setCost(event.target.value); setComparison(null); setError(null) }} /><span>CAD</span></div>
          </div>
          <button className="btn primary" disabled={busy} type="submit">Compare options</button>
        </form>
        {busy && <p className="scenario-working" role="status"><span aria-hidden="true" /> Comparing your options…</p>}
        <ErrorBox msg={error} />
        {comparison && wait && buy && (
          <div className="scenario-comparison" aria-live="polite">
            <h3>{comparison.recommendation === 'wait' ? 'Wait on the purchase' : 'Check the trade-off before paying'}</h3>
            <p>
              Waiting keeps <strong className="scenario-amount">{fmt.money(comparison.cash_preserved, 2)}</strong> available today.
              {buy.backup_plan.immediate_need > 0
                ? <> Paying now would leave <strong className="scenario-amount">{fmt.money(buy.backup_plan.immediate_need, 2)}</strong> to cover upfront. Check upcoming essentials and confirmed income first.</>
                : buy.verdict.shortfall_over_horizon > 0
                  ? <> Paying now would leave a <strong className="scenario-amount">{fmt.money(buy.verdict.shortfall_over_horizon, 2)}</strong> shortfall over {months} months. Check upcoming essentials and confirmed income first.</>
                  : comparison.recommendation === 'wait'
                    ? ' Paying now would leave no cash cushion during the period. Revisit the purchase once you can protect essentials.'
                    : ' Both options cover the selected period under these assumptions. If income is uncertain, wait to commit until you know how you would cover essentials through a longer gap.'}
            </p>
            <DataTable caption="Wait or pay now" headers={['Measure', 'Wait', 'Pay now']} rows={[
              ['Cash after upfront costs', fmt.money(wait.shocked.buffer_left, 2), fmt.money(buy.shocked.buffer_left, 2)],
              ['Extra cash needed today', fmt.money(wait.backup_plan.immediate_need, 2), fmt.money(buy.backup_plan.immediate_need, 2)],
              [`Shortfall over ${months} months`, fmt.money(wait.verdict.shortfall_over_horizon, 2), fmt.money(buy.verdict.shortfall_over_horizon, 2)],
            ]} />
            <p className="small muted">Both options use {fmt.money(report.shocked.income_after, 2)} a month in retained income and the same regular expenses. Re-run the shock with a lower income assumption if that amount is uncertain.</p>
          </div>
        )}
      </Card>
      {wait && buy && <ShockCashChart report={wait} payNow={buy} showTable={showTable} />}
    </section>
  )
}
