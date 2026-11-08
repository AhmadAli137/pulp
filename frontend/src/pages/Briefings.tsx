import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useApp } from '../stores/useApp'
import { GoalCards, StrategyCards, talk, type Briefing } from '../components/FinancialOverview'

export default function Briefings() {
  const { accountId, context } = useApp()
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily')
  const [data, setData] = useState<Briefing | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { let active = true; setData(null); setError(''); if (accountId) api.briefing(accountId, period).then(v => { if (active) setData(v) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [accountId, period, context?.context_version])
  if (!accountId) return <p>Select an account to see your briefing.</p>
  return <div className="financial-overview"><div className="briefing-tabs" aria-label="Briefing period"><button className="btn ghost" aria-pressed={period === 'daily'} onClick={() => setPeriod('daily')}>Daily briefing</button><button className="btn ghost" aria-pressed={period === 'weekly'} onClick={() => setPeriod('weekly')}>Weekly summary</button></div>{error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Preparing your perspective...</p>}{data && <><section className="financial-section"><span className="editorial-label">{data.from} to {data.through}</span><h2>{data.headline}</h2><p>{data.freshness} Records through {data.data_through}.</p><div className="briefing-focus">{data.focus}</div><p><Link to={talk(data.focus)}>Talk this through with Pulp</Link></p><small>{data.delivery}</small></section><section className="financial-section"><h2>What you updated</h2>{data.changes.length ? <ul>{data.changes.map((c, i) => <li key={i}>{c.text} · {c.date}</li>)}</ul> : <p>No saved personal updates in this period. This does not mean your finances were unchanged.</p>}<Link to="/twin">Update balances and goal savings</Link></section><section className="financial-section"><h2>Your goals at a glance</h2><GoalCards goals={data.goals} /></section><StrategyCards choices={data.choices} stale={data.plan_stale} /><section className="financial-section"><h2>Prepare your next decision</h2><ol>{data.next_steps.map(q => <li key={q}><p><Link to={talk(q)}>{q}</Link></p></li>)}</ol><Link to="/roadmap">Review your action plan</Link></section></>}</div>
}
