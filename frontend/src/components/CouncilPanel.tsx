import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type PlanResult } from '../services/api'
import { useApp } from '../stores/useApp'
import { Card, ErrorBox, Spinner, fmt } from './ui'

export default function CouncilPanel() {
  const { accountId, shockInputs, activePlan, planStale, refreshSession } = useApp()
  const [localResult, setResult] = useState<PlanResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const result = activePlan ?? (localResult?.account_id === accountId ? localResult : null)
  const sh = result?.request.shock
  const stale = !!result && (planStale || sh?.r !== shockInputs.income_fraction || sh?.h !== shockInputs.bills_increase || sh?.one_off !== shockInputs.one_off_cost || sh?.duration_months !== shockInputs.horizon_months)
  const run = async () => {
    if (!accountId) return
    setBusy(true); setError(null)
    try { setResult(await api.plan({ account_id: accountId, income_fraction: shockInputs.income_fraction, bills_increase: shockInputs.bills_increase, one_off_cost: shockInputs.one_off_cost, shock_duration: shockInputs.horizon_months, use_ai: true })); await refreshSession() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <Card title="What could you change?" right={<button className="btn" disabled={busy || !accountId} onClick={() => void run()}>{busy ? <Spinner /> : 'Compare practical options'}</button>}><ErrorBox msg={error} />{stale && <p role="status">The scenario or your details changed. Compare options again to update the outcomes.</p>}{!result && <p>Compare ways to protect your buffer and work toward your goal under the scenario above. Pulp will identify what still needs your confirmation.</p>}{result && !stale && <><p>{result.why}</p><div className="strategy-cards">{result.ranked.slice(0, 3).map((c, i) => <article key={c.label}><span className="editorial-label">Option {i + 1}</span><h3>{c.action ?? c.label}</h3><p>{c.how}</p><p>{c.means}</p><p>{fmt.money(c.levers.goal_contribution_per_month)}/month toward your goal; {fmt.money(c.levers.freed_up_per_month)}/month spending change assumed.</p><p>{fmt.pct(c.prob_shortfall_under_stress)} of simulated paths run short; modeled goal progress {fmt.pct(c.goal_progress_at_deadline)} by the target date.</p>{c.needs_context?.map(q => <p key={q}><strong>Still to establish:</strong> {q}</p>)}{c.flags.map((f, j) => <p key={j}>{f.risk}</p>)}</article>)}</div><p className="small muted">{result.disclaimer}</p><Link to="/plan">See your plans in My Plan</Link></>}</Card>
}
