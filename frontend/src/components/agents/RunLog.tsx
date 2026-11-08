/* The raw log of one agent run: one monospace line per event, the current line highlighted and kept in view while the
   replay plays. Click a line to jump there; open it to see what was passed (items) and the exact data. Plain mode uses
   agent names; Technical shows raw keys and kinds. */
import { useEffect, useRef, useState } from 'react'
import type { Persona, TraceEvent } from '../../services/api'
import { metaFor, splitAgents } from './AgentSymbol'

type Mode = 'plain' | 'technical'

export function logTime(t: number | undefined) {
  const v = typeof t === 'number' && Number.isFinite(t) ? t : 0
  return `+${v.toFixed(2)}s`
}

/** One log line as text, for Copy and Download. */
export function logLine(ev: TraceEvent, mode: Mode, personas?: Persona[]) {
  const who = (k?: string) => splitAgents(k).map((a) => (mode === 'plain' ? metaFor(a, personas).name : a)).join(' + ')
  const route = ev.to ? `${who(ev.agent)} → ${who(ev.to)}` : who(ev.agent)
  return `[${logTime(ev.t)}] ${route}  ${mode === 'technical' ? `${ev.kind}  ` : ''}${ev.title}`
}

export default function RunLog({ events, current, mode, personas, onJump }: {
  events: TraceEvent[]; current: number; mode: Mode; personas?: Persona[]; onJump: (i: number) => void
}) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  const box = useRef<HTMLOListElement>(null)

  // Keep the current line in view inside the log, without scrolling the page.
  useEffect(() => {
    const ol = box.current
    const li = ol?.querySelector<HTMLElement>(`[data-line="${current}"]`)
    if (!ol || !li) return
    const top = li.offsetTop - ol.offsetTop
    if (top < ol.scrollTop || top + li.offsetHeight > ol.scrollTop + ol.clientHeight) ol.scrollTo({ top: Math.max(0, top - 40) })
  }, [current])

  const toggle = (i: number) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })

  return (
    <ol ref={box} className={`run-log ${mode}`} aria-label="Run log">
      {events.map((ev, i) => {
        const more = !!(ev.items?.length || (ev.data && Object.keys(ev.data).length))
        const isOpen = open.has(i)
        return (
          <li key={i} data-line={i} className={`${i === current ? 'current' : ''} ${i > current ? 'future' : ''}`}>
            <div className="run-log-row">
              <button type="button" className="run-log-line" onClick={() => onJump(i)} aria-current={i === current ? 'step' : undefined}
                title="Jump the replay to this step">
                <span className="run-log-t">[{logTime(ev.t)}]</span>
                <span className="run-log-who">{splitAgents(ev.agent).map((a) => (mode === 'plain' ? metaFor(a, personas).name : a)).join(' + ')}
                  {ev.to && <> <span className="run-log-arrow">→</span> {splitAgents(ev.to).map((a) => (mode === 'plain' ? metaFor(a, personas).name : a)).join(' + ')}</>}</span>
                {mode === 'technical' && <span className={`run-log-kind k-${ev.kind}`}>{ev.kind}</span>}
                <span className="run-log-title">{ev.title}</span>
              </button>
              {more && <button type="button" className="run-log-more" aria-expanded={isOpen} onClick={() => toggle(i)} aria-label={`${isOpen ? 'Hide' : 'Show'} details for step ${i + 1}`}>{isOpen ? '−' : '+'}</button>}
            </div>
            {isOpen && (
              <div className="run-log-detail">
                {!!ev.items?.length && <ul>{ev.items.map((it, j) => <li key={j}>{it}</li>)}</ul>}
                {ev.data && Object.keys(ev.data).length > 0 && <pre>{JSON.stringify(ev.data, null, 2)}</pre>}
                {mode === 'technical' && <p className="run-log-meta">stage {ev.stage} · kind {ev.kind} · agent {ev.agent}{ev.to ? ` · to ${ev.to}` : ''}</p>}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
