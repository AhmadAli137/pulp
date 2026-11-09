import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useApp } from '../stores/useApp'
import DemoAccountPicker from '../components/DemoAccountPicker'
import { GoalCards, type Briefing } from '../components/FinancialOverview'

export default function Briefings() {
  const { accountId, context } = useApp()
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily')
  const [data, setData] = useState<Briefing | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setData(null)
    setError('')
    if (accountId) api.briefing(accountId, period).then((briefing) => {
      if (active) setData(briefing)
    }).catch((e) => { if (active) setError(e.message) })
    return () => { active = false }
  }, [accountId, period, context?.context_version])

  if (!accountId) return <DemoAccountPicker />

  return (
    <div className="financial-overview">
      <div className="briefing-tabs" role="group" aria-label="Briefing period">
        <button className="btn ghost" aria-pressed={period === 'daily'} onClick={() => setPeriod('daily')}>Daily briefing</button>
        <button className="btn ghost" aria-pressed={period === 'weekly'} onClick={() => setPeriod('weekly')}>Weekly summary</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading your briefing…</p>}
      {data && (
        <>
          <section className="financial-section">
            <span className="editorial-label">{data.from} to {data.through}</span>
            <h2>{data.headline}</h2>
            <p>{data.freshness} Records through {data.data_through}.</p>
            <div className="briefing-focus">{data.focus}</div>
            <p><Link to="/plan">Review My Plan</Link></p>
          </section>
          <section className="financial-section">
            <h2>What you updated</h2>
            {data.changes.length ? (
              <ul>{data.changes.map((change, index) => <li key={index}>{change.text} · {change.date}</li>)}</ul>
            ) : <p>No personal updates were saved during this period.</p>}
            <Link to="/profile">Update your details on Profile</Link>
          </section>
          <section className="financial-section">
            <h2>Your goals at a glance</h2>
            <GoalCards goals={data.goals} />
          </section>
          <section className="financial-section">
            <h2>Prepare your next decision</h2>
            <ol>{data.next_steps.map((step) => <li key={step}>{step}</li>)}</ol>
            <Link to="/shock">See what a shock could change</Link>
          </section>
        </>
      )}
    </div>
  )
}
