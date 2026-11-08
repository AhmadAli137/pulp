import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import DemographicsSection from '../components/insights/DemographicsSection'
import DiscoveryHighlight from '../components/insights/DiscoveryHighlight'
import { useResearch } from '../components/insights/JuiceCups'
import ProfileInsights from '../components/ProfileInsights'
import ResearchEvidence, { PairFinding } from '../components/ResearchEvidence'
import { useApp } from '../stores/useApp'
import { Detail, ShowFullDetail } from '../components/Detail'
import '../components/clarity.css'

export default function Insights() {
  const accountId = useApp(state => state.accountId)
  const research = useResearch()
  const run = research?.runs?.primary_5pct_layoff
  const reversals = run?.reversals != null ? Number(run.reversals).toLocaleString() : '78'
  const pairs = run?.pairs_unequal_buffer != null ? Number(run.pairs_unequal_buffer).toLocaleString() : '2,238'
  return (
    <div className="stack">
      <p className="page-lead">What the records say about this account, how it compares with people of the same age, household and district, and what holds across all 4,500 accounts.</p>
      {accountId && <DiscoveryHighlight accountId={accountId} line />}
      {accountId ? <ProfileInsights /> : <DemoAccountPicker />}
      <ResearchEvidence />
      <Detail>{accountId && <DemographicsSection accountId={accountId} />}</Detail>
      <section className="card stack" aria-labelledby="research-fact">
        <span className="editorial-label">Simulated · Research finding</span>
        <h2 id="research-fact">More cash can still run out sooner</h2>
        <p>In {reversals} of {pairs} pairs of historical accounts with similar monthly inflows, the one with more cash ran short before six months while the other covered the full period. Both faced the same modeled shock at 55% of their usual inflow.</p>
        <PairFinding research={research} />
        <p>How much you come up short each month matters alongside how much cash you start with.</p>
        <p className="small muted">Matched-account study using the Tangerine datathon dataset. The outcomes are modeled from account records.</p>
        <a href="https://github.com/AhmadAli137/pulp/blob/master/docs/findings.md">Read the research method</a>
      </section>
      {accountId && (
        <p className="link-row"><Link to="/shock">Try a shock on this account</Link><Link to="/plan">See what to do in My Plan</Link><Link to="/profile">See who PULP thinks you are</Link></p>
      )}
      <ShowFullDetail what="Insights" />
    </div>
  )
}
