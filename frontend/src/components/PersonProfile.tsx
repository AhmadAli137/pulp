import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useApp } from '../stores/useApp'
import { fmt } from './ui'

export type LifeProfile = {
  headline: string; summary: string; period: { from: string; to: string }; interpretation: { interpretation: string; basis: string; certainty: string }
  confirmed_motivations: { text: string; source: string }[]; question: string; limits: string; loan_note?: string
  loan: null | { loan_id: number; amount: number; start: string; duration_months: number; payment: number; status_meaning: string; status_as_of: string; burden: string; confirmed_purpose: string | null; context_limit: string; question: string; decision: string; unknowns: string[]; evidence: { text: string; from: string; to: string }[]; hypotheses: { title: string; basis: string; alternative: string; question: string; decision: string }[] }
}

export default function PersonProfile({ profile }: { profile: LifeProfile }) {
  const { accountId, refreshSession } = useApp()
  const [purpose, setPurpose] = useState(profile.loan?.confirmed_purpose ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setPurpose(profile.loan?.confirmed_purpose ?? ''); setError('') }, [accountId, profile.loan?.loan_id, profile.loan?.confirmed_purpose])
  const discuss = (q: string) => `/?prompt=${encodeURIComponent(`Help me work through this question about my finances: ${q}`)}`
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountId || !profile.loan) return
    setBusy(true); setError('')
    try { await api.edit(accountId, { field: 'constraints', operation: 'add', value: { type: 'loan_purpose', loan_id: profile.loan.loan_id, purpose: purpose.trim() } }, false); await refreshSession() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const loan = profile.loan
  return <section className="financial-section person-profile" aria-label="Your financial story"><span className="editorial-label">How Pulp understands your situation</span><h2>{profile.headline}</h2><p>{profile.summary}</p><p>{profile.interpretation.interpretation}</p><p className="small muted">{profile.interpretation.certainty}</p>
    {profile.confirmed_motivations.length > 0 && <div className="confirmed-motivations"><h3>What you have told us matters</h3>{profile.confirmed_motivations.map((m, i) => <p key={i}>{m.text}</p>)}</div>}
    {loan ? <div className="loan-story"><span className="editorial-label">The borrowing behind the numbers</span><h3>{fmt.money(loan.amount)} originally borrowed on {loan.start}</h3><p>{loan.duration_months}-month original term. Status at {loan.status_as_of}: {loan.status_meaning}.</p><p>{loan.burden}</p>
      {loan.confirmed_purpose ? <p className="callout green"><strong>Purpose you confirmed:</strong> {loan.confirmed_purpose}</p> : <><p><strong>Why it was taken out is not recorded.</strong> {loan.context_limit}</p>{loan.hypotheses.length > 0 ? <div className="loan-hypotheses">{loan.hypotheses.map(h => <article key={h.title}><span className="editorial-label">Possible explanation · unconfirmed</span><h4>{h.title}</h4><p><strong>Why Pulp considers it:</strong> {h.basis}</p><p>{h.alternative}</p><p><strong>Why it matters:</strong> {h.decision}</p><Link to={discuss(h.question)}>{h.question}</Link></article>)}</div> : <p>The records do not support a useful guess about purpose. We need your explanation before treating it as a purchase, an emergency or debt consolidation.</p>}</>}
      <details><summary>{loan.confirmed_purpose ? 'Correct the loan purpose' : 'Tell Pulp what the loan was for'}</summary><form className="loan-purpose-form" onSubmit={save}><label htmlFor={`loan-purpose-${loan.loan_id}`}>What did this loan help you do?</label><textarea id={`loan-purpose-${loan.loan_id}`} minLength={2} maxLength={300} required value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="For example: replace the car I needed to get to work" /><button className="btn" disabled={busy || purpose.trim().length < 2}>{busy ? 'Saving...' : 'Save loan purpose'}</button></form></details>
      {error && <p role="alert">{error}</p>}
      <p><strong>The decision this informs:</strong> {loan.decision}</p><p><Link to={discuss(loan.question)}>{loan.question}</Link></p>
      <details><summary>What the records can and cannot explain</summary>{loan.evidence.map((e, i) => <p key={i}>{e.text} <small>({e.from} to {e.to})</small></p>)}<ul>{loan.unknowns.map(u => <li key={u}>{u}</li>)}</ul></details>
    </div> : <p>{profile.loan_note}</p>}
    <p className="small muted">{profile.limits}</p>{!loan && <Link to={discuss(profile.question)}>{profile.question}</Link>}
  </section>
}
