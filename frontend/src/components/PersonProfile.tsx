import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { useApp } from '../stores/useApp'
import { fmt, KV } from './ui'

export type LifeProfile = {
  headline: string
  summary: string
  period: { from: string; to: string }
  interpretation: { interpretation: string; basis: string; certainty: string }
  geography?: { home_district: string | null; branch_district: string | null }
  recorded_age?: { years: number; as_of: string }
  confirmed_motivations: { text: string; source: string }[]
  question: string
  limits: string
  loan_note?: string
  loan: null | { loan_id: number; amount: number; start: string; duration_months: number; payment: number; status_meaning: string; status_as_of: string; burden: string; confirmed_purpose: string | null; context_limit: string; question: string; decision: string; unknowns: string[]; evidence: { text: string; from: string; to: string }[]; hypotheses: { title: string; basis: string; alternative: string; question: string; decision: string }[] }
}

export default function PersonProfile({ profile }: { profile: LifeProfile }) {
  const { accountId, refreshContext } = useApp()
  const [purpose, setPurpose] = useState(profile.loan?.confirmed_purpose ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setPurpose(profile.loan?.confirmed_purpose ?? '')
    setError('')
  }, [accountId, profile.loan?.loan_id, profile.loan?.confirmed_purpose])

  const loan = profile.loan
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountId || !loan) return
    setBusy(true)
    setError('')
    try {
      await api.edit(accountId, { field: 'constraints', operation: 'add', value: { type: 'loan_purpose', loan_id: loan.loan_id, purpose: purpose.trim() } }, false)
      await refreshContext()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const home = profile.geography?.home_district
  const branch = profile.geography?.branch_district
  const age = profile.recorded_age
  return (
    <section className="card stack person-profile" aria-label="Your account context">
      <span className="editorial-label">Observed</span>
      <h2>{profile.headline}</h2>
      <p>{profile.summary}</p>
      <p className="small muted">Monthly account summaries · {profile.period.from} to {profile.period.to}</p>
      <p>{profile.interpretation.interpretation}</p>
      <p className="small muted">{profile.interpretation.certainty}</p>

      {(home || branch || age) && (
        <div className="confirmed-motivations">
          <h3>Details from the records</h3>
          <KV rows={[
            ['Owner’s home district', home ?? 'Unknown'],
            ['Account branch district', branch ?? 'Unknown'],
            ...(age ? [[`Owner’s age on ${age.as_of}`, `About ${Math.round(age.years)} years`] as [string, string]] : []),
          ]} />
          <p className="small muted">Historical owner and branch records. Check where you live today and any changes in work, housing or household costs when setting up a scenario.</p>
        </div>
      )}

      {profile.confirmed_motivations.length > 0 && (
        <div className="confirmed-motivations">
          <h3>What you confirmed</h3>
          {profile.confirmed_motivations.map(m => <p key={m.text}>{m.text}</p>)}
        </div>
      )}

      {loan ? (
        <div className="loan-story">
          <span className="editorial-label">Historical loan record</span>
          <h3>{fmt.money(loan.amount)} originally borrowed on {loan.start}</h3>
          <p>{loan.duration_months}-month original term. {loan.status_meaning} as of {loan.status_as_of}.</p>
          <p>{loan.burden}</p>
          {loan.confirmed_purpose ? (
            <section className="callout green" aria-label="Confirmed loan purpose">
              <strong>Purpose you confirmed</strong>
              <p>{loan.confirmed_purpose}</p>
            </section>
          ) : (
            <>
              <p>The loan record leaves the purpose unknown. {loan.context_limit}</p>
              {loan.hypotheses.length > 0 && (
                <div className="loan-hypotheses">
                  {loan.hypotheses.map(h => (
                    <article key={h.title}>
                      <span className="editorial-label">Possible explanation · unconfirmed</span>
                      <h4>{h.title}</h4>
                      <p>{h.basis}</p>
                      <p>{h.alternative}</p>
                      <p>{h.decision}</p>
                      <p><strong>{h.question}</strong></p>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          <details>
            <summary>{loan.confirmed_purpose ? 'Correct the loan purpose' : 'Tell Pulp what the loan was for'}</summary>
            <form className="loan-purpose-form" onSubmit={save}>
              <label htmlFor={`loan-purpose-${loan.loan_id}`}>What did this loan help you do?</label>
              <textarea id={`loan-purpose-${loan.loan_id}`} minLength={2} maxLength={300} required value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="For example, to replace the car I needed for work" />
              <button className="btn" disabled={busy || purpose.trim().length < 2}>{busy ? 'Saving…' : 'Save loan purpose'}</button>
            </form>
          </details>
          {error && <p role="alert">{error}</p>}
          <p>{loan.decision}</p>
          <p><strong>{loan.question}</strong></p>
          <details>
            <summary>Loan evidence and open questions</summary>
            {loan.evidence.map(e => <p key={e.text}>{e.text} <small>({e.from} to {e.to})</small></p>)}
            <ul>{loan.unknowns.map(u => <li key={u}>{u}</li>)}</ul>
          </details>
        </div>
      ) : <p>{profile.loan_note}</p>}
      <p className="small muted">{profile.limits}</p>
    </section>
  )
}
