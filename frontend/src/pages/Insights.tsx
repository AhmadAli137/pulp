import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import ProfileInsights from '../components/ProfileInsights'
import ResearchEvidence from '../components/ResearchEvidence'
import { useApp } from '../stores/useApp'

export default function Insights() {
  const accountId = useApp(state => state.accountId)
  return (
    <div className="stack">
      {accountId ? <ProfileInsights /> : <DemoAccountPicker />}
      <ResearchEvidence />
      <section className="card stack" aria-labelledby="research-fact">
        <span className="editorial-label">Simulated · Research finding</span>
        <h2 id="research-fact">More cash can still run out sooner</h2>
        <p>In 78 of 2,238 pairs of historical accounts with similar monthly inflows, the one with more cash ran short before six months while the other covered the full period. Both faced the same modeled shock at 55% of their usual inflow.</p>
        <p>How much you come up short each month matters alongside how much cash you start with.</p>
        <p className="small muted">Matched-account study using the Tangerine datathon dataset. The outcomes are modeled from account records.</p>
        <a href="https://github.com/AhmadAli137/pulp/blob/master/docs/findings.md">Read the research method</a>
      </section>
      {accountId && (
        <section className="card stack" aria-labelledby="try-your-numbers">
          <h2 id="try-your-numbers">See what would change your plan</h2>
          <p>Test a change against the selected account’s numbers and see what you could prepare now or do if the shock hits.</p>
          <Link to="/shock">Run a shock</Link>
        </section>
      )}
    </div>
  )
}
