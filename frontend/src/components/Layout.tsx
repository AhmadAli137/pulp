import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../stores/useApp'
import { api } from '../services/api'
import { Spinner } from './ui'
import CurrentPlan from './CurrentPlan'
import { WORKSPACE, PageGuide, WorkspaceNav } from './workspace'
import { PulpMark } from './PulpMascot'

export default function Layout() {
  const { accountId, loadAccount, loadingProfile, profileError, setGemini } = useApp()
  const [draft, setDraft] = useState(accountId ? String(accountId) : '')
  const loc = useLocation()
  const page = WORKSPACE.find(x => x.to === loc.pathname)
  const title = page?.label ?? 'Pulp'; const subtitle = page?.subtitle ?? ''

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
          <PulpMark size={36} />
          <div>
            <div className="name">PULP<span className="dot">.</span></div>
            <div className="tag">A considered financial life</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {WORKSPACE.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="ic" aria-hidden><n.icon size={17} /></span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="foot"><span className="sidebar-seal">P / PERSONAL PERSPECTIVE</span>
          Planning informed by records.<br/>Decisions shaped around your life.<br/><Link to="/settings">About the data &amp; your controls</Link>
        </div>
      </aside>
      <main className="main" data-page={loc.pathname.slice(1)}>
        <WorkspaceNav />
        <div className="topbar">

          <div className="title">
            <span className="editorial-label">Pulp / Your planning workspace</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <form className="acct-pill" onSubmit={submit} aria-label="Select account">
            <span className="dot" aria-hidden />
            <label htmlFor="acct" className="small muted">Demo account</label>
            <input id="acct" inputMode="numeric" placeholder="Account number" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn primary sm" type="submit" disabled={loadingProfile}>{loadingProfile ? <Spinner /> : 'Load'}</button>
          </form>
        </div>
        {profileError && <div className="err" role="alert" style={{ marginBottom: 16 }}>{profileError} Choose a demo account in the planning room to continue.</div>}
        <PageGuide path={loc.pathname} />
        <CurrentPlan />
        <Outlet />
      </main>
    </div>
  )
}
