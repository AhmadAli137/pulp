import { ArrowDown, Bot, Check, Cpu, MessageCircle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Persona } from '../../services/api'

export type FeedItem =
  | { id: string; turn: number; kind: 'divider'; label: string }
  | { id: string; turn: number; kind: 'handoff'; from: string; to: string; title: string; items: string[]; t: number }
  | { id: string; turn: number; kind: 'agent'; agent: string; text: string; t: number }

export const PERSONA_KEY: Record<string, string> = { ranker: 'validator', validator: 'validator', engine: 'engine', narrator: 'narrator', director: 'director', strategist: 'strategist', challenger: 'challenger', companion: 'companion', explainer: 'director', stage: 'stage' }
export const splitKeys = (s: string) => s.split(',').map(k => PERSONA_KEY[k.trim()] ?? k.trim()).filter(Boolean)
type Step = { keys: string[]; title: string; details: string[]; time: number; edge: string }

export default function Backstage({ open, onClose, personas, feed, active }: { open: boolean; onClose: () => void; personas: Persona[]; feed: FeedItem[]; active: Set<string> }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key === 'Tab') {
        const elements = panel.current?.querySelectorAll<HTMLElement>('button, summary, a[href]')
        if (!elements?.length) return
        const first = elements[0], last = elements[elements.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [open])
  if (!open) return null
  const latestTurn = Math.max(0, ...feed.map(f => f.turn))
  const events = feed.filter(f => f.turn === latestTurn)
  const steps: Step[] = []
  const add = (keys: string[], title: string, details: string[], time: number, edge: string) => {
    const last = steps.at(-1)
    if (last && last.keys.join() === keys.join()) { last.title = title; last.details.push(...details); last.time = time }
    else steps.push({ keys, title, details: [...details], time, edge })
  }
  for (const event of events) {
    if (event.kind === 'divider') continue
    if (event.kind === 'agent') add(splitKeys(event.agent), event.text, [], event.t, 'Next activity')
    else {
      const from = splitKeys(event.from), to = splitKeys(event.to)
      if (steps.at(-1)?.keys.join() !== from.join()) add(from, 'Sent a result', [], event.t, 'Next activity')
      add(to, event.title, event.items, event.t, 'Passed results to')
    }
  }
  const name = (key: string) => key === 'stage' ? 'Pulp replies' : key === 'profile' ? 'Confirmed context' : personas.find(p => p.key === key)?.name ?? key
  const shown = steps.slice(-16)
  return <>
    <button className="agent-flow-scrim" onClick={onClose} aria-label="Close agent flow" tabIndex={-1} />
    <aside ref={panel} id="agent-flow" className="agent-flow-panel" role="dialog" aria-modal="true" aria-labelledby="agent-flow-title">
      <header className="agent-flow-heading"><div><span className="editorial-label">Behind this conversation</span><h2 id="agent-flow-title">Follow the thinking.</h2></div><button ref={closeButton} className="agent-icon-button" aria-label="Close agent flow" onClick={onClose}><X size={19}/></button></header>
      <p className="agent-flow-intro">A flowchart of the actual calls and handoffs in this turn. Agents appear only when they run.</p>
      <div className="agent-flow-legend"><span><i />Recent activity</span><span><Check size={12}/>Observed step</span></div>
      <div className="agent-flow-chart" aria-label="Live agent flowchart">
        <div className="flow-terminal"><MessageCircle size={16}/>{events.find(f => f.kind === 'divider')?.label ?? 'Your conversation'}</div>
        {!shown.length && <><div className="flow-connector"><ArrowDown size={18}/></div><div className="flow-awaiting">Ask Pulp a question to see the real route here.<small>No agents have run yet.</small></div></>}
        {steps.length > shown.length && <p className="flow-truncated">Showing the most recent 16 steps.</p>}
        {shown.map((step, index) => <div className="flow-step" key={index}>
          <div className="flow-connector"><span>{step.edge}</span><ArrowDown size={18}/></div>
          <div className={`flow-node ${step.keys.some(k => active.has(k)) && index === shown.length - 1 ? 'recent' : ''}`}>
            <div className="flow-node-agents">{step.keys.map(k => { const code = personas.find(p => p.key === k)?.kind === 'code'; const Icon = code ? Cpu : k === 'stage' ? MessageCircle : Bot; return <span key={k}><Icon size={15}/>{name(k)}</span> })}<small>{step.time.toFixed(1)}s</small></div>
            <p>{step.title}</p>
            {!!step.details.length && <details><summary>What was passed along</summary><ul>{[...new Set(step.details)].map((d,i)=><li key={i}>{d}</li>)}</ul></details>}
          </div>
        </div>)}
      </div>
    </aside>
  </>
}
