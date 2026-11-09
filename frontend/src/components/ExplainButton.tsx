import { PulpMark } from './PulpMascot'
import { useApp } from '../stores/useApp'

export interface ShockParams { r?: number; h?: number; o?: number; d?: number }

/** Topic → the section's plain name (shown in the chat as "Explain: <name>"). */
export const EXPLAIN_NAMES: Record<string, string> = {
  typical_month: 'your typical month', cushion: 'your cushion', runway: 'your runway', discovery: 'the biggest discovery',
  shock: 'what this shock does', cushion_chart: 'the cushion chart', prepare_now: 'Prepare now', if_it_happens: 'If it happens',
  shock_numbers: 'the numbers behind this shock',
  plan: 'your plan', finalists: 'the four plans', plan_search: 'how the plans were chosen', goals: 'your goals',
  persona: 'the person behind the account', quartiles: 'spending versus savings', loan_check: 'the loan check',
  demographics: 'where you live and who you are', agents: 'how the agents work', stage1: 'Stage 1', stage2: 'Stage 2', stage3: 'Stage 3',
}

export function explainMessage(topic: string, shock?: ShockParams | null) {
  if (!shock) return `explain:${topic}`
  const q = new URLSearchParams()
  if (shock.r != null) q.set('r', String(Math.round(shock.r * 1000) / 1000))
  if (shock.h != null) q.set('h', String(Math.round(shock.h * 1000) / 1000))
  if (shock.o != null) q.set('o', String(Math.round(shock.o)))
  if (shock.d != null) q.set('d', String(Math.round(shock.d)))
  return `explain:${topic}?${q.toString()}`
}

/** "Explain this": Pulp explains this section in the simplest, most relatable words, with this account's numbers. */
export default function ExplainButton({ topic, label, shock }: { topic: string; label: string; shock?: ShockParams | null }) {
  const openPulp = useApp((s) => s.openPulp)
  return (
    <button type="button" className="explain-btn" aria-label={`Explain: ${label}`} title="Pulp explains this in plain words"
      onClick={() => openPulp(explainMessage(topic, shock))}>
      <PulpMark size={15} /> Explain this
    </button>
  )
}
