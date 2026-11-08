import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import FinancialOverview from '../components/FinancialOverview'
import ProfileInsights from '../components/ProfileInsights'
import { api, type ContextDoc } from '../services/api'
import { useApp } from '../stores/useApp'

export default function Twin() {
  const { accountId, context, refreshContext } = useApp()
  const [doc, setDoc] = useState<ContextDoc | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { let active = true; setDoc(null); setError(''); if (accountId) api.context(accountId).then(r => { if (active) setDoc(r.context) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [accountId, context?.context_version])
  if (!accountId) return <DemoAccountPicker />
  const remove = async (field: string, id: string) => {
    try { await api.edit(accountId, { field, operation: 'remove', target_id: id, value: {} }, false); await refreshContext() } catch (e) { setError((e as Error).message) }
  }
  const groups = ['goals', 'concerns', 'constraints', 'preferences', 'upcoming_events'] as const
  return <div className="stack"><FinancialOverview /><ProfileInsights compact /><section className="financial-section"><h2>What could change from here?</h2><p>Compare your current cash flow with a change in income, bills or a one-time cost.</p><Link to="/shock">Test a scenario and see both plans</Link></section><details className="financial-section"><summary>Review or remove details you told Pulp</summary>{error && <p role="alert">{error}</p>}{doc && groups.map(field => doc[field].filter(item => item.value.type !== 'financial_position').map(item => <div className="balance-item" key={item.id}><span>{String(item.value.label ?? item.value.type ?? field).replaceAll('_', ' ')}</span><button className="btn ghost" aria-label={`Remove ${String(item.value.label ?? item.value.type ?? field)}`} onClick={() => void remove(field, item.id)}>Remove</button></div>))}<p>Balances and goal savings can be updated above. Removing a detail makes an existing plan need review.</p></details></div>
}
