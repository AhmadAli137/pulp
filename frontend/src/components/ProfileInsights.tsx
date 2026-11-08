import PersonProfile from './PersonProfile'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { api, type Insights } from '../services/api'
import { useApp } from '../stores/useApp'
import { Card, Spinner } from './ui'

/* Stage 1 profile: what the data says about this person before they tell us anything.
   Flags and numbers come from the feature table; the narrator (Gemini on ADK or a template) may only describe those flags. */
export default function ProfileInsights({ compact = false }: { compact?: boolean }) {
  const { accountId, context } = useApp()
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!accountId) { setData(null); return }
    let alive = true
    setLoading(true); setFailed(false)
    setData(previous => previous?.account_id === accountId ? previous : null)
    api.insights(accountId).then((d) => { if (alive) setData(d) }).catch(() => { if (alive) setFailed(true) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [accountId, context?.context_version])

  if (!accountId) return null
  if (failed) return <p role="alert">Pulp could not refresh your financial story. Reload to try again.</p>
  if (!data || data.account_id !== accountId) return <Card title="What the data says about you"><div className="row"><Spinner /> <span className="small muted">Reading the record…</span></div></Card>

  return <div className="stack">
      {loading && <p className="small muted" role="status">Updating your financial story...</p>}
      {data.decision_profile?.life_profile && <PersonProfile profile={data.decision_profile.life_profile} />}
      {data.decision_profile && <section className="evidence-editorial" aria-label="Insights for your decisions">
        <p className="evidence-dateline">Recent account view through {data.decision_profile.period.to}. Confirm what has changed since.</p>
        {[...data.decision_profile.observations].sort((a,b) => b.priority-a.priority).slice(0, compact ? 1 : 3).map((o, index) => <article className="evidence-story" key={o.key}>
          <span className="story-index">0{index+1}</span><div><span className="editorial-label">What we observe</span><h3>{o.evidence}</h3><p>{o.life_effect}</p>
          <div className="evidence-meaning"><span className="editorial-label">The decision it informs</span><p>{o.unlocks}</p></div>
          {o.needs_answer && <Link className="evidence-question" to={`/?prompt=${encodeURIComponent(`Help me answer this using my records: ${o.question}`)}`}>{o.question}<ArrowUpRight size={18}/></Link>}
          </div></article>)}
      </section>}
  </div>
}
