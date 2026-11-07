import { useEffect, useState } from 'react'
import { api, type Cohort, type Research } from '../services/api'
import { useApp } from '../stores/useApp'
import { CohortChart, PairChart, QuartileChart } from '../charts'
import { Card, Chip, DataTable, Empty, Spinner, Tile, Tip, fmt } from '../components/ui'

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

  const prim = res?.runs?.primary_5pct_layoff
  const pop = res?.population
  const rp = res?.representative_pair
  const qb = res?.survival_by_quartile?.buffer_B
  const qs = res?.survival_by_quartile?.spending_ratio_S_over_I

  return (
    <div className="stack">
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
