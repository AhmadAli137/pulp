/* The biggest finding, open and on screen: who lasts six months on 55% income, split by cash buffer versus by
   spending-to-income ratio, then the same engine checked against loans that actually went bad. Each finding has a
   simple view (juice cups) and a detailed view (chart and table) drawn from the same data object. */
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PairChart, QuartileChart } from '../charts'
import { api, type Research, type Validation } from '../services/api'
import { Finding, JuiceCups, ProvenanceLegend, RECORDS_PERIOD, useResearch, type Source } from './insights/JuiceCups'
import { Card, DataTable } from './ui'

const FLAG_LABELS: Record<string, string> = {
  income_volatile: 'Uneven income', balance_sliding: 'Balance trending down', timing_dips: 'Goes below zero on timing',
  cash_economy: 'Uneven cash income', thin_margin: 'Spending close to income', fee_bleed: 'Fees well above typical',
  savings_elsewhere: 'Regular transfer to another account', rent_pressure: 'Bills taking a growing share', penalty_interest: 'Penalty interest',
  fragile_but_clean: 'Never negative, yet fails a layoff', deep_buffer: 'Deep buffer', pension_dependent: 'Pension is the main income',
  cuts_when_hit: 'Cut spending fast in past income drops', no_adjustment_when_hit: 'Spending did not move in past income drops',
  weathered_before: 'Came through a past income drop', slow_recovery: 'Slow recovery after a past drop', lifestyle_creep: 'Spending growing faster than income',
  loan_stress: 'Loan payment is heavy', below_district_pay: 'Inflow below the local average salary',
}
const label = (key: string) => FLAG_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replaceAll('_', ' ')
const money = (v: number) => `$${Math.round(v).toLocaleString()}`
/** Loans in loans.csv started over this period; their status is the snapshot at the end of 2025. */
const LOANS_PERIOD = 'loans started 2020-07 to 2025-12, status as of 2025-12'
const C = { forest: '#1c4639', gray: '#9aab9c', warn: '#b8603c', line: '#e3e7dd', muted: '#54645a' }

export default function ResearchEvidence() {
  const research = useResearch()
  const [validation, setValidation] = useState<Validation | null>(null)
  useEffect(() => { api.validation().then(setValidation).catch(() => setValidation(null)) }, [])
  const qb = research?.survival_by_quartile?.buffer_B
  const qs = research?.survival_by_quartile?.spending_ratio_S_over_I
  const v = validation?.available ? validation : null
  const bs = v?.by_survival
  const flags = (v?.by_flag ?? []).filter((f) => f.n_with >= 30 && f.flag !== 'fragile_but_clean').slice(0, 5)

  const quartileSource: Source = {
    kind: 'simulated', period: `account records ${RECORDS_PERIOD}`,
    what: `six-month layoff at 55% of usual money in, ${research?.accounts_eligible_positive_inflow?.toLocaleString() ?? '4,486'} accounts`,
  }
  const loanSource: Source = { kind: 'recorded', what: `loan outcomes for ${v?.loans ?? 682} accounts with a loan`, period: LOANS_PERIOD }

  return (
    <>
      {(qb && qs) || (v && bs) ? <ProvenanceLegend /> : null}
      {qb && qs && (
        <Card title="What decides whether you last six months" className="research-evidence">
          <p>All {research?.accounts_eligible_positive_inflow?.toLocaleString() ?? '4,486'} accounts, the same layoff at 55% of usual inflow. Split by how much cash they hold, survival barely moves. Split by how much of income goes back out, it falls from almost everyone to one in four.</p>
          <Finding title="Six-month survival by quartile" source={quartileSource}
            simple={<>
              <JuiceCups title="Ranked by cash buffer: how full each group's cup stays" cups={qb.map((b) => ({ label: b.quartile, value: b.survive6_pct, sub: `median ${money(b.median_value)}` }))} tone="muted" />
              <JuiceCups title="Ranked by spending ÷ income" cups={qs.map((b) => ({ label: b.quartile, value: b.survive6_pct, sub: `spends ${Math.round(b.median_value * 100)}% of income` }))} />
              <p className="small muted">Each cup is one quarter of the accounts. The fill is the share that would still have money after six months.</p>
            </>}
            detailed={<>
              <QuartileChart buffer={qb} ratio={qs} />
              <DataTable caption="Share lasting six months, by quartile" headers={['Quartile', 'By cash buffer', 'By spending ÷ income']}
                rows={qb.map((b, i) => [b.quartile, `${b.survive6_pct.toFixed(0)}%`, `${qs[i]?.survive6_pct.toFixed(0) ?? '—'}%`])} />
            </>} />
          <p className="small muted">Simulated with the judges' runway formula on the account records. Part of this follows from the formula itself; the empirical part is that, in this bank, how much cash people hold is almost unrelated to how much of their income they spend.</p>
        </Card>
      )}
      {v && bs && bs.fails_layoff_bad_rate_pct != null && bs.survives_layoff_bad_rate_pct != null && (
        <Card title="Checked against what really happened" className="research-evidence">
          <p>Not a simulation: among the {v.loans} accounts that took a loan, those our engine says would not last a six-month layoff later had the loan go bad <strong>{bs.fails_layoff_bad_rate_pct.toFixed(1)}%</strong> of the time, versus <strong>{bs.survives_layoff_bad_rate_pct.toFixed(1)}%</strong> for those it says would.</p>
          <Finding title="Loans that went bad" source={loanSource}
            simple={<>
              <JuiceCups title="Share of loans that went bad (status B or D), grouped by the engine's six-month layoff test" tone="warn" decimals={1}
                cups={[
                  { label: 'Engine says would not last', value: bs.fails_layoff_bad_rate_pct, sub: `${bs.n_fail} accounts`, highlight: true },
                  { label: 'Engine says would last', value: bs.survives_layoff_bad_rate_pct, sub: `${bs.n_survive} accounts` },
                ]} />
              {flags.length > 0 && <JuiceCups title="By pattern in the account: with the pattern, then without" tone="warn" decimals={1}
                cups={flags.flatMap((f) => [
                  { label: `${label(f.flag)}: with`, value: f.bad_rate_with_pct, sub: `${f.n_with} accounts`, highlight: true },
                  { label: 'without', value: f.bad_rate_without_pct },
                ])} />}
              <p className="small muted">The outcome is recorded; the grouping comes from the engine's simulated test and the account patterns.</p>
            </>}
            detailed={<>
              <LoanChart rows={[
                { name: 'Six-month layoff test', a: bs.fails_layoff_bad_rate_pct, b: bs.survives_layoff_bad_rate_pct },
                ...flags.map((f) => ({ name: label(f.flag), a: f.bad_rate_with_pct, b: f.bad_rate_without_pct })),
              ]} />
              <DataTable caption="Loans that went bad (status B or D), by account pattern" headers={['Pattern in the account', 'Accounts', 'Loan went bad', 'Without the pattern']}
                rows={flags.map((f) => [label(f.flag), f.n_with, `${f.bad_rate_with_pct.toFixed(1)}%`, `${f.bad_rate_without_pct.toFixed(1)}%`])} />
            </>} />
          <p className="small muted">Loan status is a snapshot at the end of 2025, and the patterns use each account's full history, so some of the signal can come from the trouble itself. Groups under 30 accounts are left out.</p>
        </Card>
      )}
    </>
  )
}

/** Detailed view of the loan outcomes: share gone bad with vs without (first row: fails vs passes the layoff test). */
function LoanChart({ rows }: { rows: { name: string; a: number; b: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={60 + rows.length * 46}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 4 }} barGap={2}>
        <CartesianGrid stroke={C.line} horizontal={false} />
        <XAxis type="number" domain={[0, (max: number) => Math.max(20, Math.ceil(max / 10) * 10)]} tickFormatter={(x) => `${x}%`} tick={{ fontSize: 11, fill: C.muted }} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: C.forest }} interval={0} />
        <Tooltip formatter={(x) => `${Number(x).toFixed(1)}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="a" name="Fails the test / has the pattern" fill={C.warn} radius={[0, 3, 3, 0]} isAnimationActive={false}>
          <LabelList dataKey="a" position="right" formatter={(x: unknown) => `${Number(x).toFixed(1)}%`} style={{ fontSize: 10, fill: C.forest }} />
        </Bar>
        <Bar dataKey="b" name="Passes the test / without it" fill={C.gray} radius={[0, 3, 3, 0]} isAnimationActive={false}>
          <LabelList dataKey="b" position="right" formatter={(x: unknown) => `${Number(x).toFixed(1)}%`} style={{ fontSize: 10, fill: C.muted }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** "More cash can still run out sooner": matched pairs with near-identical income under the same layoff. */
export function PairFinding({ research }: { research: Research | null }) {
  const run = research?.runs?.primary_5pct_layoff
  const pairs = Number(run?.pairs_unequal_buffer ?? 0)
  if (!run || !pairs) return null
  const n = (k: string) => Number(run[k] ?? 0)
  const pct = (k: string) => (n(k) / pairs) * 100
  const source: Source = { kind: 'simulated', what: `${pairs.toLocaleString()} matched pairs, six-month layoff at 55%`, period: `account records ${RECORDS_PERIOD}` }
  return (
    <Finding title="Matched pairs" source={source}
      simple={<JuiceCups title={`Out of ${pairs.toLocaleString()} pairs with near-identical income`} decimals={1}
        cups={[
          { label: 'Both lasted six months', value: pct('both_survive'), sub: `${n('both_survive').toLocaleString()} pairs` },
          { label: 'The bigger cushion lasted', value: pct('expected_order'), sub: `${n('expected_order').toLocaleString()} pairs` },
          { label: 'Both ran short', value: pct('both_fail'), sub: `${n('both_fail').toLocaleString()} pairs` },
          { label: 'The smaller cushion lasted', value: pct('reversals'), sub: `${n('reversals').toLocaleString()} pairs`, highlight: true },
        ]} />}
      detailed={<PairChart both_ok={n('both_survive')} expected={n('expected_order')} both_fail={n('both_fail')} reversals={n('reversals')} />} />
  )
}
