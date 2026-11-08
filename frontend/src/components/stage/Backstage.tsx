import { Bot, Brain, ChevronDown, Cpu, Monitor, X } from 'lucide-react'
import { useState } from 'react'
import type { Persona } from '../../services/api'

/* The backstage drawer: who the agents are, and what each one received and handed on during the last turns.
   Everything shown comes from the personas registry and the stream's handoff / agent events; never raw JSON. */
export type FeedItem =
  | { id: string; turn: number; kind: 'divider'; label: string }
  | { id: string; turn: number; kind: 'handoff'; from: string; to: string; title: string; items: string[]; t: number }
  | { id: string; turn: number; kind: 'agent'; agent: string; text: string; t: number }

/* Event names used by the backend map onto persona keys; "ranker" is the validator persona, "stage" is the screen. */
export const PERSONA_KEY: Record<string, string> = { ranker: 'validator', validator: 'validator', engine: 'engine', narrator: 'narrator', director: 'director', strategist: 'strategist', challenger: 'challenger', companion: 'companion', explainer: 'director', stage: 'stage' }
export const splitKeys = (s: string) => s.split(',').map((k) => PERSONA_KEY[k.trim()] ?? k.trim()).filter(Boolean)

const KIND_LABEL: Record<Persona['kind'], string> = { ai: 'AI on Google ADK', code: 'code', memory: 'memory' }
const KIND_ICON: Record<Persona['kind'], typeof Bot> = { ai: Bot, code: Cpu, memory: Brain }

export default function Backstage({ open, onClose, personas, feed, active }: { open: boolean; onClose: () => void; personas: Persona[]; feed: FeedItem[]; active: Set<string> }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const name = (key: string) => key === 'stage' ? 'the stage' : personas.find((p) => p.key === key)?.name ?? key
  if (!open) return null
  return (
    <aside className="backstage" aria-label="Backstage: the agents at work">
      <header className="backstage-head">
        <div><span className="agent-small-label">BACKSTAGE</span><h2>The agents at work</h2></div>
        <button className="agent-icon-button" aria-label="Close backstage" onClick={onClose}><X size={16} /></button>
      </header>
      <p className="backstage-intro">Each card is one agent. Below them, what every agent received and handed on this turn, in its own words.</p>
      <section className="backstage-personas">
        {personas.map((p) => {
          const Icon = KIND_ICON[p.kind] ?? Bot
          const on = active.has(p.key)
          const isOpen = expanded === p.key
          return (
            <article key={p.key} className={`persona ${p.kind} ${on ? 'active' : ''}`}>
              <button className="persona-head" onClick={() => setExpanded(isOpen ? null : p.key)} aria-expanded={isOpen}>
                <span className={`persona-avatar ${p.kind}`}><Icon size={15} /></span>
                <span className="persona-title"><b>{p.name}</b><i>{KIND_LABEL[p.kind]}</i></span>
                <ChevronDown size={14} className={`persona-chev ${isOpen ? 'open' : ''}`} />
              </button>
              {(isOpen || on) && <p className="persona-role">{p.role}</p>}
              {isOpen && (
                <dl className="persona-detail">
                  <dt>reads</dt><dd>{p.reads.join(' · ')}</dd>
                  <dt>writes</dt><dd>{p.writes.join(' · ')}</dd>
                  <dt>guardrail</dt><dd>{p.guardrail}</dd>
                  <dt>runs on</dt><dd>{p.runs_on}</dd>
                </dl>
              )}
            </article>
          )
        })}
      </section>
      <section className="backstage-feed" aria-live="polite">
        {feed.length === 0 && <p className="backstage-empty">Nothing yet. Ask Pulp something or deal a card, and watch the handoffs appear here.</p>}
        {feed.map((f) => {
          if (f.kind === 'divider') return <div key={f.id} className="feed-divider"><span>{f.label}</span></div>
          if (f.kind === 'agent') return <div key={f.id} className="feed-agent"><i>{f.t.toFixed(1)}s</i><span><b>{name(PERSONA_KEY[f.agent] ?? f.agent)}</b> {f.text}</span></div>
          const fromKeys = splitKeys(f.from), toKeys = splitKeys(f.to)
          return (
            <article key={f.id} className="feed-handoff">
              <header>
                <span className="feed-route">
                  {fromKeys.map((k) => <b key={k}>{name(k)}</b>)}
                  <span className="feed-arrow">→</span>
                  {toKeys.map((k) => k === 'stage' ? <b key={k} className="stage-key"><Monitor size={12} /> the stage</b> : <b key={k}>{name(k)}</b>)}
                </span>
                <i>{f.t.toFixed(1)}s</i>
              </header>
              <h4>{f.title}</h4>
              <ul>{f.items.slice(0, 6).map((it, i) => <li key={i}>{it}</li>)}</ul>
            </article>
          )
        })}
      </section>
    </aside>
  )
}
