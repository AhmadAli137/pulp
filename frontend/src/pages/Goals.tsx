import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Comparison, type Snapshot, type Diff } from '../services/api'
import { useApp } from '../stores/useApp'
import { GoalProgressChart, ReplanChart, StrategyChart } from '../charts'
import { Card, Chip, DataTable, Empty, ErrorBox, Spinner, Tile, Tip, fmt } from '../components/ui'

const GOAL_TYPES = ['emergency_fund', 'move_out', 'home_purchase', 'entrepreneurship', 'education', 'vehicle', 'travel', 'wedding', 'debt_payoff', 'retirement', 'family', 'other']

export default function Goals() {
  const { accountId, profile, lastReplan, setLastReplan, refreshContext, accessible, context } = useApp()
  const [cmp, setCmp] = useState<Comparison | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hist, setHist] = useState<{ current: Snapshot | null; previous: Snapshot | null; diff: Diff | null } | null>(null)
  const [form, setForm] = useState({ type: 'emergency_fund', label: '', target_amount: '', target_months: '', risk: 'balanced', free_up: '' })

  const load = useCallback(async () => {
    if (!accountId) return
    setBusy(true); setErr(null)
    try {
      const [c, d] = await Promise.all([api.compare(accountId), api.replanDiff(accountId)])
      setCmp(c); setHist({ current: d.current, previous: d.previous, diff: d.diff })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }, [accountId])
  useEffect(() => { void load() }, [load, lastReplan])

  if (!profile || !accountId) return <Empty>Select an account first.</Empty>

  const saveGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    const changes: { field: string; operation?: string; value: Record<string, unknown> }[] = [{
      field: 'goals', value: { type: form.type, label: form.label || form.type.replace(/_/g, ' '), priority: 1, ...(form.target_amount ? { target_amount: Number(form.target_amount) } : {}), ...(form.target_months ? { target_months: Number(form.target_months) } : {}) },
    }]
    if (form.risk !== 'balanced') changes.push({ field: 'preferences', value: { type: 'risk_preference', choice: form.risk } })
    if (form.free_up) changes.push({ field: 'constraints', value: { type: 'can_free_up_per_month', amount: Number(form.free_up) } })
    setBusy(true)
    try {
      const p = await api.propose(accountId, changes)
      const r = await api.confirm(accountId, p.proposal.id, true)
      if (r.replan) setLastReplan(r.replan)
      await refreshContext()
      await load()
    } catch (ex) { setErr((ex as Error).message) } finally { setBusy(false) }
  }

  const rec = cmp?.strategies.find((s) => s.key === cmp.recommended)
  const cur = hist?.current; const prev = hist?.previous; const diff = hist?.diff

  return (
    <div className="stack">
      <div className="grid cols-2">
        <Card title="Your goal" right={<Chip tone="gold">a new preference never changes official runway</Chip>}>
          <form className="stack" onSubmit={saveGoal}>
            <div className="grid cols-2">
              <div className="field"><label>Goal type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{GOAL_TYPES.map((g) => <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>)}</select></div>
              <div className="field"><label>Label (optional)</label><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Move into my own place" /></div>
              <div className="field"><label>Target amount $ <Tip text="Leave blank to use a labelled default: the stress-scenario need for an emergency fund, otherwise three months of typical spending." /></label><input type="number" min="0" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} /></div>
              <div className="field"><label>Target timeline (months)</label><input type="number" min="1" max="240" value={form.target_months} onChange={(e) => setForm({ ...form, target_months: e.target.value })} /></div>
              <div className="field"><label>Priority</label><select value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })}><option value="balanced">Balanced</option><option value="safety">Keep a larger safety buffer</option><option value="speed">Reach the goal faster</option></select></div>
              <div className="field"><label>I could free up $/month <Tip text="A constraint you state. The data does not label discretionary spending, so PULP never guesses this." /></label><input type="number" min="0" value={form.free_up} onChange={(e) => setForm({ ...form, free_up: e.target.value })} /></div>
            </div>
            <div className="row between">
              <span className="small muted">Confirming saves to your context (v{context?.context_version ?? 1}) and replans. Or <Link to="/companion">tell the companion</Link>.</span>
              <button className="btn primary" type="submit" disabled={busy}>{busy ? <Spinner /> : 'Confirm goal and replan'}</button>
            </div>
          </form>
          <ErrorBox msg={err} />
        </Card>
        <Card title="Goal progress" right={cmp && <Chip tone="gray">{cmp.goal.source === 'default' ? 'default goal' : 'confirmed goal'}</Chip>}>
          {cmp && rec ? (<>
            <div className="row between" style={{ marginBottom: 6 }}>
              <div><div className="strong">{cmp.goal.label}</div><div className="small muted">{fmt.money(cmp.goal.target_amount)} in {cmp.goal.target_months} months · {cmp.goal.assumption}</div></div>
              <Chip>{fmt.pct(rec.goal_progress_at_deadline)} by deadline on recommended plan</Chip>
            </div>
            <GoalProgressChart path={rec.goal_median_path} target={cmp.goal.target_amount} deadline={Math.min(cmp.goal.target_months, cmp.horizon_months)} />
          </>) : <Empty>{busy ? <Spinner /> : 'No comparison yet.'}</Empty>}
        </Card>
      </div>

      <Card title="Strategy comparison" right={cmp && <span className="small muted">{cmp.stress_label} · capacity {fmt.money(cmp.capacity_per_month)}/mo</span>}>
        {cmp ? (<>
          <div className="grid cols-4" style={{ marginBottom: 12 }}>
            {cmp.strategies.map((s) => (
              <div key={s.key} className={`tile${s.key === cmp.recommended ? ' accent' : ''}`} style={{ opacity: s.feasible ? 1 : 0.6 }}>
                <div className="label">{s.label}{s.key === cmp.recommended && <Chip tone="gold">recommended</Chip>}</div>
                <div className="value">{s.feasible ? fmt.pct(s.prob_shortfall_under_stress) : 'n/a'}</div>
                <div className="sub">{s.feasible ? <>paths hitting zero under stress · goal {fmt.pct(s.goal_progress_at_deadline)} by deadline{s.months_to_goal_deterministic ? ` · reached month ${Math.round(s.months_to_goal_deterministic)}` : ''} · {fmt.money(s.monthly_contribution)}/mo</> : s.infeasible_reason}</div>
              </div>
            ))}
          </div>
          <StrategyChart strategies={cmp.strategies} recommended={cmp.recommended} />
          <p className="callout green" style={{ marginTop: 10 }}><strong>Why:</strong> {cmp.why} {cmp.weights.reasons.join(' ')}</p>
          <p className="tiny muted" style={{ marginTop: 6 }}>{cmp.capacity_assumption} Emergency target {fmt.money(cmp.emergency_target)} = six months of the layoff gap. Scores: {fmt.pct(cmp.weights.resilience)} resilience + {fmt.pct(cmp.weights.goal)} goal progress.</p>
          {accessible && <DataTable headers={['Strategy', 'Feasible', 'Shortfall share', 'Goal by deadline', 'Months to goal', 'Contribution', 'Score']} rows={cmp.strategies.map((s) => [s.label, s.feasible ? 'yes' : 'no', fmt.pct(s.prob_shortfall_under_stress), fmt.pct(s.goal_progress_at_deadline), s.months_to_goal_deterministic ?? '—', fmt.money(s.monthly_contribution), s.score.toFixed(2)])} />}
        </>) : <Empty>{busy ? <Spinner /> : 'No comparison yet.'}</Empty>}
      </Card>

      <Card title="Before and after: what changed when you told us more" right={<Chip tone={diff?.materially_changed ? 'gold' : 'gray'}>{!cur ? 'no plan yet' : !prev ? 'first plan' : diff?.materially_changed ? 'strategy changed' : 'no material change'}</Chip>}>
        {!cur ? <p className="small muted">Confirm a goal (above or in the companion) to create the first plan; the next confirmed change produces a comparison here.</p> : (
          <div className="stack">
            {diff && <ul style={{ margin: 0, paddingLeft: 18 }} className="small">{diff.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            <div>
              <div className="diffrow strong"><span>Measure</span><span>Previous plan</span><span>Current plan</span></div>
              {([
                ['Goal', prev?.goal.label, cur.goal.label],
                ['Goal target', prev ? fmt.money(prev.goal.target_amount) : undefined, fmt.money(cur.goal.target_amount)],
                ['Goal timeline', prev ? `${prev.goal.target_months} months` : undefined, `${cur.goal.target_months} months`],
                ['Emergency-fund target', prev ? fmt.money(prev.emergency_target) : undefined, fmt.money(cur.emergency_target)],
                ['Stress scenario', prev?.stress_label, cur.stress_label],
                ['Recommended strategy', prev?.recommended_label, cur.recommended_label],
                ['Monthly contribution', prev ? fmt.money(prev.monthly_contribution) : undefined, fmt.money(cur.monthly_contribution)],
                ['Modeled shortfall frequency', prev ? fmt.pct(prev.prob_shortfall_under_stress) : undefined, fmt.pct(cur.prob_shortfall_under_stress)],
                ['Months to goal', prev ? (prev.months_to_goal ? Math.round(prev.months_to_goal) : 'not within horizon') : undefined, cur.months_to_goal ? Math.round(cur.months_to_goal) : 'not within horizon'],
                ['Weights (resilience / goal)', prev ? `${fmt.pct(prev.weights.resilience)} / ${fmt.pct(prev.weights.goal)}` : undefined, `${fmt.pct(cur.weights.resilience)} / ${fmt.pct(cur.weights.goal)}`],
              ] as [string, string | number | undefined, string | number][]).map(([k, o, n]) => (
                <div key={k} className="diffrow"><span className="muted">{k}</span><span className={o !== undefined && String(o) !== String(n) ? 'old' : ''}>{o ?? '—'}</span><span className={o !== undefined && String(o) !== String(n) ? 'new' : ''}>{n}</span></div>
              ))}
            </div>
            <ReplanChart before={prev ? { buffer: prev.buffer_median_path, goal: prev.goal_median_path } : null} after={{ buffer: cur.buffer_median_path, goal: cur.goal_median_path }} />
            <div className="grid cols-3">
              <Tile label="Version" value={`v${cur.context_version}`} sub={cur.trigger ?? ''} />
              <Tile label="Resilience change" value={prev ? `${fmt.pct(prev.prob_shortfall_under_stress)} → ${fmt.pct(cur.prob_shortfall_under_stress)}` : fmt.pct(cur.prob_shortfall_under_stress)} sub="share of stress paths hitting zero" />
              <Tile label="Official runway" value={profile.baseline_runway_label} sub="unchanged by preferences, by design" />
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
