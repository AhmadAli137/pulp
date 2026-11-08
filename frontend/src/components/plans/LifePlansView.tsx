/* Life plans after a shock: owned by the profile-and-plans work package (docs/agents/v2-contracts.md).
   Placeholder with the final props so other packages can import it now. */
import type { LifePlanResult } from '../../services/api'

export default function LifePlansView({ result, compact = false }: { result: LifePlanResult; compact?: boolean }) {
  return (
    <section className="card" aria-label="Life plans">
      <h2>{compact ? 'Plans' : 'Your plans after this shock'}</h2>
      <ul>{result.plans.map((p) => <li key={p.id}>{p.name}: {p.summary}</li>)}</ul>
    </section>
  )
}
