/* A compact funnel of the Stage 3 plan search: generated, simulated, screened, the frontier, four finalists.
   Bar length is proportional to the count, on a shared scale starting at the number generated. */
import type { PlanSearch } from '../../services/api'
import './agents.css'

export default function SearchFunnel({ search, compact = false }: { search: PlanSearch; compact?: boolean }) {
  const rows: { label: string; n: number; who: string; tone: string }[] = [
    { label: 'Generated', n: search.generated, who: 'Life Planner and Strategist', tone: 'gen' },
    { label: 'Simulated', n: search.generated, who: 'Engine, month by month', tone: 'sim' },
    { label: 'Feasible', n: search.feasible ?? search.generated - search.screened_out, who: `Validator removed ${search.screened_out}`, tone: 'ok' },
    { label: 'On the frontier', n: search.pareto, who: 'Ranker kept the Pareto set', tone: 'front' },
    { label: 'Finalists', n: search.finalists, who: 'Four distinct winners', tone: 'fin' },
  ]
  const max = Math.max(1, search.generated)
  return (
    <figure className={`search-funnel ${compact ? 'compact' : ''}`} aria-label="Plan search funnel">
      {!compact && <figcaption>How {search.generated} plans became {search.finalists}</figcaption>}
      <ol>
        {rows.map((r) => (
          <li key={r.label} className={`tone-${r.tone}`}>
            <span className="sf-label">{r.label}</span>
            <span className="sf-track"><span className="sf-bar" style={{ width: `${Math.max(2.5, (r.n / max) * 100)}%` }} /></span>
            <b className="sf-n">{r.n}</b>
            {!compact && <small className="sf-who">{r.who}</small>}
          </li>
        ))}
      </ol>
    </figure>
  )
}
