import { useEffect, useState } from 'react'
import { api, type Insights } from '../services/api'
import { useApp } from '../stores/useApp'
import PersonProfile from './PersonProfile'
import { Card, Spinner } from './ui'

export default function ProfileInsights({ compact = false }: { compact?: boolean }) {
  const { accountId, context } = useApp()
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!accountId) { setData(null); return }
    let alive = true
    setLoading(true)
    setFailed(false)
    setData(previous => previous?.account_id === accountId ? previous : null)
    api.insights(accountId, false)
      .then(result => { if (alive) setData(result) })
      .catch(() => { if (alive) setFailed(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [accountId, context?.context_version])

  if (!accountId) return null
  if (failed) return <p role="alert">Account records are temporarily unavailable. Refresh to try again.</p>
  if (!data || data.account_id !== accountId) {
    return <Card title="Your account records"><div className="row"><Spinner /> <span className="small muted">Loading records…</span></div></Card>
  }

  const profile = data.decision_profile
  return (
    <div className="stack">
      {loading && <p className="small muted" role="status">Updating your account records…</p>}
      {profile?.life_profile && <PersonProfile profile={profile.life_profile} />}
      {profile && (
        <section className="card stack evidence-editorial" aria-labelledby="decision-evidence">
          <h2 id="decision-evidence">Insights for your decisions</h2>
          <p className="evidence-dateline">These patterns come from historical account activity. Check what has changed before making a plan.</p>
          {[...profile.observations].sort((a, b) => b.priority - a.priority).slice(0, compact ? 1 : 3).map((o, index) => (
            <article className="evidence-story" key={o.key}>
              <span className="story-index" aria-hidden>{index + 1}</span>
              <div>
                <span className="editorial-label">Observed</span>
                <h3>{o.evidence}</h3>
                <p>{o.life_effect}</p>
                <div className="evidence-meaning">
                  <span className="editorial-label">What this helps you decide</span>
                  <p>{o.unlocks}</p>
                </div>
                {o.needs_answer && <p className="evidence-question">{o.question}</p>}
                <p><small>{o.source} · {o.period.from} to {o.period.to}</small></p>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
