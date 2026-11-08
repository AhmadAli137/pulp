import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../stores/useApp'
import { api } from '../services/api'
import { Spinner } from './ui'

const NAV = [
  { to: '/', label: 'Home (Pip)', ic: '◎' },
  { to: '/shock', label: 'Shock Lab', ic: '⚡' },
  { to: '/twin', label: 'My Financial Twin', ic: '◫' },
  { to: '/explore', label: 'Explore Futures', ic: '⟡' },
  { to: '/goals', label: 'My Goals', ic: '◉' },
  { to: '/roadmap', label: 'Financial Roadmap', ic: '⇢' },
  { to: '/insights', label: 'Insights', ic: '▥' },
  { to: '/settings', label: 'Settings', ic: '⚙' },
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
  const loc = useLocation()
  const [title, subtitle] = TITLES[loc.pathname] ?? ['PULP', '']

  useEffect(() => {
    api.health().then((h) => setGemini(h.ai_provider !== 'offline', h.ai_label)).catch(() => setGemini(false))
    // Restore the last account on any page after a reload so deep links keep working.
    const saved = (() => { try { return localStorage.getItem('pulp.account') } catch { return null } })()
    if (!accountId && saved && Number.isInteger(Number(saved))) void loadAccount(Number(saved))
  }, [setGemini]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (accountId) setDraft(String(accountId)) }, [accountId])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const id = Number(draft)
    if (Number.isInteger(id) && id > 0) void loadAccount(id)
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
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="ic" aria-hidden>{n.ic}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="foot">
          Tangerine track · Sheridan Datathon 2026<br />
          Prepare for what comes next.<br />Data: PKDD'99 Financial dataset (anonymized). Amounts in CAD.<br />
          AI: {aiLabel}
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="title">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <form className="acct-pill" onSubmit={submit} aria-label="Select account">
            <span className="dot" aria-hidden />
            <label htmlFor="acct" className="small muted">Account</label>
            <input id="acct" inputMode="numeric" placeholder="account_id" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn primary sm" type="submit" disabled={loadingProfile}>{loadingProfile ? <Spinner /> : 'Load'}</button>
          </form>
        </div>
        {profileError && <div className="err" role="alert" style={{ marginBottom: 16 }}>{profileError} Account IDs are integers from accounts.csv; try a sample from the Overview page.</div>}
        <Outlet />
      </main>
    </div>
  )
}
