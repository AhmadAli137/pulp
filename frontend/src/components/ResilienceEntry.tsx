import { Link } from 'react-router-dom'

export default function ResilienceEntry({ researchOnly = false }: { researchOnly?: boolean }) {
  return <section className="resilience-entry" aria-label="Financial resilience journey">
    {!researchOnly && <><div><span className="editorial-label">Pulp / Planning under life's pressures</span><h2>When life changes, does your plan hold?</h2><p>Know your starting point. Test a setback. See how to prepare and what to do if it happens.</p></div>
    <Link className="btn primary" to="/shock">Test a customer and shock</Link></>}
    <details><summary>Our finding: more cash did not always mean more resilience</summary><p>Among 2,238 pairs with similar inflows, 78 pairs saw the account with more cash run out first under the same modeled six-month layoff. Cash alone does not tell the whole resilience story: the monthly shortfall matters too.</p><p className="small muted">Historical bank records; simulated outcomes under 55% retained income, not observed job losses or causal evidence.</p><Link to="/insights">Explore the evidence and assumptions</Link></details>
  </section>
}
