import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Compass, FlaskConical, Goal, House, Map, Settings2, UserRound, Wallet } from 'lucide-react'
import { useApp } from '../stores/useApp'
import { api } from '../services/api'
import { Spinner } from './ui'

const NAV_GROUPS = [
  { label: 'Overview', links: [
    { to: '/', label: 'Home', icon: House },
    { to: '/twin', label: 'Financial snapshot', icon: Wallet },
    { to: '/insights', label: 'Research & insights', icon: BarChart3 },
  ] },
  { label: 'Plan ahead', links: [
    { to: '/shock', label: 'Shock Lab', icon: FlaskConical },
    { to: '/explore', label: 'Explore futures', icon: Compass },
    { to: '/goals', label: 'My goals', icon: Goal },
    { to: '/roadmap', label: 'Financial roadmap', icon: Map },
  ] },
  { label: 'Preferences', links: [
    { to: '/companion', label: 'AI companion', icon: UserRound },
    { to: '/settings', label: 'Settings', icon: Settings2 },
  ] },
]

const TITLES: Record<string, [string, string]> = {
  '/': ['Home', 'Ask Pip anything about this account'],
  '/shock': ['Shock Lab', 'Know the customer, take a shock, make a plan'],
  '/twin': ['My Financial Twin', 'Observed banking facts beside confirmed life context'],
  '/explore': ['Explore Futures', 'Simulated paths under the shocks you choose'],
  '/goals': ['My Goals', 'Strategies compared, before and after new information'],
  '/roadmap': ['Financial Roadmap', 'What to do this week, this month, this year'],
  '/insights': ['Insights', 'What the whole dataset says, and where this account sits'],
  '/companion': ['AI Companion', 'Tell PULP what you are living for'],
  '/settings': ['Settings', 'Services, data, accessibility'],
}

export default function Layout() {
  const { accountId, loadAccount, loadingProfile, profileError, setGemini, aiLabel } = useApp()
  const [draft, setDraft] = useState(accountId ? String(accountId) : '')
  const [inputError, setInputError] = useState('')
  const loc = useLocation()
  const [title, subtitle] = TITLES[loc.pathname] ?? ['PULP', '']

  useEffect(() => {
    api.health().then((h) => setGemini(h.ai_provider !== 'offline', h.ai_label)).catch(() => setGemini(false))
    // Restore the last account on any page after a reload so deep links keep working.
    const saved = (() => { try { return localStorage.getItem('pulp.account') } catch { return null } })()
    if (!accountId && saved && /^\d+$/.test(saved) && Number.isSafeInteger(Number(saved)) && Number(saved) > 0) void loadAccount(Number(saved))
  }, [setGemini]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (accountId) setDraft(String(accountId)) }, [accountId])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const raw = draft.trim()
    const id = Number(raw)
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id < 1) {
      setInputError('Enter a valid positive account ID from the demo dataset.')
      return
    }
    setInputError('')
    void loadAccount(id)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 64 64"><path d="M14 46 C 26 46, 26 18, 38 18 M14 46 C 26 46, 30 32, 50 30" stroke="#F8F9F6" strokeWidth="6" fill="none" strokeLinecap="round" /><circle cx="50" cy="30" r="7" fill="#F97316" /></svg>
          </div>
          <div>
            <div className="name">PULP<span className="dot">.</span></div>
            <div className="tag">Planning Under Life's Pressures</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main navigation">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.links.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
                  <Icon className="ic" size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="foot">
          <span className="demo-label">Demonstration only</span>
          <span>PKDD'99 anonymized research data. Not a live bank account.</span>
          <span>Amounts in CAD · AI: {aiLabel}</span>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="title">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="account-control">
            <form className="acct-pill" onSubmit={submit} aria-label="Select demo account">
              <span className="dot" aria-hidden />
              <label htmlFor="acct" className="small muted">Demo account</label>
              <input id="acct" inputMode="numeric" autoComplete="off" placeholder="Account ID" value={draft}
                aria-invalid={Boolean(inputError)} aria-describedby={inputError ? 'account-input-error' : undefined}
                onChange={(e) => { setDraft(e.target.value); setInputError('') }} />
              <button className="btn primary sm" type="submit" disabled={loadingProfile}>{loadingProfile ? <Spinner /> : 'Load'}</button>
            </form>
            {inputError && <p id="account-input-error" className="account-error" role="alert">{inputError}</p>}
          </div>
        </div>
        {profileError && <div className="err" role="alert" style={{ marginBottom: 16 }}>{profileError} Account IDs are integers from accounts.csv; try a sample from the Overview page.</div>}
        <Outlet />
      </main>
    </div>
  )
}
