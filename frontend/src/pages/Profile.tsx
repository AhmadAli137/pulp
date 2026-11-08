/* The Profile page: owned by the profile and plans work package (docs/agents/v2-contracts.md). Placeholder until it lands. */
import DemoAccountPicker from '../components/DemoAccountPicker'
import { useApp } from '../stores/useApp'

export default function Profile() {
  const accountId = useApp((s) => s.accountId)
  if (!accountId) return <DemoAccountPicker />
  return <section className="card"><p>The Profile page is being built.</p></section>
}
