/* The relay: agents as stations on a grid, handoffs as edges, and a packet (an envelope with a short label)
   travelling each edge in the order the events happened. Works with any TraceEvent list: a stored stage trace on the
   Agents page or the live feed of one conversation turn in the Pulp panel. */
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import type { Persona, TraceEvent } from '../../services/api'
import AgentSymbol, { STAGE_COLOR, SymbolPaths, metaFor, splitAgents } from './AgentSymbol'
import './agents.css'

type Mode = 'plain' | 'technical'
const SPEEDS = [0.5, 1, 2, 4]
const TRAVEL_MS = 1150
const HOLD_MS = 420

/** A 2 to 4 word label for the packet. Search counts read like the search: "240 plans", "4 finalists". */
export function packetLabel(ev: TraceEvent): string {
  const title = ev.title.replace(/[“”"]/g, '').trim()
  const words = title.split(/\s+/)
  if (words.length <= 4) return title
  const d = ev.data ?? {}
  const num = (k: string) => typeof d[k] === 'number' ? (d[k] as number) : null
  if (num('finalists') != null) return `${num('finalists')} finalists`
  if (num('pareto') != null) return `${num('pareto')} on the frontier`
  if (num('screened_out') != null) return `${num('screened_out')} screened out`
  if (num('generated') != null) return `${num('generated')} ${metaFor(ev.agent).key === 'engine' ? 'simulated' : 'plans'}`
  return words.slice(0, 3).join(' ') + '…'
}

const fmtT = (t: number) => `${t.toFixed(1)}s`
const firstFrom = (ev: TraceEvent) => splitAgents(ev.agent)[0] ?? 'engine'
const firstTo = (ev: TraceEvent) => splitAgents(ev.to)[0]

interface Pos { x: number; y: number }

function layout(events: TraceEvent[], columns: string[][] | undefined, compact: boolean) {
  const seen: string[] = []
  const add = (k: string | undefined) => { if (k && !seen.includes(k)) seen.push(k) }
  for (const ev of events) { splitAgents(ev.agent).forEach(add); splitAgents(ev.to).forEach(add) }
  let cols: string[][]
  if (columns) {
    const placed = new Set(columns.flat())
    const extra = seen.filter((k) => !placed.has(k))
    cols = columns.map((c) => [...c])
    for (let i = 0; i < extra.length; i += 3) cols.push(extra.slice(i, i + 3))
  } else if (compact) {
    // Narrow column: a reading-order grid of three per row.
    const per = 3
    const rows = Math.ceil(seen.length / per)
    cols = Array.from({ length: per }, (_, c) => Array.from({ length: rows }, (_, r) => seen[r * per + c]).filter(Boolean) as string[])
    cols = cols.filter((c) => c.length)
    const pos: Record<string, Pos> = {}
    seen.forEach((k, i) => { pos[k] = { x: (i % per) * 130 + 65, y: Math.floor(i / per) * 92 + 44 } })
    return { pos, width: Math.min(per, Math.max(1, seen.length)) * 130, height: Math.max(1, rows) * 92 + 8 }
  } else {
    // Layered: each receiver sits one column right of whoever first handed it something.
    const depth: Record<string, number> = {}
    for (const ev of events) {
      const from = splitAgents(ev.agent)
      from.forEach((f) => { depth[f] ??= 0 })
      const d = Math.max(...from.map((f) => depth[f]))
      splitAgents(ev.to).forEach((t) => { if (depth[t] == null) depth[t] = d + 1 })
    }
    const n = Math.max(0, ...Object.values(depth)) + 1
    cols = Array.from({ length: n }, (_, i) => seen.filter((k) => depth[k] === i))
  }
  const CW = 150, RH = 104
  const maxRows = Math.max(1, ...cols.map((c) => c.length))
  const pos: Record<string, Pos> = {}
  cols.forEach((c, ci) => c.forEach((k, ri) => { pos[k] = { x: ci * CW + CW / 2, y: (ri + (maxRows - c.length) / 2) * RH + 48 } }))
  return { pos, width: cols.length * CW, height: maxRows * RH + 12 }
}

/** Quadratic curve between two stations, bowed slightly so parallel handoffs stay apart. */
function curve(a: Pos, b: Pos) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const bow = Math.min(36, len * 0.18)
  const c = { x: mx - (dy / len) * bow, y: my + (dx / len) * bow }
  return { c, d: `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}` }
}
const at = (a: Pos, c: Pos, b: Pos, t: number) => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y })

/** The handful of steps that tell the story: handoffs first, then outputs, in the order they happened. */
export function keySteps(events: TraceEvent[], max = 8): TraceEvent[] {
  if (events.length <= max) return events
  const pick = new Set<number>()
  events.forEach((e, i) => { if (e.kind === 'handoff' && pick.size < max) pick.add(i) })
  events.forEach((e, i) => { if (e.kind === 'output' && pick.size < max) pick.add(i) })
  events.forEach((e, i) => { if (e.kind === 'start' && pick.size < max) pick.add(i) })
  return events.filter((_, i) => pick.has(i))
}

export default function AgentRelay({ events: allEvents, personas, columns, compact = false, live = false, autoplay = true, label = 'Agent relay', defaultMode = 'plain', mode: modeProp, simplify = false, seek, onStep, hideSteps = false }: {
  events: TraceEvent[]; personas?: Persona[]; columns?: string[][]; compact?: boolean; live?: boolean; autoplay?: boolean; label?: string; defaultMode?: Mode
  /** Controlled detail level; when set, the relay hides its own Plain/Technical switch. */
  mode?: Mode
  /** Plain mode shows only the key steps (at most 8), one short line each, with a "Show every step" toggle. */
  simplify?: boolean
  /** Jump to a step from outside (a log line or a scrubber); `n` changes on every request so the same step can be sought twice. */
  seek?: { i: number; n: number }
  /** Called whenever the current step changes, so a log beside the relay can follow along. */
  onStep?: (i: number, playing: boolean) => void
  /** Hide the built-in step list (when a separate log shows the steps). */
  hideSteps?: boolean
}) {
  const reduced = useReducedMotion() ?? false
  const [ownMode, setMode] = useState<Mode>(defaultMode)
  const mode = modeProp ?? ownMode
  const [everyStep, setEveryStep] = useState(false)
  const short = simplify && mode === 'plain' && !everyStep
  const events = useMemo(() => (short ? keySteps(allEvents) : allEvents), [short, allEvents])
  const [cur, setCur] = useState(() => (autoplay && !reduced ? -1 : events.length - 1))
  const [prog, setProg] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [open, setOpen] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const started = useRef(false)
  const { pos, width, height } = useMemo(() => layout(events, columns, compact), [events, columns, compact])

  // Start playing the first time the relay scrolls into view (or straight away in the panel).
  useEffect(() => {
    if (!autoplay || reduced || started.current || !events.length) return
    const el = root.current
    const go = () => { if (started.current) return; started.current = true; setCur(-1); setPlaying(true) }
    if (!el || typeof IntersectionObserver === 'undefined' || live) { go(); return }
    // Watch the graph, not the whole relay: a long step list would keep the visible share low.
    const target = el.querySelector('.relay-canvas') ?? el
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting && e.intersectionRatio >= 0.4)) { go(); io.disconnect() } }, { threshold: [0, 0.4, 0.8] })
    io.observe(target)
    return () => io.disconnect()
  }, [autoplay, reduced, events.length, live])

  // A live feed resumes when new events arrive while the relay is waiting at the end.
  const prevLen = useRef(events.length)
  useEffect(() => {
    if (events.length < prevLen.current) { setCur(autoplay && !reduced ? -1 : events.length - 1); setProg(1); started.current = false }
    else if (live && events.length > prevLen.current && cur >= prevLen.current - 1) { if (reduced) setCur(events.length - 1); else setPlaying(true) }
    prevLen.current = events.length
  }, [events.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // The clock: travel along the edge, hold on arrival, then the next step.
  useEffect(() => {
    if (!playing) return
    if (cur >= events.length - 1 && prog >= 1) { setPlaying(false); return }
    let raf = 0, timer = 0
    if (cur < 0 || prog >= 1) {
      timer = window.setTimeout(() => { setCur((c) => Math.min(events.length - 1, c + 1)); setProg(0) }, cur < 0 ? 150 : HOLD_MS / speed)
    } else {
      const ev = events[cur]
      const moves = !!firstTo(ev) && firstTo(ev) !== firstFrom(ev)
      const total = (moves ? TRAVEL_MS : TRAVEL_MS * 0.55) / speed
      const start = performance.now() - prog * total
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / total)
        setProg(p)
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [playing, cur, prog >= 1, speed, events]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the current step visible inside the list without scrolling the page.
  useEffect(() => {
    const ol = list.current
    const li = ol?.querySelector<HTMLElement>(`[data-step="${cur}"]`)
    if (!ol || !li) return
    const top = li.offsetTop - ol.offsetTop
    if (top < ol.scrollTop || top + li.offsetHeight > ol.scrollTop + ol.clientHeight) ol.scrollTo({ top: Math.max(0, top - 8), behavior: reduced ? 'auto' : 'smooth' })
  }, [cur, reduced])

  const jump = (i: number) => { setPlaying(false); setCur(Math.max(-1, Math.min(events.length - 1, i))); setProg(1) }
  useEffect(() => { if (seek) { started.current = true; jump(seek.i) } }, [seek?.n]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onStep?.(cur, playing) }, [cur, playing]) // eslint-disable-line react-hooks/exhaustive-deps
  const replay = () => { setCur(-1); setProg(1); setPlaying(!reduced) }
  const togglePlay = () => {
    if (playing) { setPlaying(false); return }
    if (cur >= events.length - 1) { setCur(-1); setProg(1) }
    setPlaying(true)
  }

  const now = cur >= 0 ? events[cur] : null
  const visited = new Set<string>()
  const edgeVisited = new Set<string>()
  events.forEach((ev, i) => {
    if (i > cur) return
    splitAgents(ev.agent).forEach((k) => visited.add(k))
    if (i < cur || prog >= 1) splitAgents(ev.to).forEach((k) => visited.add(k))
    splitAgents(ev.agent).forEach((f) => splitAgents(ev.to).forEach((t) => edgeVisited.add(`${f}>${t}`)))
  })
  const edges = new Map<string, { a: string; b: string }>()
  events.forEach((ev) => splitAgents(ev.agent).forEach((a) => splitAgents(ev.to).forEach((b) => { if (a !== b && pos[a] && pos[b]) edges.set(`${a}>${b}`, { a, b }) })))
  const speaker = now ? firstFrom(now) : null
  const receiver = now ? firstTo(now) : undefined
  const arrived = prog >= 1

  // The packet: travelling along its edge, or a speech tag above the agent for a step with no receiver.
  let packet: { x: number; y: number; text: string; still: boolean } | null = null
  if (now) {
    const text = packetLabel(now)
    if (receiver && receiver !== speaker && pos[speaker!] && pos[receiver]) {
      const { c } = curve(pos[speaker!], pos[receiver])
      const p = reduced ? at(pos[speaker!], c, pos[receiver], 0.5) : at(pos[speaker!], c, pos[receiver], prog)
      packet = { ...p, text, still: false }
    } else if (speaker && pos[speaker]) packet = { x: pos[speaker].x, y: pos[speaker].y - 38, text, still: true }
  }

  const name = (k: string) => metaFor(k, personas).name
  const sub = (k: string) => { const m = metaFor(k, personas); return mode === 'plain' ? m.analogy : m.kind === 'place' ? 'data' : m.kind === 'code' ? 'Python' : m.kind === 'memory' ? 'memory' : 'Gemini · ADK' }
  const route = (ev: TraceEvent) => {
    const from = splitAgents(ev.agent).map(name).join(' and ')
    const to = splitAgents(ev.to).map(name).join(' and ')
    if (mode === 'technical') return `${ev.kind} · ${ev.agent}${ev.to ? ` → ${ev.to}` : ''} · stage ${ev.stage}`
    const verb = ev.kind === 'handoff' ? 'passes to' : ev.kind === 'tool_call' ? 'asks' : ev.kind === 'tool_result' ? 'gets an answer' : ev.kind === 'output' ? (to ? 'writes to' : 'produces') : ev.kind === 'start' ? 'starts' : 'notes'
    return to && ev.kind !== 'tool_result' ? `${from} ${verb} ${to}` : `${from} ${verb}`
  }

  if (!events.length) return <div className={`relay empty ${compact ? 'compact' : ''}`}><p>No agent steps yet. Ask Pulp something and the relay fills in as each agent works.</p></div>

  return (
    <div ref={root} className={`relay ${compact ? 'compact' : ''} ${reduced ? 'reduced' : ''}`} aria-label={label} role="group">
      <div className="relay-bar">
        <div className="relay-controls" role="toolbar" aria-label="Relay playback">
          <button type="button" onClick={() => jump(cur - 1)} disabled={cur <= -1} aria-label="Previous step" title="Previous step"><ChevronLeft size={15} /></button>
          <button type="button" className="relay-play" onClick={togglePlay} aria-label={playing ? 'Pause relay' : 'Play relay'} title={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
          <button type="button" onClick={() => jump(cur + 1)} disabled={cur >= events.length - 1} aria-label="Next step" title="Next step"><ChevronRight size={15} /></button>
          <button type="button" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])} aria-label={`Playback speed ${speed} times`} title="Speed" className="relay-speed">{speed}×</button>
          <button type="button" onClick={replay} aria-label="Replay relay" title="Replay"><RotateCcw size={14} /></button>
          <span className="relay-count" aria-live="polite">{Math.max(0, cur + 1)} / {events.length}</span>
        </div>
        {modeProp == null && (
          <div className="relay-mode" role="group" aria-label="Detail level">
            <button type="button" aria-pressed={mode === 'plain'} onClick={() => setMode('plain')}>Plain</button>
            <button type="button" aria-pressed={mode === 'technical'} onClick={() => setMode('technical')}>Technical</button>
          </div>
        )}
        {simplify && mode === 'plain' && allEvents.length > keySteps(allEvents).length && (
          <button type="button" className="relay-every" aria-pressed={everyStep} onClick={() => setEveryStep((v) => !v)}>{everyStep ? 'Key steps only' : `Show every step (${allEvents.length})`}</button>
        )}
      </div>

      <div className="relay-canvas">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${now ? `${route(now)}: ${now.title}` : 'ready to play'}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="relay-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z" fill="#9aa69c" /></marker>
            <marker id="relay-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z" fill="#1c4639" /></marker>
          </defs>
          {[...edges.entries()].map(([k, { a, b }]) => {
            const A = pos[a], Bp = pos[b]
            const len = Math.hypot(Bp.x - A.x, Bp.y - A.y) || 1
            const shrink = (p: Pos, q: Pos) => ({ x: p.x + ((q.x - p.x) / len) * 27, y: p.y + ((q.y - p.y) / len) * 27 })
            const { d } = curve(shrink(A, Bp), shrink(Bp, A))
            const on = edgeVisited.has(k)
            const hot = speaker === a && receiver === b
            return <path key={k} d={d} className={`relay-edge ${on ? 'on' : ''} ${hot ? 'hot' : ''}`} markerEnd={`url(#${on ? 'relay-arrow-on' : 'relay-arrow'})`} />
          })}
          {Object.entries(pos).map(([k, p]) => {
            const m = metaFor(k, personas)
            const color = STAGE_COLOR[m.stage]
            const place = m.kind === 'place'
            const isSpeaker = k === speaker
            const isReceiver = k === receiver && arrived
            const dim = !visited.has(k) && cur >= 0
            return (
              <g key={k} className={`relay-node ${dim ? 'dim' : ''} ${isSpeaker ? 'speaking' : ''}`} transform={`translate(${p.x},${p.y})`}>
                {isReceiver && <circle key={`pulse-${cur}`} r="24" className="relay-pulse" style={{ stroke: color }} />}
                {isSpeaker && <circle r="29" fill="none" stroke={color} strokeOpacity=".28" strokeWidth="5" />}
                {place ? <rect x="-22" y="-22" width="44" height="44" rx="12" fill="#fff" stroke={color} strokeWidth="1.6" /> : <rect x="-22" y="-22" width="44" height="44" rx="13" fill={color} />}
                <g transform="translate(-12,-12)"><SymbolPaths symbol={m.symbol} color={place ? color : '#fff'} width={1.7} /></g>
                <text y="38" textAnchor="middle" className="relay-name">{m.name}</text>
                {!compact && <text y="52" textAnchor="middle" className="relay-sub">{sub(k)}</text>}
              </g>
            )
          })}
          {packet && (
            <g className={`relay-packet ${packet.still ? 'still' : ''} ${mode}`} transform={`translate(${packet.x},${packet.y})`} key={`pk-${cur}`}>
              <rect x={-(packet.text.length * 3.3 + 17)} y="-12" width={packet.text.length * 6.6 + 34} height="24" rx="12" />
              {/* Plain: a drop of what was pressed out, moving down the line. Technical: an envelope, exactly a message. */}
              {mode === 'plain'
                ? <path transform={`translate(${-(packet.text.length * 3.3 + 8)},-7)`} d="M5 0C5 0 0 6.2 0 9.2a5 5 0 0 0 10 0C10 6.2 5 0 5 0Z" fill="#fff" fillOpacity=".95" />
                : <g transform={`translate(${-(packet.text.length * 3.3 + 9)},-6) scale(.5)`}><path d="M3 5h18v14H3Z M3 6l9 7 9-7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" /></g>}
              <text x="7" y="4" textAnchor="middle">{packet.text}</text>
            </g>
          )}
        </svg>
      </div>

      {!hideSteps && <ol ref={list} className="relay-steps" aria-label="Steps in order">
        {events.map((ev, i) => {
          const lean = simplify && mode === 'plain'
          const hasMore = !lean && !!(ev.items?.length || (ev.data && Object.keys(ev.data).length))
          return (
            <li key={i} data-step={i} className={`${i === cur ? 'current' : ''} ${i > cur ? 'future' : ''} ${lean ? 'lean' : ''}`}>
              <button type="button" className="relay-step" onClick={() => jump(i)} aria-current={i === cur ? 'step' : undefined}>
                {!lean && <span className="relay-step-time">{fmtT(ev.t)}</span>}
                <AgentSymbol agent={firstFrom(ev)} size={22} personas={personas} />
                <span className="relay-step-text"><strong>{lean ? `${route(ev)}: ${ev.title}` : ev.title}</strong>{!lean && <small>{route(ev)}</small>}</span>
              </button>
              {hasMore && <button type="button" className="relay-more" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Hide' : mode === 'plain' ? 'What was passed' : 'Payload'}</button>}
              {open === i && (
                <div className="relay-detail">
                  {!!ev.items?.length && <ul>{ev.items.map((it, j) => <li key={j}>{it}</li>)}</ul>}
                  {ev.data && Object.keys(ev.data).length > 0 && <pre>{JSON.stringify(ev.data, null, 2)}</pre>}
                </div>
              )}
            </li>
          )
        })}
      </ol>}
    </div>
  )
}
