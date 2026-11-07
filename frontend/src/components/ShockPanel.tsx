import { useState } from 'react'
import { PRESETS, useApp } from '../stores/useApp'
import { Card, Chip, DataTable, ErrorBox, KV, Spinner, Tip, fmt } from './ui'

/** Twist controls, verdict, "why did this change", both plans and tipping point. Used on Overview and Explore. */
export default function ShockPanel({ compact = false }: { compact?: boolean }) {
  const { profile, shockInputs, setInputs, applyPreset, runShock, shock, shockLoading, shockError, activePreset, accessible } = useApp()
  const [showMath, setShowMath] = useState(false)
  if (!profile) return null
  const T = shockInputs.horizon_months

  const num = (k: keyof typeof shockInputs, scale = 1) => ({
    value: String(Math.round(shockInputs[k] * scale * 1000) / 1000),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value)
      if (!Number.isNaN(v)) setInputs({ [k]: v / scale } as Partial<typeof shockInputs>)
    },
  })

  const v = shock?.verdict
  const tone = v ? (v.exact_at_horizon ? 'exact' : v.survives ? 'ok' : 'bad') : 'ok'

  return (
    <div className="stack">
      <Card title="Take a shock" right={<span className="small muted">Exact values; presets are the event twists</span>}>
        <div className="preset-row" role="group" aria-label="Presets">
          {Object.entries(PRESETS).map(([k, p]) => (
            <button key={k} className={`preset${activePreset === k ? ' active' : ''}`} onClick={() => applyPreset(k)}>
              {p.label}<span className="k">{p.hint}</span>
            </button>
          ))}
        </div>
        <form className="grid cols-5" style={{ marginTop: 14, alignItems: 'end' }} onSubmit={(e) => { e.preventDefault(); void runShock() }}>
          <div className="field">
            <label htmlFor="r">Income retained <Tip text="r. EI typically replaces 55% of insurable earnings. 100 = no income change." /></label>
            <div className="unit"><input id="r" type="number" step="1" min="0" max="500" {...num('income_fraction', 100)} /><span>%</span></div>
          </div>
          <div className="field">
            <label htmlFor="h">Household bills change <Tip text="h, applied to H (median household_bills). 15 = bills up 15%." /></label>
            <div className="unit"><input id="h" type="number" step="1" min="-100" max="1000" {...num('bills_increase', 100)} /><span>%</span></div>
          </div>
          <div className="field">
            <label htmlFor="c">One-time cost <Tip text="C, taken off the buffer today. The furnace preset sets this to one month of typical spending." /></label>
            <div className="unit"><input id="c" type="number" step="50" min="0" {...num('one_off_cost')} /><span>$</span></div>
          </div>
          <div className="field">
            <label htmlFor="t">Duration <Tip text="T, the horizon the verdict is judged on. Official runway is shown separately and is not capped by T." /></label>
            <div className="unit"><input id="t" type="number" step="1" min="1" max="120" {...num('horizon_months')} /><span>months</span></div>
          </div>
          <button className="btn primary" type="submit" disabled={shockLoading}>{shockLoading ? <Spinner /> : 'Recalculate'}</button>
        </form>
        <ErrorBox msg={shockError} />
      </Card>

      {shock && v && (
        <>
          <div className={`verdict ${tone}`} role="status" aria-live="polite">
            <div className="mark" aria-hidden>{tone === 'ok' ? '✓' : tone === 'bad' ? '!' : '='}</div>
            <div>
              <div className="row between">
                <h2>{v.exact_at_horizon ? `Exactly ${T} months` : v.survives ? `Makes it through ${T} months` : `Does not make it through ${T} months`}</h2>
                <div className="row">
                  <span className="small muted">Official runway</span>
                  <span className="runway">{shock.shocked.runway_label}</span>
                  {shock.shocked.runway_status === 'no_shortfall' && <Chip>no monthly shortfall</Chip>}
                  {shock.shocked.runway_status === 'capped' && <Chip tone="gray">capped at 120</Chip>}
                  {shock.shocked.runway_status === 'exhausted' && <Chip tone="danger">buffer exhausted</Chip>}
                </div>
              </div>
              <p style={{ marginTop: 6 }}>{v.verdict}</p>
              <p className="small muted" style={{ marginTop: 6 }}>
                <strong>Why did this change?</strong> {shock.explanation.summary}
                {shock.explanation.primary_driver !== 'none' && <> Main driver: <strong>{shock.explanation.primary_driver === 'one_off' ? 'the one-time cost' : shock.explanation.primary_driver}</strong>.</>}
              </p>
              <p className="tiny muted" style={{ marginTop: 4 }}>Assumes the specified cash flows continue unchanged through the {T}-month period. Baseline runway: {shock.baseline.runway_label}.</p>
            </div>
          </div>

          <div className="grid cols-5">
            <div className="tile"><div className="label">Income after</div><div className="value">{fmt.money(shock.shocked.income_after)}</div><div className="sub">was {fmt.money(shock.baseline.income_after)}</div></div>
            <div className="tile"><div className="label">Spending after</div><div className="value">{fmt.money(shock.shocked.spending_after)}</div><div className="sub">was {fmt.money(shock.baseline.spending_after)}</div></div>
            <div className="tile"><div className="label">Monthly cash flow change</div><div className="value" style={{ color: shock.change_in_monthly_cash_flow < 0 ? 'var(--danger)' : 'var(--emerald)' }}>{fmt.signed(shock.change_in_monthly_cash_flow)}</div><div className="sub">gap now {fmt.money(shock.shocked.monthly_gap)}/mo</div></div>
            <div className="tile"><div className="label">Upfront cost</div><div className="value">{fmt.money(shock.upfront_cost)}</div><div className="sub">paid once</div></div>
            <div className="tile"><div className="label">Remaining buffer</div><div className="value">{fmt.money(shock.remaining_buffer)}</div><div className="sub">of {fmt.money(shock.baseline.buffer_left)}</div></div>
          </div>

          {(accessible || !compact) && (
            <Card title="Results table" right={<span className="small muted">Plain-text view, no colour needed</span>}>
              <DataTable
                headers={['Measure', 'Baseline', 'After shock']}
                rows={[
                  ['Monthly income', fmt.money(shock.baseline.income_after), fmt.money(shock.shocked.income_after)],
                  ['Monthly spending', fmt.money(shock.baseline.spending_after), fmt.money(shock.shocked.spending_after)],
                  ['Monthly gap (spending − income)', fmt.money(shock.baseline.monthly_gap), fmt.money(shock.shocked.monthly_gap)],
                  ['Buffer after one-time cost', fmt.money(shock.baseline.buffer_left), fmt.money(shock.shocked.buffer_left)],
                  ['Official runway', shock.baseline.runway_label, shock.shocked.runway_label],
                  [`Cash left after ${T} months`, '—', fmt.money(v.cash_left_at_horizon)],
                  [`Verdict at ${T} months`, '—', v.exact_at_horizon ? 'exactly at horizon' : v.survives ? 'makes it' : `short by ${fmt.money(v.shortfall_over_horizon)}`],
                ]}
                highlight={4}
              />
            </Card>
          )}

          <div className="grid cols-2">
            <Card title={<>Goal plan: before the shock <Tip text="Cash needed = C + T × max(0, monthly gap). Compared with the current buffer B. Capacity to save is the typical surplus I − S, an assumption." /></>}>
              <KV rows={[
                [`Cash this scenario needs over ${T} months`, fmt.money(shock.goal_plan.cash_needed)],
                ['Current buffer', fmt.money(shock.goal_plan.current_buffer)],
                ['Additional buffer needed', <strong key="a">{fmt.money(shock.goal_plan.additional_buffer_needed)}</strong>],
                ['Estimated capacity to save (I − S)', fmt.money(shock.goal_plan.capacity_to_save_per_month) + '/mo'],
                ['Months to reach target', shock.goal_plan.months_to_target == null ? (shock.goal_plan.additional_buffer_needed > 0 ? 'not reachable from surplus' : 'already there') : fmt.num(shock.goal_plan.months_to_target, 1)],
              ]} />
              <p className={`callout ${shock.goal_plan.reachable_from_surplus ? 'green' : 'red'}`} style={{ marginTop: 12 }}>{shock.goal_plan.note}</p>
            </Card>
            <Card title={<>Backup plan: if it happens <Tip text="Immediate need = max(0, C − B). Monthly improvement = max(0, gap − buffer_left / T). Monthly savings later cannot pay today's bill." /></>}>
              <KV rows={[
                ['Needed immediately', <strong key="i" style={{ color: shock.backup_plan.immediate_need > 0 ? 'var(--danger)' : undefined }}>{fmt.money(shock.backup_plan.immediate_need)}</strong>],
                ['Recurring monthly gap', fmt.money(shock.backup_plan.recurring_gap)],
                ['Buffer left to draw on', fmt.money(shock.backup_plan.buffer_left)],
                [`Free up per month to last ${T} months`, <strong key="m">{fmt.money(shock.backup_plan.monthly_improvement_needed)}</strong>],
                [`Unresolved gap over ${T} months if nothing changes`, fmt.money(shock.backup_plan.unresolved_gap_over_horizon)],
              ]} />
              <p className={`callout ${shock.backup_plan.unresolved_gap_over_horizon > 0 ? 'red' : 'green'}`} style={{ marginTop: 12 }}>{shock.backup_plan.note}</p>
              <p className="tiny muted" style={{ marginTop: 8 }}>{shock.backup_plan.no_discretionary_inference}</p>
            </Card>
          </div>

          <div className="grid cols-2">
            <Card title={<>Tipping point <Tip text="Largest household-bill increase this account absorbs through T months, given the income shock and one-time cost. Handles no bills, an upfront shortfall, and a baseline that already fails." /></>}>
              {shock.tipping_point.kind === 'ok' && (
                <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
                  <span className="runway" style={{ color: 'var(--forest)' }}>{fmt.pct(shock.tipping_point.max_bill_increase ?? 0)}</span>
                  <span className="small muted">bill increase absorbable ({fmt.money(shock.tipping_point.absorbable_extra_per_month)}/mo)</span>
                </div>
              )}
              <p className="small" style={{ marginTop: 6 }}>{shock.tipping_point.note}</p>
            </Card>
            <Card title="Show the math" right={<button className="btn ghost sm" onClick={() => setShowMath((s) => !s)}>{showMath ? 'Hide' : 'Show'}</button>}>
              {showMath ? (
                <DataTable headers={['Term', 'Value']} rows={[
                  ['I typical inflow (median money_in)', fmt.money(shock.shocked.inputs.I, 2)],
                  ['S typical spending (median money_out)', fmt.money(shock.shocked.inputs.S, 2)],
                  ['H household bills (median)', fmt.money(shock.shocked.inputs.H, 2)],
                  ['B buffer (mean avg_daily_balance, last 6 months)', fmt.money(shock.shocked.inputs.B, 2)],
                  ['r retained income', fmt.num(shock.shocked.inputs.r, 3)],
                  ['h bill increase', fmt.num(shock.shocked.inputs.h, 3)],
                  ['C one-time cost', fmt.money(shock.shocked.inputs.one_off, 2)],
                  ['income_after = r × I', fmt.money(shock.shocked.income_after, 2)],
                  ['spending_after = S + h × H', fmt.money(shock.shocked.spending_after, 2)],
                  ['buffer_left = B − C', fmt.money(shock.shocked.buffer_left, 2)],
                  ['gap = spending_after − income_after', fmt.money(shock.shocked.monthly_gap, 2)],
                  ['runway = min(buffer_left / gap, 120)', shock.shocked.runway == null ? 'no shortfall (120+)' : fmt.num(shock.shocked.runway, 4)],
                ]} />
              ) : <p className="small muted">Sponsor definitions with unrounded values. Runway is displayed to one decimal; verdicts use the unrounded number.</p>}
              <p className="tiny muted" style={{ marginTop: 8 }}>{shock.ei_note}</p>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
