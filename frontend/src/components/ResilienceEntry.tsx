import { Link } from 'react-router-dom'

export default function ResilienceEntry({ researchOnly = false }: { researchOnly?: boolean }) {
  return (
    <section className="resilience-entry" aria-label="Financial resilience research">
      {!researchOnly && <>
        <div>
          <h2>How long would your cash last?</h2>
          <p>Test an income drop or a higher bill and see what you could do ahead of time.</p>
        </div>
        <Link className="btn primary" to="/shock">Run a shock</Link>
      </>}
      <details>
        <summary>When the account with more cash ran out first</summary>
        <p>In 78 of 2,238 matched pairs with similar monthly inflows, the account with more cash ran out within six months while its partner made it through. Both faced the same simulated drop to 55% of their typical inflow.</p>
        <p className="small muted">The study applies one scenario to historical records. Your monthly shortfall matters alongside your starting balance.</p>
        <Link to="/insights">Explore the evidence and assumptions</Link>
      </details>
    </section>
  )
}
