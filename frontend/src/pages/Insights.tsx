import { MoreLinks } from '../components/workspace'
import DemoAccountPicker from '../components/DemoAccountPicker'
import DemographicsSection from '../components/insights/DemographicsSection'
import { useResearch } from '../components/insights/JuiceCups'
import ProfileInsights from '../components/ProfileInsights'
import ResearchEvidence, { PairFinding } from '../components/ResearchEvidence'
import type { Profile } from '../services/api'
import { useApp } from '../stores/useApp'
import PageAnswer, { Num } from '../components/PageAnswer'
import { fmt } from '../components/ui'
import { Detail, ShowFullDetail } from '../components/Detail'
import '../components/clarity.css'

export default function Insights() {
  const accountId = useApp(state => state.accountId)
  const profile = useApp(state => state.profile)
  const research = useResearch()
  const run = research?.runs?.primary_5pct_layoff
  const reversals = run?.reversals != null ? Number(run.reversals).toLocaleString() : '78'
  const pairs = run?.pairs_unequal_buffer != null ? Number(run.pairs_unequal_buffer).toLocaleString() : '2,238'
  return (
    <div className="stack">
      {/* The answer, then the two percentiles it quotes as a compact row of evidence. While the profile loads the answer
          holds its place, so the page always starts the same way and nothing jumps. */}
      {accountId && (profile && profile.account_id === accountId
        ? <><PageAnswer>{compareAnswer(profile)}</PageAnswer><CompareBars profile={profile} /></>
        : <PageAnswer pending busy>Comparing your account with the others…</PageAnswer>)}
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
        <MoreLinks links={[
          { to: '/briefings', text: 'Read your briefing' },
          { to: '/shock', text: 'Try a shock on this account' },
          { to: '/plan', text: 'See what to do in My Plan' },
          { to: '/profile', text: 'See who PULP thinks you are' },
        ]} />
      )}
      <ShowFullDetail what="Insights" />
    </div>
  )
}

/** The answer to "How do I compare?": where this account's cash cushion and its spending share (money out as a share of
 *  money in) sit among every account in the dataset, from the percentiles that come with the profile. */
function compareAnswer(p: Profile) {
  const pct = p.population_percentiles
  const side = (v: number, more: string, less: string) => {
    const { above, share } = standing(v)
    return <>{above ? more : less} than <Num>{share}%</Num></>
  }
  const cushion = <>Your cash cushion is {side(pct.buffer, 'bigger', 'smaller')} of accounts</>
  if (pct.spending_ratio == null) return <>{cushion}.</>
  return <>{cushion}, and you spend {side(pct.spending_ratio, 'a bigger share of what comes in', 'a smaller share of what comes in')} of them.</>
}

/** A percentile said the way the answer says it: above the middle, "bigger than N%"; below it, "smaller than N%". */
function standing(percentile: number) {
  const at = Math.round(percentile)
  return at >= 50 ? { above: true, share: Math.min(at, 99) } : { above: false, share: Math.min(100 - at, 99) }
}

/** The evidence for the answer: where this account sits among all accounts on the two measures it quotes, each a
 *  marker on a 0 to 100 track with the middle account marked, and under it this account's own figure (the sentence
 *  already gives the percentile, so the row adds what it is a percentile of). */
function CompareBars({ profile }: { profile: Profile }) {
  const pct = profile.population_percentiles
  const rows: { label: string; value: number; less: string; more: string; yours: string }[] = [
    { label: 'Cash cushion', value: pct.buffer, less: 'smaller', more: 'bigger', yours: fmt.money(profile.buffer) },
  ]
  if (pct.spending_ratio != null) {
    rows.push({ label: 'Spending share', value: pct.spending_ratio, less: 'smaller share', more: 'bigger share', yours: `${Math.round(profile.spending_ratio * 100)}% of what comes in` })
  }
  return (
    <dl className="compare-bars" aria-label="Where you sit among all accounts">
      {rows.map(({ label, value, less, more, yours }) => (
        <div key={label} className="compare-bar">
          <dt>{label}</dt>
          <dd>
            <span className="compare-bar-track" aria-hidden="true"><span className="compare-bar-mid" /><span className="compare-bar-mark" style={{ left: `${Math.max(0, Math.min(100, value))}%` }} /></span>
            <span className="compare-bar-scale" aria-hidden="true"><span>{less}</span><span>middle account</span><span>{more}</span></span>
            <span className="compare-bar-text">Yours: {yours}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
