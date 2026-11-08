import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { api, type DiscoveryResult } from '../../services/api'
import { PulpMark } from '../PulpMascot'
import './discovery.css'
import ExplainButton from '../ExplainButton'

/** The biggest discovery for this account, shown first: what PULP found, the evidence, how rare it is, one thing to do. */
export default function DiscoveryHighlight({ accountId, compact = false, line = false }: { accountId: number; compact?: boolean; line?: boolean }) {
  const [data, setData] = useState<DiscoveryResult | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setData(null)
    setFailed(false)
    api.discovery(accountId).then(d => { if (live) setData(d) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [accountId])
  if (failed) return null
  const d = data?.discovery
  if (!data) {
    if (line) return null
    return <section className="discovery discovery-loading" aria-busy="true"><PulpMark size={22} /><span>Squeezing your records for the biggest discovery…</span></section>
  }
  if (!d) return null
  if (line) {
    return (
      <p className="discovery-line"><Sparkles size={15} aria-hidden="true" /> <span>Pulp’s biggest discovery about you: <b>{d.title}</b>.</span> <Link to="/">See it on Overview</Link></p>
    )
  }
  return (
    <section className={`discovery sev-${d.severity}${compact ? ' compact' : ''}`} aria-labelledby="discovery-title">
      <div className="discovery-head">
        <span className="discovery-label"><Sparkles size={15} aria-hidden="true" /> Pulp’s biggest discovery about you</span>
        <ExplainButton topic="discovery" label="the biggest discovery" />
      </div>
      <h2 id="discovery-title">{d.title}</h2>
      <p className="discovery-plain">{d.plain}</p>
      {!compact && <p className="discovery-evidence"><strong>In your records:</strong> {d.evidence}</p>}
      <div className="discovery-foot">
        {d.rarity && <span className="discovery-rarity">{d.rarity}</span>}
        <p className="discovery-action"><strong>What to do:</strong> {d.action}</p>
      </div>
      <div className="discovery-links">
        {d.link && <Link to={d.link}>See the evidence</Link>}
      </div>
      {!compact && data.runners_up.length > 0 && (
        <details className="discovery-more">
          <summary>Also worth knowing ({data.runners_up.length})</summary>
          <ul>{data.runners_up.map(r => <li key={r.key}><strong>{r.title}.</strong> {r.plain}</li>)}</ul>
        </details>
      )}
    </section>
  )
}
