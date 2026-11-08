/* The Agents page: owned by the agents showcase work package (docs/agents/v2-contracts.md). Placeholder until it lands. */
import DemoAccountPicker from '../components/DemoAccountPicker'
import { useApp } from '../stores/useApp'

export default function Agents() {
  const accountId = useApp((s) => s.accountId)
  if (!accountId) return <DemoAccountPicker />
  return <section className="card"><p>The Agents page is being built.</p></section>
}
