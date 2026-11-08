/* Calm lists for Profile: each item is a symbol, one line, one number or one short line; everything else on tap. */
import { useState } from 'react'
import type { LifePersona, PersonaGoal } from '../../services/api'
import ItemIcon from '../ItemIcon'
import { goalSymbol, questionSymbol, worrySymbol } from '../symbols'

export const money = (v: number) => `$${Math.round(v).toLocaleString('en-CA')}`
/** "by Jun 2027", counting the goal's months from today. */
export function byDate(months: number) {
  const d = new Date()
  d.setMonth(d.getMonth() + Math.max(0, Math.round(months)))
  return `by ${d.toLocaleString('en-CA', { month: 'short', year: 'numeric' })}`
}
/** The persona's quote, trimmed to its first sentence so it reads as one short line. */
export function shortQuote(q?: string | null, max = 120) {
  if (!q) return ''
  const first = q.split(/(?<=[.!?])\s/)[0]
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first
}
const HORIZON: Record<string, string> = { short: 'short term', medium: 'medium term', long: 'long term' }

function More({ n, open, onToggle, noun }: { n: number; open: boolean; onToggle: () => void; noun: string }) {
  if (n <= 0) return null
  return <button type="button" className="pl-more" onClick={onToggle}>{open ? `Show fewer ${noun}` : `Show ${n} more ${noun}`}</button>
}

export function GoalList({ goals, limit = 4 }: { goals: PersonaGoal[]; limit?: number }) {
  const [all, setAll] = useState(false)
  const sorted = [...goals].sort((a, b) => b.weight - a.weight)
  const total = goals.reduce((a, g) => a + g.weight, 0) || 1
  const shown = all ? sorted : sorted.slice(0, limit)
  return (
    <>
      <ul className="plain-list" aria-label="Your goals">
        {shown.map((g, i) => (
          <li key={`${g.id}-${i}`}>
            <ItemIcon symbol={goalSymbol(g.type)} />
            <div className="pl-main">
              <span className="pl-title">{g.label}</span>
              {(g.quote || g.why) && <span className="pl-line">{g.quote ? `“${shortQuote(g.quote)}”` : shortQuote(g.why)}</span>}
            </div>
            <span className="pl-num">{money(g.target_amount)} <small>{byDate(g.target_months)}</small></span>
            <details>
              <summary>Details</summary>
              <p>Counts for {Math.round((g.weight / total) * 100)}% of your plans · importance {Math.round(g.importance)} of 5 · {HORIZON[g.horizon] ?? g.horizon} · {g.size} · from {g.source === 'user' ? 'you' : g.source}{g.personal ? ', tied to your records' : ''}</p>
              {g.why && g.quote && <p>{g.why}</p>}
              {g.evidence && <p>From your records: {g.evidence}</p>}
            </details>
          </li>
        ))}
      </ul>
      <More n={sorted.length - limit} open={all} onToggle={() => setAll((v) => !v)} noun="goals" />
    </>
  )
}

export function WorryList({ persona, limit = 4 }: { persona: LifePersona; limit?: number }) {
  const [all, setAll] = useState(false)
  const items = all ? persona.worries : persona.worries.slice(0, limit)
  return (
    <>
      <ul className="plain-list" aria-label="What worries you">
        {items.map((w) => (
          <li key={w.label}>
            <ItemIcon symbol={worrySymbol(w.type)} />
            <div className="pl-main">
              <span className="pl-title">{w.label}</span>
              {w.quote && <span className="pl-line">“{shortQuote(w.quote)}”</span>}
            </div>
            <span />
            {w.evidence && <details><summary>Details</summary><p>From your records: {w.evidence}</p></details>}
          </li>
        ))}
      </ul>
      <More n={persona.worries.length - limit} open={all} onToggle={() => setAll((v) => !v)} noun="worries" />
    </>
  )
}

export function QuestionList({ persona }: { persona: LifePersona }) {
  return (
    <ol className="plain-list" aria-label="What Pulp will ask first">
      {persona.questions.map((q) => (
        <li key={q.key}>
          <ItemIcon symbol={questionSymbol(q.key)} />
          <div className="pl-main"><span className="pl-title">{q.text}</span></div>
          <span />
          {q.why && <details><summary>Why Pulp asks</summary><p>{q.why}</p></details>}
        </li>
      ))}
    </ol>
  )
}
