/* The Stage 1 report: owned by the report work package (docs/agents/v2-contracts.md). Placeholder until it lands. */
import DemoAccountPicker from '../components/DemoAccountPicker'
import { useApp } from '../stores/useApp'

export default function Report() {
  const accountId = useApp((s) => s.accountId)
  if (!accountId) return <DemoAccountPicker />
  return <section className="card"><p>The Stage 1 report is being built.</p></section>
}
