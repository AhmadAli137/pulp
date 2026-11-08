import { Link } from 'react-router-dom'
import CouncilPanel from '../components/CouncilPanel'
import DemoAccountPicker from '../components/DemoAccountPicker'
import ShockPanel from '../components/ShockPanel'
import { Chip } from '../components/ui'
import { Detail, ShowFullDetail } from '../components/Detail'
import { useApp } from '../stores/useApp'
import '../components/clarity.css'

/* Shocks answers "What if something happens?": the cards and inputs, the official verdict and cushion, both official
   plans, and what to do first. Everything else (a purchase check, the formulas, the planning council) is one click away;
   what the records say about the account lives on Insights. */
export default function ShockLab() {
  const { profile } = useApp()
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
