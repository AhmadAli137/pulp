/* The biggest finding, open and on screen: who lasts six months on 55% income, split by cash buffer versus by
   spending-to-income ratio, then the same engine checked against loans that actually went bad. */
import { useEffect, useState } from 'react'
import { QuartileChart } from '../charts'
import { api, type Research, type Validation } from '../services/api'
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

export default function ResearchEvidence() {
  const [research, setResearch] = useState<Research | null>(null)
  const [validation, setValidation] = useState<Validation | null>(null)
  useEffect(() => {
    api.research().then(setResearch).catch(() => setResearch(null))
    api.validation().then(setValidation).catch(() => setValidation(null))
  }, [])
  const qb = research?.survival_by_quartile?.buffer_B
  const qs = research?.survival_by_quartile?.spending_ratio_S_over_I
  const v = validation?.available ? validation : null
  const bs = v?.by_survival

  return (
    <>
      {qb && qs && (
        <Card title="What decides whether you last six months" className="research-evidence">
          <p>All {research?.accounts_eligible_positive_inflow?.toLocaleString() ?? '4,486'} accounts, the same layoff at 55% of usual inflow. Split by how much cash they hold, survival barely moves. Split by how much of income goes back out, it falls from almost everyone to one in four.</p>
          <QuartileChart buffer={qb} ratio={qs} />
          <DataTable caption="Share lasting six months, by quartile" headers={['Quartile', 'By cash buffer', 'By spending ÷ income']}
            rows={qb.map((b, i) => [b.quartile, `${b.survive6_pct.toFixed(0)}%`, `${qs[i]?.survive6_pct.toFixed(0) ?? '—'}%`])} />
          <p className="small muted">Simulated with the judges' runway formula on the account records. Part of this follows from the formula itself; the empirical part is that, in this bank, how much cash people hold is almost unrelated to how much of their income they spend.</p>
        </Card>
      )}
      {v && bs && bs.fails_layoff_bad_rate_pct != null && bs.survives_layoff_bad_rate_pct != null && (
        <Card title="Checked against what really happened" className="research-evidence">
          <p>Not a simulation: among the {v.loans} accounts that took a loan, those our engine says would not last a six-month layoff later had the loan go bad <strong>{bs.fails_layoff_bad_rate_pct.toFixed(1)}%</strong> of the time, versus <strong>{bs.survives_layoff_bad_rate_pct.toFixed(1)}%</strong> for those it says would.</p>
          <DataTable caption="Loans that went bad (status B or D), by account pattern" headers={['Pattern in the account', 'Accounts', 'Loan went bad', 'Without the pattern']}
            rows={(v.by_flag ?? []).filter((f) => f.n_with >= 30 && f.flag !== 'fragile_but_clean').slice(0, 5).map((f) => [label(f.flag), f.n_with, `${f.bad_rate_with_pct.toFixed(1)}%`, `${f.bad_rate_without_pct.toFixed(1)}%`])} />
          <p className="small muted">Loan status is a snapshot at the end of 2025, and the patterns use each account's full history, so some of the signal can come from the trouble itself. Groups under 30 accounts are left out.</p>
        </Card>
      )}
    </>
  )
}
