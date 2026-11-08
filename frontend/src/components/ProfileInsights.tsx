import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { api, type Insights } from '../services/api'
import { useApp } from '../stores/useApp'
import { Card, Chip, Spinner, fmt } from './ui'

/* Stage 1 profile: what the data says about this person before they tell us anything.
   Flags and numbers come from the feature table; the narrator (Gemini on ADK or a template) may only describe those flags. */
export default function ProfileInsights({ compact = false }: { compact?: boolean }) {
  const { accountId } = useApp()
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showEvidence, setShowEvidence] = useState(false)

  useEffect(() => {
    if (!accountId) { setData(null); return }
    let alive = true
    setLoading(true); setFailed(false); setData(null)
    api.insights(accountId).then((d) => { if (alive) setData(d) }).catch(() => { if (alive) setFailed(true) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [accountId])

  if (!accountId || failed) return null
  if (loading || !data) return <Card title="What the data says about you"><div className="row"><Spinner /> <span className="small muted">Reading the record…</span></div></Card>

  const labelOf = (key: string) => data.flags.find((f) => f.key === key)?.label
  const sev = (s: string) => (s === 'risk' ? 'danger' : s === 'watch' ? 'gold' : 'gray') as 'danger' | 'gold' | 'gray'
  const a = data.archetype

  return (
    <Card
      title="What your records can help you decide"
      right={<Chip tone="gray">Observed patterns</Chip>}
    >
      {data.decision_profile && <section className="evidence-editorial" aria-label="Insights for your decisions">
        <p className="evidence-dateline">Recent account view through {data.decision_profile.period.to}. Confirm what has changed since.</p>
        {[...data.decision_profile.observations].sort((a,b) => b.priority-a.priority).slice(0, compact ? 1 : 3).map((o, index) => <article className="evidence-story" key={o.key}>
          <span className="story-index">0{index+1}</span><div><span className="editorial-label">What we observe</span><h3>{o.evidence}</h3><p>{o.life_effect}</p>
          <div className="evidence-meaning"><span className="editorial-label">The decision it informs</span><p>{o.unlocks}</p></div>
          {o.needs_answer && <Link className="evidence-question" to={`/?prompt=${encodeURIComponent(`Help me answer this using my records: ${o.question}`)}`}>{o.question}<ArrowUpRight size={18}/></Link>}
          </div></article>)}
      </section>}
      <details className="profile-method"><summary>Explore the supporting patterns and comparisons</summary>
      <div className={`insights${compact ? ' compact' : ''}`}>
        <div className="insights-main">
          <ul className="insight-list">
            {data.narrative.insights.map((i, k) => {
              const label = labelOf(i.flag)
              return (
                <li key={k}>
                  <Chip tone={label ? sev(data.flags.find((f) => f.key === i.flag)!.severity) : 'gray'}>{label ?? (i.flag === 'archetype' ? 'archetype' : 'record')}</Chip>
                  <span>{i.text}</span>
                </li>
              )
            })}
          </ul>
          {data.flags.length > 0 && (
            <div>
              <button className="btn ghost sm" onClick={() => setShowEvidence((v) => !v)} aria-expanded={showEvidence}>
                {showEvidence ? 'Hide evidence' : `Evidence · ${data.flags.length} flag${data.flags.length === 1 ? '' : 's'}`}
              </button>
              {showEvidence && (
                <ul className="evidence-list">
                  {data.flags.map((f) => (
                    <li key={f.key}>
                      <Chip tone={sev(f.severity)}>{f.severity}</Chip>
                      <span><strong>{f.label}.</strong> <span className="muted">{f.evidence}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {a && (
          <aside className="archetype-box">
            <div className="label">Behavioural archetype</div>
            <div className="name">{a.name}</div>
            <p className="small">{a.description}</p>
            <dl className="kv">
              <dt>Likely life stage</dt><dd>{a.likely_life_stage}</dd>
              <dt>Likely occupation</dt><dd>{a.likely_occupation}</dd>
              <dt>Confidence of the guess</dt><dd>{fmt.pct(a.confidence)}</dd>
              <dt>Share of accounts</dt><dd>{fmt.pct(a.share)}</dd>
              <dt>Last 6 months on 55% income</dt><dd>{fmt.pct100(a.survive6_layoff_pct)}</dd>
            </dl>
            <div className="tiny muted">Life stage and occupation are guesses from spending patterns, not facts about you.</div>
          </aside>
        )}
      </div>
      <p className="tiny muted" style={{ marginTop: 10 }}>Derived from monthly_summary.csv and the other summary files; the model may only describe the flags shown.</p>
      </details>
    </Card>
  )
}
