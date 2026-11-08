import FinancialOverview from '../components/FinancialOverview'
import DemoAccountPicker from '../components/DemoAccountPicker'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Comparison, type Snapshot, type Diff } from '../services/api'
import { useApp } from '../stores/useApp'
import { GoalProgressChart } from '../charts'
import { Card, Chip, Empty, ErrorBox, Spinner, Tip, fmt } from '../components/ui'

const GOAL_TYPES = ['emergency_fund', 'move_out', 'home_purchase', 'entrepreneurship', 'education', 'vehicle', 'travel', 'wedding', 'debt_payoff', 'retirement', 'family', 'other']

export default function Goals() {
  const { accountId, profile, lastReplan, setLastReplan, refreshContext, context } = useApp()
  const [cmp, setCmp] = useState<Comparison | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hist, setHist] = useState<{ current: Snapshot | null; previous: Snapshot | null; diff: Diff | null } | null>(null)
  const [form, setForm] = useState({ type: 'emergency_fund', label: '', target_amount: '', target_months: '', risk: 'balanced', free_up: '' })

  useEffect(() => {
    const goal = [...(context?.goals ?? [])].sort((a,b) => Number(a.priority ?? 1)-Number(b.priority ?? 1))[0]
    const capacity = context?.constraints.find(c => c.type === 'can_free_up_per_month')
    setForm({ type: String(goal?.type ?? 'emergency_fund'), label: String(goal?.label ?? ''), target_amount: goal?.target_amount != null ? String(goal.target_amount) : '', target_months: goal?.target_months != null ? String(goal.target_months) : '', risk: String(context?.preferences.find(p => p.type === 'risk_preference')?.choice ?? 'balanced'), free_up: capacity?.amount != null ? String(capacity.amount) : '' })
  }, [accountId, context?.context_version])

  const load = useCallback(async () => {
    if (!accountId) return
    setBusy(true); setErr(null); setCmp(null); setHist(null)
    try {
      const [c, d] = await Promise.all([api.compare(accountId), api.replanDiff(accountId)])
      setCmp(c); setHist({ current: d.current, previous: d.previous, diff: d.diff })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }, [accountId])
  useEffect(() => { void load() }, [load, lastReplan])

  if (!profile || !accountId) return <DemoAccountPicker />

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
  const diff = hist?.diff

  return (
    <div className="stack">
      <FinancialOverview goalsOnly />
      <div className="grid cols-2">
        <Card title="What you are working toward" right={<Chip tone="gold">Your priorities shape the comparison</Chip>}>
          <form className="stack" onSubmit={saveGoal}>
            <div className="grid cols-2">
              <div className="field"><label htmlFor="goal-type">Goal type</label><select id="goal-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{GOAL_TYPES.map((g) => <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>)}</select></div>
              <div className="field"><label htmlFor="goal-label">Label (optional)</label><input id="goal-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Move into my own place" /></div>
              <div className="field"><label htmlFor="goal-target">Target amount (CAD)</label><input id="goal-target" type="number" min="0" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} /></div>
              <div className="field"><label htmlFor="goal-months">Target timeline (months)</label><input id="goal-months" type="number" min="1" max="240" value={form.target_months} onChange={(e) => setForm({ ...form, target_months: e.target.value })} /></div>
              <div className="field"><label htmlFor="goal-priority">Priority</label><select id="goal-priority" value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })}><option value="balanced">Balanced</option><option value="safety">Keep a larger safety buffer</option><option value="speed">Reach the goal faster</option></select></div>
              <div className="field"><label htmlFor="goal-capacity">I could free up $/month <Tip text="Use an amount you could realistically cut from your monthly spending." /></label><input id="goal-capacity" type="number" min="0" value={form.free_up} onChange={(e) => setForm({ ...form, free_up: e.target.value })} /></div>
            </div>
            <div className="row between">
              <span className="small muted">Add a budget and a timeline when you know them. Saving updates the comparison below.</span>
              <button className="btn primary" type="submit" disabled={busy}>{busy ? <Spinner /> : 'Save goal & review choices'}</button>
            </div>
          </form>
          <ErrorBox msg={err} />
        </Card>
        <Card title="Where this plan could take you" right={cmp && <Chip tone="gray">{cmp.goal.source === 'default' ? 'default goal' : 'confirmed goal'}</Chip>}>
          {cmp && rec ? (<>
            <div className="row between" style={{ marginBottom: 6 }}>
              <div><div className="strong">{cmp.goal.label}</div><div className="small muted">{fmt.money(cmp.goal.target_amount)} in {cmp.goal.target_months} months · {cmp.goal.assumption}</div></div>
              <Chip>{cmp.goal.target_amount > 0 ? `${fmt.pct(rec.goal_progress_at_deadline)} by deadline on recommended plan` : "Budget needed"}</Chip>
            </div>
            {cmp.goal.target_amount > 0 && <GoalProgressChart path={rec.goal_median_path} target={cmp.goal.target_amount} deadline={Math.min(cmp.goal.target_months, cmp.horizon_months)} />}
          </>) : <Empty>{busy ? <Spinner /> : 'No comparison yet.'}</Empty>}
        </Card>
      </div>

      <Card title="Your choices, side by side" right={cmp && <span className="small muted">{cmp.stress_label} · capacity {fmt.money(cmp.capacity_per_month)}/mo</span>}>
        {cmp ? (<>
          <div className="grid cols-4" style={{ marginBottom: 12 }}>
            {cmp.strategies.slice(0, 3).map((s) => (
              <div key={s.key} className={`tile${s.key === cmp.recommended ? ' accent' : ''}`} style={{ opacity: s.feasible ? 1 : 0.6 }}>
                <div className="label">{s.action ?? s.label}{s.key === cmp.recommended && <Chip tone="gold">Option to discuss</Chip>}</div>
                {s.means && <p>{s.means}</p>}
                {s.needs_context?.map(q => <p key={q}>{q}</p>)}
                <div className="value">{s.feasible ? fmt.pct(s.prob_shortfall_under_stress) : 'n/a'}</div>
                <div className="sub">{s.feasible ? <>of simulated paths run short under this scenario · goal {fmt.pct(s.goal_progress_at_deadline)} by deadline{s.months_to_goal_deterministic ? ` · reached month ${Math.round(s.months_to_goal_deterministic)}` : ''} · {fmt.money(s.monthly_contribution)}/mo</> : s.infeasible_reason}</div>
              </div>
            ))}
          </div>

          <p className="callout green" style={{ marginTop: 10 }}><strong>Trade-off:</strong> {cmp.why}</p>
          <p className="small muted">{cmp.capacity_assumption} These are modeled outcomes, not forecasts. Recorded goal savings are shown separately above.</p>
        </>) : <Empty>{busy ? <Spinner /> : 'No comparison yet.'}</Empty>}
      </Card>

      {diff?.materially_changed && <Card title="What changed in your plan"><ul>{diff.reasons.map(r => <li key={r}>{r}</li>)}</ul></Card>}
      <section className="financial-section"><h2>Choose your next step</h2><p>Check which option leaves room for your essential costs and your backup plan.</p><Link to="/plan">Review My Plan</Link></section>
    </div>
  )
}
