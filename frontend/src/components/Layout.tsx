import { Suspense, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, LogOut, MessageCircle, UserRound, WalletCards } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { readSavedAccount, useApp } from '../stores/useApp'
import { focusPickerField, usePicker } from '../stores/picker'
import AccountIdForm from './AccountIdForm'
import { PulpMark } from './PulpMascot'
import PulpPanel, { clearSavedThreads } from './pulp/PulpPanel'
import { useProfileDoc } from './profile/useProfileDoc'
import { BehindTheScenesLink, HowItWorksFooter, PRIMARY_WORKSPACE, WORKSPACE, WorkspaceNav, parentPage } from './workspace'
import './banking.css'
import './header.css'
import '../brand.css'
import './simple.css'
import { useView } from '../stores/view'

/** Which account's name the chip has shown, and which one's name should ease in (set only on a switch). */
const nameEase: { shown: number | null; animate: number | null } = { shown: null, animate: null }

export default function Layout({ onReplayIntro }: { onReplayIntro: () => void }) {
  const { accountId, loadAccount, loadingProfile, profileError, clearAccount, openPulp, closePulp } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const signOutDialog = useRef<HTMLDialogElement>(null)
  const chip = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  // Set by a confirmed sign-out, so the dialog hands focus to the empty state's ID field instead of the chip.
  const signedOut = useRef(false)
  // Signed out on a page with the empty state, the chip leads to its ID field instead of opening a second form.
  const pickerShown = usePicker((s) => s.mounted > 0)
  const chipJumps = !accountId && pickerShown
  const loc = useLocation()
  const navigate = useNavigate()
  const page = WORKSPACE.find(({ to }) => to === loc.pathname)
  const question = PRIMARY_WORKSPACE.find(({ to }) => to === loc.pathname)?.question
  // Pages folded into a tab (Next steps, Goals, Briefings) or into Profile (Account details) point back to it.
  const parent = parentPage(loc.pathname)
  const { view, setView, resetReveal } = useView()
  // Profile has no tab of its own: it opens from the account chip in the header.
  const { doc } = useProfileDoc(accountId)
  // The persona's name arrives with the profile doc, a moment after the account. Until then the chip holds a quiet
  // placeholder avatar and no name, so it does not flash an icon and then jump sideways.
  const docReady = Boolean(accountId) && doc?.account_id === accountId
  // While the doc refetches (or after a page change), the last name seen for this account stands in, so it never drops.
  const liveName = docReady ? (doc?.persona?.display_name ?? '').trim() : ''
  const knownName = useApp((s) => (accountId && s.personaName?.id === accountId ? s.personaName.name : ''))
  const rememberPersona = useApp((s) => s.rememberPersona)
  useEffect(() => { if (accountId && liveName) rememberPersona(accountId, liveName) }, [accountId, liveName, rememberPersona])
  const nameWords = (liveName || knownName).split(/\s+/).filter(Boolean)
  const fullName = nameWords.length ? nameWords.join(' ') : null
  const firstName = nameWords[0] ?? null
  // The name eases in only when it arrives for a newly switched-to account, never on first paint, a reload or a page
  // change, so the chip reads "74916 · Élise" straight away. Kept outside the component so a remount does not replay it.
  if (accountId && firstName && nameEase.shown !== accountId) {
    if (nameEase.shown !== null) nameEase.animate = accountId
    nameEase.shown = accountId
  }
  const easeName = Boolean(accountId) && nameEase.animate === accountId
  const onProfile = loc.pathname === '/profile'
  const onAccountDetails = parent?.to === '/profile'
  useEffect(() => { resetReveal() }, [loc.pathname, resetReveal])
  useEffect(() => { setMenuOpen(false) }, [loc.pathname])
  useEffect(() => { if (chipJumps) setMenuOpen(false) }, [chipJumps])
  // A new account has arrived (loaded or switched from the menu): the menu's job is done. Focus goes back to the chip,
  // which now names that account, rather than being lost with the menu.
  useEffect(() => {
    if (!accountId) return
    // While loading, the menu's Load button is disabled and drops focus to the body, so that counts as "in the menu" too.
    const active = document.activeElement
    if (menu.current && (!active || active === document.body || menu.current.contains(active))) chip.current?.focus()
    setMenuOpen(false)
  }, [accountId])
  // Opening the menu moves focus into it: the ID field when no account is loaded, otherwise the Profile link.
  useEffect(() => {
    if (menuOpen) menu.current?.querySelector<HTMLElement>('a[href], input')?.focus()
  }, [menuOpen])

  useEffect(() => {
    const current = useApp.getState()
    const saved = readSavedAccount()
    if (!current.accountId && !current.loadingProfile && saved) void loadAccount(saved)
  }, [loadAccount])

  // The account menu closes on a click outside it; Escape closes it and returns focus to the chip.
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !chip.current?.contains(target)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      chip.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const askSignOut = () => {
    setMenuOpen(false)
    signOutDialog.current?.showModal()
  }

  const signOut = () => {
    signedOut.current = true
    signOutDialog.current?.close()
    closePulp()
    clearSavedThreads()
    clearAccount()
    navigate('/', { replace: true })
  }

  const afterSignOutDialog = () => {
    if (signedOut.current) {
      signedOut.current = false
      usePicker.getState().askFocus()
    } else chip.current?.focus()
  }

  const onChip = () => {
    if (chipJumps && focusPickerField()) return
    setMenuOpen((open) => !open)
  }

  const initials = nameWords.length
    ? nameWords.slice(0, 2).map((w) => Array.from(w)[0].toLocaleUpperCase()).join('')
    : null
  const avatar = (
    <span className="bank-account-chip-avatar" aria-hidden="true">
      {initials ?? (docReady ? <UserRound size={14} /> : null)}
    </span>
  )
  // The chip's name for screen readers: "Account 74916, Élise" (the visible middle dot is not read out).
  const chipLabel = accountId ? (firstName ? `Account ${accountId}, ${firstName}` : `Account ${accountId}`) : undefined

  return (
    <div className="bank-workspace" data-view={view}>
      <a className="bank-skip" href="#workspace-content">Skip to content</a>
      <header className="bank-header">
        <div className="bank-width bank-header-inner">
          <Link className="bank-brand" to="/" aria-label="PULP home">
            <PulpMark size={32} />
            <span className="brand-lockup">
              <span className="bank-brand-name">PULP<span>.</span></span>
              <span className="brand-acronym" aria-hidden="true"><b>P</b>lanning <b>U</b>nder <b>L</b>ife’s <b>P</b>ressures</span>
            </span>
          </Link>
          <div className="bank-account-tools">
            {/* Focus leaving the chip and its menu (Tab past the last item) closes the menu, so it never covers the page unattended. */}
            <div className="bank-account-chip-wrap" onBlur={(event) => {
              const next = event.relatedTarget as Node | null
              if (menuOpen && next && !event.currentTarget.contains(next)) setMenuOpen(false)
            }}>
              <button ref={chip} type="button"
                aria-haspopup={chipJumps ? undefined : 'dialog'} aria-expanded={chipJumps ? undefined : menuOpen}
                aria-controls={menuOpen ? 'account-menu' : undefined}
                aria-label={chipLabel}
                className={`bank-account-chip${accountId ? '' : ' is-empty'}${onProfile || onAccountDetails ? ' is-current' : ''}${!accountId && loadingProfile ? ' is-loading' : ''}${accountId && !docReady && !knownName ? ' is-pending' : ''}`}
                onClick={onChip}>
                {accountId ? avatar : <WalletCards className="bank-account-chip-lead" size={16} aria-hidden="true" />}
                <span className="bank-account-chip-text">
                  {accountId ? (
                    <><span className="bank-account-chip-id">{accountId}</span>
                      {firstName && <span key={accountId} className={`bank-account-chip-name${easeName ? ' is-new' : ''}`}
                        onAnimationEnd={() => { if (nameEase.animate === accountId) nameEase.animate = null }}><span className="bank-account-chip-dot">{' · '}</span>{firstName}</span>}</>
                  ) : loadingProfile ? 'Loading account…' : 'Pick an account'}
                </span>
                <ChevronDown className="bank-account-chip-caret" size={15} aria-hidden="true" />
              </button>
              {menuOpen && (
                <div ref={menu} id="account-menu" className="bank-account-menu" role="dialog" aria-label="Account">
                  {accountId && (
                    <div className="bank-account-menu-section">
                      <div className="bank-account-menu-who">
                        {avatar}
                        <span>
                          <strong>{fullName ?? `Account ${accountId}`}</strong>
                          {fullName && <span>Account {accountId}</span>}
                        </span>
                      </div>
                      {/* A plain Link, so aria-current can say "page" on Profile and "true" on Account details, which belongs to it. */}
                      <Link className="bank-account-menu-row" to="/profile"
                        aria-current={onProfile ? 'page' : onAccountDetails ? 'true' : undefined}>
                        <UserRound size={15} aria-hidden="true" /> Your profile
                        <ArrowRight className="bank-account-menu-row-end" size={14} aria-hidden="true" />
                      </Link>
                    </div>
                  )}
                  <div className="bank-account-menu-section bank-account-menu-switch">
                    {accountId && <p className="bank-account-menu-label">Switch account</p>}
                    <AccountIdForm hideLabel={Boolean(accountId)} placeholder={accountId ? 'Another account ID' : 'Account ID'}
                      onSubmitted={() => { setMenuOpen(false); chip.current?.focus() }} />
                  </div>
                  {accountId && (
                    <div className="bank-account-menu-section">
                      <button className="bank-account-menu-row" type="button" onClick={askSignOut}>
                        <LogOut size={15} aria-hidden="true" /> Sign out of demo
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {accountId && (
              <button className="bank-button bank-ask-pulp" type="button" onClick={() => openPulp()}>
                {/* On phones only the icon shows; the label stays for screen readers, so the name is "Ask Pulp" at every width. */}
                <MessageCircle size={16} aria-hidden="true" /><span className="bank-ask-pulp-label">Ask Pulp</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="bank-nav-band">
        <div className="bank-width bank-nav-inner">
          <WorkspaceNav />
          <BehindTheScenesLink />
        </div>
      </div>
      <main id="workspace-content" className="main bank-main bank-width" data-page={loc.pathname.slice(1)} tabIndex={-1}>
        {/* On the four tabs the question is the h1, with the tab name as a small eyebrow above it; the page answers it
            in one sentence straight after, so no subtitle sits in between. Other pages keep their name and subtitle. */}
        <div className={`bank-page-heading${question ? ' has-question' : ''}`}>
          {parent && (
            <Link className="bank-back-link" to={parent.to}>
              <ArrowLeft size={15} aria-hidden="true" /><span className="sr-only">Back to </span>{parent.label}
            </Link>
          )}
          <div className="bank-page-title-row">
            {question && <p className="bank-page-eyebrow">{page?.label}</p>}
            <h1>{question ?? page?.label ?? 'PULP'}</h1>
            {accountId && (
              <div className="view-switch" role="group" aria-label="How much to show">
                <button type="button" aria-pressed={view === 'simple'} onClick={() => setView('simple')}>Simple</button>
                <button type="button" aria-pressed={view === 'full'} onClick={() => setView('full')}>Full detail</button>
              </div>
            )}
          </div>
          {page && !question && <p>{page.subtitle}</p>}
        </div>
        {profileError && <div className="err bank-error" role="alert">{profileError}</div>}
        <Suspense fallback={<p className="bank-loading" role="status"><span aria-hidden="true" />Loading page…</p>}>
          <Outlet context={onReplayIntro} key={accountId ?? 'signed-out'} />
        </Suspense>
      </main>
      <HowItWorksFooter />
      <PulpPanel />
      <dialog ref={signOutDialog} className="bank-dialog" onClose={afterSignOutDialog} aria-labelledby="sign-out-title" aria-describedby="sign-out-message">
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
