import { useCallback, useEffect, useState } from 'react'
import { api, type Branch, type SimBundle } from '../services/api'
import { useApp } from '../stores/useApp'
import ShockPanel from '../components/ShockPanel'
import { BranchChart, FanChart } from '../charts'
import { Card, Chip, DataTable, Empty, ErrorBox, Spinner, Tile, Tip, fmt } from '../components/ui'

const SCENARIOS = [
  { key: 'baseline', label: 'Baseline' }, { key: 'income_loss', label: 'Income loss' }, { key: 'higher_costs', label: 'Higher living costs' },
  { key: 'one_off', label: 'Surprise repair' }, { key: 'positive_income', label: 'Positive income change' }, { key: 'combined', label: 'Combined shock' }, { key: 'custom', label: 'Custom' },
]

export default function Explore() {
  const { accountId, profile, accessible, activePlan } = useApp()
  const [type, setType] = useState(activePlan ? 'custom' : 'income_loss')
  const [f, setF] = useState({ income_fraction: 0.55, bills_increase: 0, one_off_cost: 0, shock_start: 0, shock_duration: 6, positive_income_change: 0, positive_start: 0, horizon_months: 24, n_paths: 500 })
  const [s, setS] = useState({ freed_up_per_month: 0, goal_contribution_per_month: 0, goal_target: 0, emergency_floor: 0 })
  const [res, setRes] = useState<SimBundle | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [active, setActive] = useState('income_loss')

  const run = useCallback(async () => {
    if (!accountId) return
    setBusy(true); setErr(null)
    try {
      const scenario = type === 'custom' ? { scenario_type: 'custom', ...f } : { preset: type, horizon_months: f.horizon_months, n_paths: f.n_paths, shock_start: f.shock_start }
      const r = await api.simulate({ account_id: accountId, scenario, strategy: { label: 'Custom', ...s } })
      setRes(r)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }, [accountId, type, f, s])

  useEffect(() => {
    if (activePlan) {
      const sh = activePlan.request.shock
      setType('custom')
      setF((v) => ({ ...v, income_fraction: sh.r, bills_increase: sh.h, one_off_cost: sh.one_off, shock_duration: sh.duration_months, horizon_months: activePlan.request.horizon_months }))
      const c = activePlan.ranked[0]
      if (c) setS({ ...c.levers, goal_target: activePlan.request.goal.target_amount })
    }
  }, [activePlan])
  useEffect(() => { void run() }, [accountId, type, f, s]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (accountId) api.branches(accountId, 24).then((b) => setBranches(b.branches)).catch(() => undefined) }, [accountId])

  if (!profile || !accountId) return <Empty>Select an account first.</Empty>
  const sc = res?.scenario
  const pick = (k: string) => { setActive(k); if (k !== 'custom') { setType(k); } }
  const act = branches.find((b) => b.key === active)
  const n = (k: keyof typeof f, scale = 1) => ({ value: String(Math.round(f[k] * scale * 1000) / 1000), onChange: (e: React.ChangeEvent<HTMLInputElement>) => { const v = Number(e.target.value); if (!Number.isNaN(v)) setF((o) => ({ ...o, [k]: v / scale })) } })
  const ns = (k: keyof typeof s) => ({ value: String(s[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => { const v = Number(e.target.value); if (!Number.isNaN(v)) setS((o) => ({ ...o, [k]: v })) } })

  return (
    <div className="stack">
      <Card title="Future explorer" right={<span className="small muted">Monte Carlo on this account's own history · seeded, reproducible</span>}>
        <div className="preset-row">
          {SCENARIOS.map((x) => <button key={x.key} className={`preset${type === x.key ? ' active' : ''}`} onClick={() => { setType(x.key); if (x.key !== 'custom') setActive(x.key) }}>{x.label}</button>)}
        </div>
        <form className="grid cols-5" style={{ marginTop: 14, alignItems: 'end' }} onSubmit={(e) => { e.preventDefault(); void run() }}>
          {type === 'custom' && (<>
            <div className="field"><label>Income retained %</label><input type="number" {...n('income_fraction', 100)} /></div>
            <div className="field"><label>Bills change %</label><input type="number" {...n('bills_increase', 100)} /></div>
            <div className="field"><label>One-time cost $</label><input type="number" {...n('one_off_cost')} /></div>
            <div className="field"><label>Positive income change %</label><input type="number" {...n('positive_income_change', 100)} /></div>
            <div className="field"><label>Positive change starts (month)</label><input type="number" {...n('positive_start')} /></div>
            <div className="field"><label>Shock duration (months)</label><input type="number" {...n('shock_duration')} /></div>
          </>)}
          <div className="field"><label>Shock starts (month)</label><input type="number" min="0" {...n('shock_start')} /></div>
          <div className="field"><label>Horizon (months)</label><input type="number" min="6" max="120" {...n('horizon_months')} /></div>
          <div className="field"><label>Simulation paths</label><input type="number" min="50" max="5000" step="50" {...n('n_paths')} /></div>
          <div className="field"><label>Free up per month $ <Tip text="A stated amount you would cut from spending every month. Not inferred from the data." /></label><input type="number" min="0" {...ns('freed_up_per_month')} /></div>
          <div className="field"><label>Goal contribution $/mo</label><input type="number" min="0" {...ns('goal_contribution_per_month')} /></div>
          <div className="field"><label>Goal target $</label><input type="number" min="0" {...ns('goal_target')} /></div>
          <div className="field"><label>Emergency floor $ <Tip text="Contributions pause while the buffer is below this floor." /></label><input type="number" min="0" {...ns('emergency_floor')} /></div>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? <Spinner /> : 'Simulate'}</button>
        </form>
        <ErrorBox msg={err} />
      </Card>

      {sc && res && (
        <>
          <div className="grid cols-5">
            <Tile label="Paths that hit zero" value={fmt.pct(sc.prob_below_zero_any)} sub={`within ${f.horizon_months} months · ${sc.n_paths} paths`} tip="Share of simulated paths whose buffer went below zero at any month. A model probability for this chosen scenario, not a real-world probability." />
            <Tile label="Median lowest buffer" value={fmt.money(sc.median_min_buffer)} sub={`10th percentile ${fmt.money(sc.p10_min_buffer)}`} />
            <Tile label="Median buffer at horizon" value={fmt.money(sc.median_end_buffer)} sub={`baseline ${fmt.money(res.baseline.median_end_buffer)}`} />
            <Tile label="Typical-month path runs out" value={res.deterministic.deterministic_month_cash_runs_out == null ? 'never' : `month ${res.deterministic.deterministic_month_cash_runs_out}`} sub="deterministic check vs official runway" />
            <Tile label="Goal reached" value={sc.goal_target > 0 ? fmt.pct(sc.goal_reached_share ?? 0) : '—'} sub={sc.goal_target > 0 && sc.goal_reached_month_median ? `median month ${sc.goal_reached_month_median}` : 'set a goal target'} />
          </div>
          <Card title="Projected buffer: baseline versus shocked, with uncertainty bands" right={<Chip tone="gray">{sc.calibration}</Chip>}>
            <FanChart months={sc.months} {...sc.buffer_percentiles} baseline={res.baseline.buffer_percentiles.p50} det={res.deterministic.buffer_percentiles.p50} goal={sc.goal_target > 0 ? sc.goal_fund_median : undefined} />
            <p className="tiny muted" style={{ marginTop: 6 }}>{sc.disclaimer}</p>
            {accessible && <DataTable headers={['Month', 'P10', 'Median', 'P90', 'Baseline median', 'Share below zero so far']} rows={sc.months.filter((m) => m % 3 === 0).map((m) => [m, fmt.money(sc.buffer_percentiles.p10[m]), fmt.money(sc.buffer_percentiles.p50[m]), fmt.money(sc.buffer_percentiles.p90[m]), fmt.money(res.baseline.buffer_percentiles.p50[m]), fmt.pct(sc.prob_below_zero_by_month[m])])} />}
          </Card>
        </>
      )}

      <Card title="Choose a possibility to compare" right={<span className="small muted">Click a branch for its numbers · 24 months · stated assumptions</span>}>
        {branches.length === 0 ? <Empty><Spinner /></Empty> : (
          <div className="grid branch-layout">
            <div className="stack">
              <div className="branch" style={{ background: 'var(--forest)', color: '#fff', cursor: 'default' }}><div className="t">TODAY</div><div className="m" style={{ color: 'rgba(255,255,255,0.7)' }}>buffer {fmt.money(profile.buffer)}</div></div>
              {branches.map((b) => (
                <button key={b.key} className={`branch${active === b.key ? ' active' : ''}`} onClick={() => pick(b.key)}>
                  <div className="t">{b.label}</div>
                  <div className="m">{fmt.pct(b.prob_below_zero_any)} of paths hit zero · ends {fmt.money(b.median_end_buffer)}</div>
                </button>
              ))}
            </div>
            <div>
              <BranchChart branches={branches} active={active} onPick={pick} />
              {act && (
                <div className="grid cols-4" style={{ marginTop: 10 }}>
                  <Tile label="Branch" value={act.label} />
                  <Tile label="Paths hitting zero" value={fmt.pct(act.prob_below_zero_any)} />
                  <Tile label="Median buffer at 24 months" value={fmt.money(act.median_end_buffer)} />
                  <Tile label="Typical-month path" value={act.deterministic_month_cash_runs_out == null ? `ends ${fmt.money(act.deterministic_end_buffer)}` : `runs out month ${act.deterministic_month_cash_runs_out}`} />
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="section">
        <h2>Check the immediate effect</h2>
        <p className="small muted" style={{ marginBottom: 12 }}>Review how the same change affects money coming in, essential costs and your available buffer.</p>
        <ShockPanel />
      </div>
    </div>
  )
}
