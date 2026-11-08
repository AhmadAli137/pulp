import DemoAccountPicker from '../components/DemoAccountPicker'
import ProfileInsights from '../components/ProfileInsights'
import ShockPanel from '../components/ShockPanel'
import { Chip } from '../components/ui'
import { useApp } from '../stores/useApp'

export default function ShockLab() {
  const { profile } = useApp()
  if (!profile) return <DemoAccountPicker />

  return (
    <div className="stack">
      <div className="row" aria-label="Scenario account">
        <Chip tone="gray">Account {profile.account_id}</Chip>
        <span className="small muted">Records from {profile.first_month} to {profile.last_month}</span>
        {profile.account.district_name && <Chip tone="outline">Branch · {profile.account.district_name}</Chip>}
      </div>
      <ShockPanel />
      <details className="financial-section">
        <summary>What we know about this account</summary>
        <ProfileInsights compact />
      </details>
    </div>
  )
}
