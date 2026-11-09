import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useApp } from '../stores/useApp'

/** The demo account ID field. Lives in the header's account menu (to switch) and in the empty state, so it is usable with no account loaded. */
export default function AccountIdForm({ inputId, placeholder = 'Account ID', hideLabel = false, onSubmitted, className = '' }: {
  /** A fixed id for the input, so the header's chip can bring the empty state's field into focus. */
  inputId?: string
  placeholder?: string
  /** Keep the "Demo account" label for screen readers only, when a visible heading already says what the field is for. */
  hideLabel?: boolean
  /** Called once a valid ID was submitted and has loaded (or was already the loaded account). Giving it also keeps
   *  load errors in the form, rather than in the page. */
  onSubmitted?: () => void
  className?: string
}) {
  const { accountId, loadAccount, switchAccount, loadingProfile } = useApp()
  // Always starts empty: the current account is shown beside the form, not in it, so switching needs no deleting first.
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  // This form's own load is in flight (aria-busy), so screen readers hear that the switch is under way.
  const [pending, setPending] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  // The header closes its menu as soon as the new account arrives, which can be before the load has fully settled;
  // a form that is gone by then has nothing left to report or hand back.
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const id = useId()
  const fieldId = inputId ?? `${id}-acct`

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = draft.trim()
    const next = Number(value)
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(next) || next < 1) {
      setError('Enter a valid positive account ID from the demo dataset.')
      field.current?.focus()
      return
    }
    setError('')
    if (next === accountId) {
      onSubmitted?.()
      return
    }
    if (!accountId && !onSubmitted) {
      // The empty state: load straight away (a failure shows above it, where the page reports it).
      void loadAccount(next)
      return
    }
    // From the header's menu: it stays open until the load has finished, and an unknown ID is reported here, where it
    // was typed. Switching keeps the current account until the new one loads.
    setPending(true)
    const failure = await switchAccount(next)
    if (!alive.current) return
    setPending(false)
    if (failure) {
      setError(failure)
      field.current?.focus()
      return
    }
    onSubmitted?.()
  }

  return (
    <form className={`bank-account-form ${className}`.trim()} onSubmit={(event) => void submit(event)} aria-label="Select demo account" noValidate
      aria-busy={pending || undefined}>
      <label htmlFor={fieldId} className={hideLabel ? 'sr-only' : undefined}>Demo account</label>
      <div className="bank-account-form-row">
        <input ref={field} id={fieldId} inputMode="numeric" autoComplete="off" placeholder={placeholder}
          value={draft} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => { setDraft(event.target.value); setError('') }} />
        <button className="bank-button bank-button-primary" type="submit" disabled={loadingProfile}>
          {loadingProfile ? 'Loading…' : 'Load account'}
        </button>
      </div>
      {error && <p className="bank-account-form-error" id={`${id}-error`} role="alert">{error}</p>}
    </form>
  )
}
