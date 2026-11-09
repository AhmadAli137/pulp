import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import CouncilPanel from '../components/CouncilPanel'
import DemoAccountPicker from '../components/DemoAccountPicker'
import ShockPanel from '../components/ShockPanel'
import { Chip } from '../components/ui'
import { Detail, ShowFullDetail } from '../components/Detail'
import { useApp } from '../stores/useApp'
import '../components/clarity.css'

/* Shocks answers "What if something happens?": the cards and inputs, the official verdict and cushion, and both
   official plans under "The numbers behind this shock", which live on this page only; My Plan links back here for them.
   Everything else (a purchase check, the formulas, the planning council) is one click away; what the records say
   about the account lives on Insights. */
export default function ShockLab() {
  const { profile, shock, shockLoading } = useApp()
  const { hash, key } = useLocation()
  // My Plan links to "#resilience-plans": the Prepare now / If it happens tables live here only. They render once the
  // shock report has arrived (after a cold load too), so wait for the section, then scroll once per navigation.
  const scrolled = useRef<string | null>(null)
  useEffect(() => {
    if (!hash || !profile || !shock || shockLoading || scrolled.current === key) return
    const id = decodeURIComponent(hash.slice(1))
    let frame = 0, tries = 0
    const go = () => {
      const el = document.getElementById(id)
      if (el) {
        scrolled.current = key
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
      } else if (++tries < 30) frame = requestAnimationFrame(go)
    }
    go()
    return () => cancelAnimationFrame(frame)
  }, [hash, key, profile, shock, shockLoading])
  if (!profile) return <DemoAccountPicker />

  return (
    <div className="stack">
      <Detail><div className="row" aria-label="Scenario account">
        <Chip tone="gray">Account {profile.account_id}</Chip>
        <span className="small muted">Records from {profile.first_month} to {profile.last_month}</span>
        {profile.account.district_name && <Chip tone="outline">Branch · {profile.account.district_name}</Chip>}
      </div></Detail>
      <ShockPanel />
      <Detail><details className="disclose">
        <summary>Ask the planning council for other options (uses Gemini, slower)</summary>
        <CouncilPanel />
      </details>
      <p className="small muted">What the records say about this account is on <Link to="/insights">Insights</Link>.</p></Detail>
      <ShowFullDetail what="Shocks" />
    </div>
  )
}
