import { ArrowUpRight, Check, CircleDashed } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../services/api'
import { useApp } from '../stores/useApp'

export default function CurrentPlan() {
  const { activePlan: plan, planStale, context } = useApp()
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  if (!plan) return <div className="plan-continuity empty"><CircleDashed size={16} /><span>Your conversation becomes your plan. Start with what matters to you.</span></div>
  const sh = plan.request.shock
  return <section className={`plan-continuity ${planStale ? 'stale' : ''}`} aria-label="Current shared plan">
    <div className="plan-continuity-label"><Check size={14} />{planStale ? 'Needs review' : 'Your current plan'}<span>v{context?.context_version ?? plan.request.context_version}</span></div>
    <div className="plan-continuity-body"><div><strong>{plan.recommended}</strong><p>{plan.request.goal.label} <span>&middot;</span> {sh.duration_months} months at {Math.round(sh.r * 100)}% income{sh.one_off > 0 ? ` / $${sh.one_off.toLocaleString()} one-time cost` : ''}</p></div><Link to="/goals">Review plan <ArrowUpRight size={15} /></Link></div>
    {planStale && <p>Your context changed. <button disabled={updating} onClick={async () => {
      setUpdating(true); setError('')
      try { await api.plan({ account_id: plan.account_id, income_fraction: sh.r, bills_increase: sh.h, one_off_cost: sh.one_off, shock_duration: sh.duration_months, use_ai: true }); await useApp.getState().refreshSession() }
      catch (e) { setError((e as Error).message) } finally { setUpdating(false) }
    }}>{updating ? 'Reviewing...' : 'Update this plan'}</button></p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
