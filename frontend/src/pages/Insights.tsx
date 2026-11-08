import { useEffect, useState } from 'react'
import { api, type ArchetypesDoc, type Cohort, type FeatureSurvival, type HunterDoc, type Insights as InsightsDoc, type Research } from '../services/api'
import { useApp } from '../stores/useApp'
import { CohortChart, FeatureSurvivalChart, PairChart, QuartileChart } from '../charts'
import ProfileInsights from '../components/ProfileInsights'
import { Card, Chip, DataTable, Empty, Spinner, Tile, Tip, fmt } from '../components/ui'

const FEATURES = ['timing_dip_share', 'fee_share', 'lifestyle_creep', 'balance_trend_pm', 'bills_share_trend', 'income_cv', 'inflow_regular_share', 'regular_transfer_out_amount', 'owner_age', 'account_age_years', 'inflow_vs_district_salary', 'pension_share', 'spending_ratio']

function bucketOf(r: number | null): string | null {
  if (r == null) return '24+'
  const edges: [number, string][] = [[2, '0-2'], [4, '2-4'], [6, '4-6'], [9, '6-9'], [12, '9-12'], [18, '12-18'], [24, '18-24']]
  for (const [e, l] of edges) if (r < e) return l
  return '24+'
}

export default function Insights() {
  const { accountId, profile, accessible } = useApp()
  const [res, setRes] = useState<Research | null>(null)
  const [co, setCo] = useState<Cohort | null>(null)
  useEffect(() => { api.research().then(setRes).catch(() => setRes({ available: false })) }, [])
  useEffect(() => { if (accountId) api.cohort(accountId).then(setCo).catch(() => undefined) }, [accountId])
  const [arch, setArch] = useState<ArchetypesDoc | null>(null)
  const [archFailed, setArchFailed] = useState(false)
  const [hunter, setHunter] = useState<HunterDoc | null>(null)
  const [hunterFailed, setHunterFailed] = useState(false)
  const [mine, setMine] = useState<InsightsDoc | null>(null)
  const [feature, setFeature] = useState('timing_dip_share')
  const [fs, setFs] = useState<FeatureSurvival | null>(null)
  useEffect(() => { api.archetypes().then(setArch).catch(() => setArchFailed(true)) }, [])
  useEffect(() => { api.hunter().then(setHunter).catch(() => setHunterFailed(true)) }, [])
  useEffect(() => { if (accountId) api.insights(accountId).then(setMine).catch(() => setMine(null)); else setMine(null) }, [accountId])
  useEffect(() => { setFs(null); api.featureSurvival(feature, 4).then(setFs).catch(() => setFs(null)) }, [feature])

  const prim = res?.runs?.primary_5pct_layoff
  const pop = res?.population
  const rp = res?.representative_pair
  const qb = res?.survival_by_quartile?.buffer_B
  const qs = res?.survival_by_quartile?.spending_ratio_S_over_I

  return (
    <div className="stack">
      {accountId && <ProfileInsights />}
      {res?.available && prim && pop && qb && qs ? (<>
        <div className="hero">
          <div className="row" style={{ marginBottom: 8 }}><Chip tone="gold">Discovery · {res.accounts_eligible_positive_inflow?.toLocaleString()} accounts · simulated outcomes</Chip></div>
          <h1 style={{ fontSize: 22 }}>{res.headline}</h1>
          <p className="small" style={{ marginTop: 10 }}>Rank correlation of runway with the cash buffer: {fmt.num(pop.spearman_buffer_vs_runway_layoff, 2)}. With spending ÷ income: {fmt.num(pop.spearman_spendratio_vs_runway_layoff, 2)}. Reproduce with backend/scripts/analyze_population.py.</p>
        </div>
        <div className="grid cols-2">
          <Card title={<>Who lasts six months on 55% income? <Tip text="Accounts split into quartiles two ways. Grey: by cash buffer B. Green: by spending-to-income ratio S/I. Survival = unrounded runway of at least 6 months." /></>}>
            <QuartileChart buffer={qb} ratio={qs} />
            {accessible && <DataTable headers={['Quartile', 'By buffer', 'By S/I']} rows={qb.map((b, i) => [b.quartile, fmt.pct100(b.survive6_pct, 1), fmt.pct100(qs[i].survive6_pct, 1)])} />}
          </Card>
          <Card title={<>Matched pairs, same shock <Tip text={res.matching_rule ?? ''} /></>} right={<span className="small muted">{Number(prim.pairs_unequal_buffer).toLocaleString()} pairs · {prim.unmatched} unmatched</span>}>
            <PairChart both_ok={Number(prim.both_survive)} expected={Number(prim.expected_order)} both_fail={Number(prim.both_fail)} reversals={Number(prim.reversals)} />
            <p className="small" style={{ marginTop: 6 }}><strong>{prim.reversals} of {Number(prim.pairs_unequal_buffer).toLocaleString()} pairs ({fmt.pct100(Number(prim.reversal_pct_of_pairs), 1)})</strong> reverse: the account with more cash runs out first. Among pairs where exactly one survives, {fmt.pct100(Number(prim.reversal_pct_of_discordant), 1)} go the "wrong" way. In every reversal the leaner account spends less (median {fmt.money(Number(prim.median_spending_gap_in_reversals))}/mo less) despite holding {fmt.money(Number(prim.median_buffer_gap_in_reversals))} less cash.</p>
          </Card>
        </div>
        <div className="grid cols-4">
          <Tile label="Last 6 months under layoff" value={fmt.pct100(pop.layoff55_survive6_pct, 1)} sub={`${pop.layoff55_survive6_n.toLocaleString()} accounts · median finite runway ${fmt.num(pop.layoff55_median_runway_finite, 1)} mo`} />
          <Tile label="Pushed under 6 months by bills +15%" value={`${pop.layoff_survivors_pushed_under6_by_bills} of ${pop.layoff55_survive6_n.toLocaleString()}`} sub={`${fmt.pct100(pop.layoff_survivors_pushed_under6_by_bills_pct, 1)} of layoff survivors · median loss ${fmt.num(pop.median_runway_loss_from_bills_among_pushed, 1)} mo`} />
          <Tile label="Ever had a negative balance day" value={fmt.pct100(pop.observed_any_negative_balance_pct, 1)} sub={`observed · ${fmt.pct100(pop.observed_negative_and_fail_layoff_pct, 0)} of them fail the simulated layoff`} />
          <Tile label="Spending at or above inflow" value={`${pop.baseline_deficit_accounts.toLocaleString()}`} sub={`accounts with S ≥ I · ${fmt.pct100(pop.baseline_shortfall_pct, 1)} have a baseline gap`} />
        </div>
        <div className="grid cols-2">
          <Card title="Representative reversal pair">
            {rp && (<>
              <DataTable headers={['', `Account ${rp.big} (more cash)`, `Account ${rp.small} (less cash)`]} rows={[
                ['Typical inflow', fmt.money(Number(rp.I_big)), fmt.money(Number(rp.I_small))],
                ['Typical spending', fmt.money(Number(rp.S_big)), fmt.money(Number(rp.S_small))],
                ['Buffer', fmt.money(Number(rp.B_big)), fmt.money(Number(rp.B_small))],
                ['Monthly gap at 55% income', fmt.money(Number(rp.gap_big)), fmt.money(Number(rp.gap_small))],
                ['Runway', `${fmt.num(Number(rp.runway_big), 1)} mo (fails)`, rp.runway_small == null ? 'no shortfall' : `${fmt.num(Number(rp.runway_small), 1)} mo (lasts)`],
              ]} />
              <p className="small" style={{ marginTop: 8 }}>{fmt.money(Number(rp.B_big) - Number(rp.B_small))} more in the bank, but {fmt.money(Number(rp.S_big) - Number(rp.S_small))} more out every month. Over six months that is {fmt.money(6 * (Number(rp.S_big) - Number(rp.S_small)))}, which outweighs the cash advantage.</p>
            </>)}
          </Card>
          <Card title="Sensitivity checks">
            <DataTable headers={['Run', 'Pairs', 'Reversals', '% pairs']} rows={Object.entries(res.runs ?? {}).map(([k, v]) => [k.replace(/_/g, ' '), Number(v.pairs_unequal_buffer).toLocaleString(), v.reversals ?? 0, fmt.pct100(Number(v.reversal_pct_of_pairs), 1)])} />
            <p className="tiny muted" style={{ marginTop: 8 }}>Stable across 5%, 2% and 1% inflow tolerances and the combined shock; drops to 2.9% when accounts with fewer than 24 months of history are excluded. Simulated outcomes, not observed distress.</p>
          </Card>
        </div>
        {res.survival_by_spending_ratio_band && (
          <Card title="Practical consequence: the spending ratio is the lever">
            <DataTable headers={['Spending ÷ income', 'Accounts', 'Last 6 months at 55% income']} rows={res.survival_by_spending_ratio_band.map((b) => [b.band, b.n.toLocaleString(), fmt.pct100(b.survive6_pct, 1)])} />
            <p className="small" style={{ marginTop: 8 }}>Over a six-month layoff, every $1,000 cut from monthly spending is worth $6,000 of buffer. That is why the goal plan reports the need as C + 6 × gap and the backup plan reports what to free up per month.</p>
          </Card>
        )}
      </>) : <Card title="Dataset discovery">{res ? <p className="small muted">{res.note ?? 'Findings file not generated yet.'}</p> : <Spinner />}</Card>}

      <div className="section">
        <h2>Behavioural archetypes</h2>
        {archFailed ? <Empty>Archetypes are not available right now.</Empty> : !arch ? <Empty><Spinner /></Empty> : (
          <Card
            title={<>{arch.k} groups across {arch.n_accounts.toLocaleString()} accounts <Tip text={arch.method} /></>}
            right={<Chip tone={arch.naming_source.startsWith('google-adk') ? 'gold' : 'gray'}>{arch.naming_source.startsWith('google-adk') ? 'named by Gemini on Google ADK' : 'named by rules'}</Chip>}
          >
            <table className="data arch-table">
              <thead><tr><th>Archetype</th><th className="num">Share</th><th className="num">Lasts 6 mo, layoff</th><th className="num">Layoff + bills</th><th>Likely life stage / occupation (a guess)</th><th>What sets it apart</th></tr></thead>
              <tbody>
                {arch.clusters.map((c) => (
                  <tr key={c.id} className={mine?.archetype?.id === c.id ? 'mine' : ''}>
                    <td className="name">{c.name}{mine?.archetype?.id === c.id && <> <Chip tone="gold">this account</Chip></>}<div className="tiny muted">{c.description}</div></td>
                    <td className="num">{fmt.pct(c.share)}<div className="tiny muted">{c.size.toLocaleString()}</div></td>
                    <td className="num">{fmt.pct100(c.survive6_layoff_pct)}</td>
                    <td className="num">{fmt.pct100(c.survive6_combined_pct)}</td>
                    <td className="small">{c.likely_life_stage} / {c.likely_occupation}<div className="tiny muted">confidence {fmt.pct(c.confidence)}</div></td>
                    <td className="tiny">{c.distinguishing.slice(0, 3).map((d) => <div key={d.feature}>{d.feature}: {fmt.num(d.cluster_median, 2)} vs {fmt.num(d.population_median, 2)}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tiny muted" style={{ marginTop: 8 }}>Clusters and every number are computed in code; the model only wrote the names and the hedged guesses from those numbers.</p>
          </Card>
        )}
      </div>

      <div className="section">
        <h2>What the Pattern Hunter found</h2>
        {hunterFailed ? <Empty>Findings are not available right now.</Empty> : !hunter ? <Empty><Spinner /></Empty> : (
          <div className="stack">
            <div className="row">
              <Chip tone={hunter.mode === 'adk' ? 'gold' : 'gray'}>{hunter.mode === 'adk' ? `Gemini on ADK, ${hunter.tool_calls_made} tool calls` : 'deterministic battery'}</Chip>
              {hunter.model && <Chip tone="outline">{hunter.model}</Chip>}
              <Chip tone="outline">{hunter.findings.length} findings · {hunter.n_accounts.toLocaleString()} accounts</Chip>
              {hunter.seconds != null && <Chip tone="outline">{hunter.seconds}s</Chip>}
            </div>
            {hunter.summary && <p className="small">{hunter.summary}</p>}
            {hunter.findings.length === 0 ? <Empty>No finding cleared the evidence bar.</Empty> : (
              <div className="finding-grid">
                {hunter.findings.map((f, i) => (
                  <div key={i} className="finding">
                    <div className="row"><Chip tone={f.strength === 'strong' ? 'gold' : f.strength === 'moderate' ? 'outline' : 'gray'}>{f.strength}</Chip><span className="t">{f.title}</span></div>
                    <div className="small">{f.statement}</div>
                    <div className="tiny muted">{f.evidence}</div>
                    {f.caveat && <div className="tiny muted">Caveat: {f.caveat}</div>}
                  </div>
                ))}
              </div>
            )}
            <Card title="Survival by feature" right={
              <select className="select" value={feature} onChange={(e) => setFeature(e.target.value)} aria-label="Feature">
                {FEATURES.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            }>
              {fs ? (<>
                <p className="small muted" style={{ marginBottom: 6 }}>{fs.meaning}. Accounts split into four equal-count bins; bars show the share that lasts six months.</p>
                <FeatureSurvivalChart bins={fs.bins} />
              </>) : <Empty><Spinner /></Empty>}
            </Card>
          </div>
        )}
      </div>

      <div className="section">
        <h2>Where this account sits among similar customers</h2>
        {!profile ? <Empty>Select an account to compare it with its cohort.</Empty> : !co || !co.me || !co.peers ? <Empty>{co?.note ?? <Spinner />}</Empty> : (
          <div className="grid cols-2">
            <Card title={`${co.n_peers} peers with inflow within ${Math.round(co.tolerance * 100)}%`} right={<Chip tone={co.me.survives6_layoff ? '' : 'danger'}>{co.me.survives6_layoff ? 'lasts 6 months under layoff' : 'fails 6 months under layoff'}</Chip>}>
              <DataTable headers={['', 'This account', 'Peer median']} rows={[
                ['Typical spending', fmt.money(co.me.S), fmt.money(co.peers.median_S)],
                ['Buffer', fmt.money(co.me.B), fmt.money(co.peers.median_B)],
                ['Spending ÷ income', fmt.pct(co.me.spending_ratio), fmt.pct(co.peers.median_spending_ratio)],
                ['Buffer in months of spending', fmt.num(co.me.buffer_months_of_spending, 1), fmt.num(co.peers.median_buffer_months_of_spending, 1)],
                ['Runway under layoff', co.me.runway_layoff == null ? 'no shortfall' : fmt.months(co.me.runway_layoff), co.peers.median_runway_layoff_finite == null ? '—' : fmt.months(co.peers.median_runway_layoff_finite)],
                ['Last 6 months under layoff', co.me.survives6_layoff ? 'yes' : 'no', fmt.pct100(co.peers.survive6_layoff_pct, 0) + ' of peers'],
                ['Last 6 months under layoff + bills 15%', co.me.survives6_combined ? 'yes' : 'no', fmt.pct100(co.peers.survive6_combined_pct, 0) + ' of peers'],
              ]} />
              {co.percentiles_within_cohort && <p className="small muted" style={{ marginTop: 8 }}>Within the cohort this account's buffer is at the {Math.round(co.percentiles_within_cohort.buffer)}th percentile, spending at the {Math.round(co.percentiles_within_cohort.spending)}th, runway at the {Math.round(co.percentiles_within_cohort.runway_layoff)}th.</p>}
            </Card>
            <Card title="Peer runway under the layoff twist" right={<span className="small muted">gold bar = this account's bucket</span>}>
              {co.runway_distribution_layoff && <CohortChart buckets={co.runway_distribution_layoff} myBucket={bucketOf(co.me.runway_layoff)} />}
              <p className="tiny muted" style={{ marginTop: 6 }}>{co.note}</p>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
