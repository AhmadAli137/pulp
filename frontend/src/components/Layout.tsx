import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, LogOut, MessageCircle } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { readSavedAccount, useApp } from '../stores/useApp'
import { PulpMark } from './PulpMascot'
import PulpPanel from './pulp/PulpPanel'
import { SUPPORTING_WORKSPACE, WORKSPACE, WorkspaceNav } from './workspace'
import './banking.css'

export default function Layout({ onReplayIntro }: { onReplayIntro: () => void }) {
  const { accountId, loadAccount, loadingProfile, profileError, clearAccount, openPulp, closePulp } = useApp()
  const [draft, setDraft] = useState(accountId ? String(accountId) : '')
  const [inputError, setInputError] = useState('')
  const signOutDialog = useRef<HTMLDialogElement>(null)
  const accountField = useRef<HTMLInputElement>(null)
  const accountTools = useRef<HTMLDetailsElement>(null)
  const loc = useLocation()
  const navigate = useNavigate()
  const page = WORKSPACE.find(({ to }) => to === loc.pathname)

  useEffect(() => {
    const current = useApp.getState()
    const saved = readSavedAccount()
    if (!current.accountId && !current.loadingProfile && saved) void loadAccount(saved)
  }, [loadAccount])

  useEffect(() => {
    if (accountId) {
      setDraft(String(accountId))
      setInputError('')
    }
  }, [accountId])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = draft.trim()
    const id = Number(value)
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) {
      setInputError('Enter a valid positive account ID from the demo dataset.')
      accountField.current?.focus()
      return
    }
    setInputError('')
    if (id !== accountId) void loadAccount(id)
  }

  const signOut = () => {
    signOutDialog.current?.close()
    closePulp()
    clearAccount()
    setDraft('')
    setInputError('')
    if (accountTools.current) accountTools.current.open = false
    navigate('/', { replace: true })
    accountField.current?.focus()
  }

  return (
    <div className="bank-workspace">
      <a className="bank-skip" href="#workspace-content">Skip to content</a>
      <header className="bank-header">
        <div className="bank-width bank-header-inner">
          <Link className="bank-brand" to="/" aria-label="PULP home">
            <PulpMark size={34} />
            <span className="bank-brand-name">PULP<span>.</span></span>
          </Link>
          <div className="bank-account-tools">
            <form className="bank-account-form" onSubmit={submit} aria-label="Select demo account">
              <label htmlFor="acct">Demo account</label>
              <input ref={accountField} id="acct" inputMode="numeric" autoComplete="off" placeholder="Account ID"
                value={draft} aria-invalid={Boolean(inputError)} aria-describedby={inputError ? 'account-input-error' : undefined}
                onChange={(event) => { setDraft(event.target.value); setInputError('') }} />
              <button className="bank-button bank-button-primary" type="submit" disabled={loadingProfile}>
                {loadingProfile ? 'Loading…' : 'Load account'}
              </button>
            </form>
            {accountId && (
              <button className="bank-button bank-ask-pulp" type="button" onClick={() => openPulp()}>
                <MessageCircle size={16} aria-hidden="true" /> Ask Pulp
              </button>
            )}
            {(accountId || loadingProfile) && (
              <button className="bank-signout" type="button" onClick={() => signOutDialog.current?.showModal()}>
                <LogOut size={16} aria-hidden="true" /> Sign out of demo
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="bank-nav-band">
        <div className="bank-width bank-nav-inner">
          <WorkspaceNav />
          <details className="bank-menu" ref={accountTools}>
            <summary>Account tools <ChevronDown size={15} aria-hidden="true" /></summary>
            <nav aria-label="Account tools" className="bank-menu-panel">
              {SUPPORTING_WORKSPACE.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} onClick={() => { if (accountTools.current) accountTools.current.open = false }}>
                  <Icon size={16} aria-hidden="true" />{label}
                </NavLink>
              ))}
            </nav>
          </details>
        </div>
      </div>
      <main id="workspace-content" className="main bank-main bank-width" data-page={loc.pathname.slice(1)} tabIndex={-1}>
        <div className="bank-page-heading">
          <h1>{page?.label ?? 'PULP'}</h1>
          {page && <p>{page.subtitle}</p>}
        </div>
        {inputError && <div className="err bank-error" id="account-input-error" role="alert">{inputError}</div>}
        {profileError && <div className="err bank-error" role="alert">{profileError}</div>}
        <Suspense fallback={<p className="bank-loading" role="status"><span aria-hidden="true" />Loading page…</p>}>
          <Outlet context={onReplayIntro} key={accountId ?? 'signed-out'} />
        </Suspense>
      </main>
      <PulpPanel />
      <dialog ref={signOutDialog} className="bank-dialog" aria-labelledby="sign-out-title" aria-describedby="sign-out-message">
        <h2 id="sign-out-title">Sign out of demo?</h2>
        <p id="sign-out-message">This clears the account from this browser’s session. You can choose it again later.</p>
        <div className="bank-actions">
          <button className="bank-button" type="button" onClick={() => signOutDialog.current?.close()}>Cancel</button>
          <button className="bank-button bank-button-primary" type="button" onClick={signOut}>Sign out</button>
        </div>
      </dialog>
    </div>
  )
}
