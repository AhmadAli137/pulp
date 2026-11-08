import { useState } from 'react'
import { api, type PlanResult } from '../services/api'
import { useApp } from '../stores/useApp'
import { Card, Chip, ErrorBox, Spinner, Tip, fmt } from './ui'

/* Stage 3 council: deterministic fan-out, then Strategist + Challenger on Google ADK (Gemini), then validation.
   Every number shown comes from the engine; the agents only propose levers and flag feasibility. */
export default function CouncilPanel() {
  const { accountId, shockInputs } = useApp()
  const [res, setRes] = useState<PlanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async (useAi: boolean) => {
    if (!accountId) return
    setLoading(true); setErr(null)
    try {
      setRes(await api.plan({
        account_id: accountId, income_fraction: shockInputs.income_fraction, bills_increase: shockInputs.bills_increase,
        one_off_cost: shockInputs.one_off_cost, shock_duration: shockInputs.horizon_months, use_ai: useAi,
      }))
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) }
  }

  const sev = (s: string) => (s === 'high' ? 'danger' : s === 'medium' ? 'gold' : 'gray') as 'danger' | 'gold' | 'gray'

  return (
    <Card
      title={<span className="row">Planning council <Tip text="Code builds a grid of levers and scores each with the Monte Carlo engine under this shock. Two Gemini agents on Google ADK run in parallel: the Strategist proposes levers from your confirmed context and asks the engine to score them; the Challenger flags candidates you are unlikely to follow. Code then clamps, re-scores and ranks everything." /></span>}
      right={<div className="row">
        <button className="btn ghost" disabled={loading || !accountId} onClick={() => run(false)}>Grid only</button>
        <button className="btn" disabled={loading || !accountId} onClick={() => run(true)}>{loading ? <Spinner /> : 'Convene the council'}</button>
      </div>}
    >
      <ErrorBox msg={err} />
      {!res && !loading && <p className="small muted">Uses the shock set above. The council takes about 10 to 15 seconds; the grid alone is instant.</p>}
      {res && (
        <div className="stack">
          <div className="row wrap">
            <Chip tone={res.mode === 'adk' ? 'gold' : 'gray'}>{res.mode === 'adk' ? `Google ADK · ${res.framework.model}` : 'offline: grid only'}</Chip>
            <Chip tone="outline">{res.grid_size} grid candidates</Chip>
            {res.tool_calls.length > 0 && <Chip tone="outline">{res.tool_calls.length} engine call{res.tool_calls.length === 1 ? '' : 's'} by the Strategist</Chip>}
            <Chip tone="outline">{res.timing_seconds.total}s</Chip>
            {res.error && <Chip tone="danger">agents unavailable: {res.error.slice(0, 60)}</Chip>}
          </div>
          <div className="callout">
            <div className="t">Recommended: {res.recommended}</div>
            <div className="small">{res.why}</div>
            <div className="tiny muted">Objective: {res.objective.formula} · weights {fmt.pct(res.objective.weights.resilience)} safety / {fmt.pct(res.objective.weights.goal)} goal</div>
          </div>
          <table className="table">
            <thead><tr><th>#</th><th>Strategy</th><th>From</th><th>Monthly levers</th><th>P(shortfall)</th><th>Goal by deadline</th><th>Spending cut</th><th>Score</th><th>Challenger</th></tr></thead>
            <tbody>
              {res.ranked.map((c, i) => (
                <tr key={c.label + i} className={i === 0 ? 'hl' : ''}>
                  <td>{i + 1}</td>
                  <td>
                    <div>{c.label}</div>
                    {c.why && <div className="tiny muted">{c.why}</div>}
                  </td>
                  <td><Chip tone={c.source === 'strategist' ? 'gold' : 'gray'}>{c.source === 'strategist' ? 'Strategist' : 'grid'}</Chip></td>
                  <td className="small">
                    {c.levers.freed_up_per_month > 0 && <div>free up {fmt.money(c.levers.freed_up_per_month)}</div>}
                    {c.levers.goal_contribution_per_month > 0 && <div>save {fmt.money(c.levers.goal_contribution_per_month)}</div>}
                    {c.levers.emergency_floor > 0 && <div>floor {fmt.money(c.levers.emergency_floor)}</div>}
                    {c.levers.extra_income_per_month > 0 && <div>+{fmt.money(c.levers.extra_income_per_month)} income</div>}
                    {c.levers.freed_up_per_month === 0 && c.levers.goal_contribution_per_month === 0 && c.levers.extra_income_per_month === 0 && <span className="muted">none</span>}
                  </td>
                  <td>{fmt.pct(c.prob_shortfall_under_stress)}</td>
                  <td>{fmt.pct(c.goal_progress_at_deadline)}</td>
                  <td>{fmt.pct(c.disruption)}</td>
                  <td><b>{c.adjusted_score.toFixed(2)}</b>{c.adjusted_score !== c.score && <span className="tiny muted"> (raw {c.score.toFixed(2)})</span>}</td>
                  <td className="small">
                    {c.flags.length === 0 ? <span className="muted">no flag</span> : c.flags.map((f, j) => (
                      <div key={j}><Chip tone={sev(f.severity)}>{f.severity}</Chip> {f.risk}{f.because ? <span className="muted"> · {f.because}</span> : null}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {res.challenger?.questions && res.challenger.questions.length > 0 && (
            <div>
              <div className="t small">Challenger wants the companion to ask next</div>
              <ul className="small">{res.challenger.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}
          {res.validation_notes.length > 0 && <div className="tiny muted">Validation: {res.validation_notes.join(' · ')}</div>}
          <div className="tiny muted">{res.disclaimer}</div>
        </div>
      )}
    </Card>
  )
}
