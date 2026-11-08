import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import type { AgentEvent, HunterDoc, StageEvent } from '../services/api'
import { Chip } from './ui'

/* A visual of agents at work: swimlanes per agent and per code tool, cards in time order, connectors for tool
   calls, dividers for pipeline stages, and a strip of data structures that light up when first touched.
   Live mode shows every event as it arrives; replay mode reveals them on a timer with play/pause. */

export interface TraceLane { key: string; label: string; kind: 'agent' | 'code' | 'output' }
export interface TraceEvent {
  id: string; t: number; lane: string
  kind: 'tool_call' | 'tool_result' | 'text' | 'final' | 'stage' | 'finding'
  title: string; detail?: string; link?: 'to-code' | 'from-code'; touches?: string[]; strength?: string
}

export const COUNCIL_LANES: TraceLane[] = [
  { key: 'strategist', label: 'Strategist · AI', kind: 'agent' },
  { key: 'engine', label: 'Engine · code', kind: 'code' },
  { key: 'challenger', label: 'Challenger · AI', kind: 'agent' },
  { key: 'explainer', label: 'Explainer · AI', kind: 'agent' },
]
export const COUNCIL_DATA = ['Frozen request', 'Grid', 'Candidates', 'Flags', 'Ranked plans', 'Scenes']
export const HUNTER_LANES: TraceLane[] = [
  { key: 'hunter', label: 'Pattern Hunter · AI', kind: 'agent' },
  { key: 'tools', label: 'Statistical tools · code', kind: 'code' },
  { key: 'findings', label: 'Findings', kind: 'output' },
]
export const HUNTER_DATA = ['Feature table', 'Flags', 'Findings']

const short = (args?: Record<string, unknown>) => args ? Object.entries(args).filter(([k]) => k !== 'bins').map(([k, v]) => `${k}: ${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}`).join(' · ').slice(0, 140) : ''
const STAGE_TITLES: Record<string, [string, string]> = {
  freeze: ['Freezing the request…', 'Request frozen'], fan_out: ['Scoring the lever grid…', 'Grid scored'], council: ['Council convened: two agents in parallel', 'Council finished'],
  validate: ['Re-scoring every proposed lever in code…', 'Levers validated'], rank: ['Ranking…', 'Ranked'], explain: ['Explainer choosing scenes…', 'Scenes ready'],
}
const STAGE_TOUCH: Record<string, string[]> = { freeze: ['Frozen request'], fan_out: ['Grid', 'Candidates'], validate: ['Candidates', 'Flags'], rank: ['Ranked plans'], explain: ['Scenes'] }

export function normalizeCouncilEvents(events: Array<{ type: 'stage'; data: StageEvent } | { type: 'agent'; data: AgentEvent }>): TraceEvent[] {
  const out: TraceEvent[] = []
  events.forEach((e, i) => {
    if (e.type === 'stage') {
      const d = e.data
      const [start, done] = STAGE_TITLES[d.name] ?? [d.name, d.name]
      const extra = d.status === 'done' && d.data?.candidates != null ? ` · ${String(d.data.candidates)} candidates` : d.status === 'done' && d.data?.recommended ? ` · ${String(d.data.recommended)}` : ''
      out.push({ id: `s${i}`, t: 0, lane: '*', kind: 'stage', title: (d.detail || (d.status === 'start' ? start : done)) + extra, detail: d.seconds != null ? `${d.seconds.toFixed(1)} s` : undefined, touches: d.status === 'done' ? STAGE_TOUCH[d.name] : undefined })
      return
    }
    const a = e.data
    if (a.kind === 'tool_call') out.push({ id: `a${i}`, t: a.t, lane: a.agent, kind: 'tool_call', title: `calls ${a.tool ?? 'tool'}`, detail: short(a.args), link: 'to-code', touches: a.tool === 'score_strategy' ? ['Candidates'] : undefined })
    else if (a.kind === 'tool_result') out.push({ id: `a${i}`, t: a.t, lane: 'engine', kind: 'tool_result', title: `${a.tool ?? 'tool'} → result`, detail: a.summary, link: 'from-code' })
    else out.push({ id: `a${i}`, t: a.t, lane: a.agent, kind: a.kind, title: a.kind === 'final' ? 'final answer' : 'says', detail: a.summary, touches: a.agent === 'challenger' && a.kind === 'final' ? ['Flags'] : a.agent === 'explainer' && a.kind === 'final' ? ['Scenes'] : undefined })
  })
  return out
}

export function normalizeHunterReplay(doc: HunterDoc): TraceEvent[] {
  const out: TraceEvent[] = []
  let findingIdx = 0
  doc.tool_log.forEach((c, i) => {
    if (c.tool === 'record_finding') {
      const f = doc.findings.find((x) => x.recorded_after_call === i + 1) ?? doc.findings[findingIdx]
      findingIdx++
      out.push({ id: `h${i}`, t: i, lane: 'hunter', kind: 'tool_call', title: 'records a finding', detail: String(c.args.title ?? ''), link: 'to-code', touches: ['Findings'] })
      if (f) out.push({ id: `f${i}`, t: i, lane: 'findings', kind: 'finding', title: f.title, detail: f.statement, strength: f.strength })
      return
    }
    const touches = c.tool === 'compare_flag' ? ['Flags', 'Feature table'] : c.tool === 'list_features' ? ['Feature table', 'Flags'] : ['Feature table']
    out.push({ id: `h${i}`, t: i, lane: 'hunter', kind: 'tool_call', title: `asks ${c.tool}`, detail: short(c.args), link: 'to-code', touches })
    out.push({ id: `r${i}`, t: i, lane: 'tools', kind: 'tool_result', title: `${c.tool} → result`, detail: c.tool === 'list_features' ? 'feature catalogue, flags, targets' : 'numbers back to the agent', link: 'from-code' })
  })
  return out
}

export default function AgentTrace({ events, lanes, live, dataNames, stepMs = 600, title }: { events: TraceEvent[]; lanes: TraceLane[]; live: boolean; dataNames: string[]; stepMs?: number; title?: string }) {
  const [visible, setVisible] = useState(live ? events.length : 0)
  const [playing, setPlaying] = useState(!live)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (live) setVisible(events.length) }, [live, events.length])
  useEffect(() => {
    if (live || !playing) return
    if (visible >= events.length) { setPlaying(false); return }
    const id = window.setTimeout(() => setVisible((v) => Math.min(events.length, v + 1)), stepMs)
    return () => window.clearTimeout(id)
  }, [live, playing, visible, events.length, stepMs])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [visible])

  const shown = events.slice(0, visible)
  const touched = new Set<string>()
  shown.forEach((e) => e.touches?.forEach((t) => touched.add(t)))
  const col = (lane: string) => Math.max(0, lanes.findIndex((l) => l.key === lane))
  const codeCol = lanes.findIndex((l) => l.kind === 'code')

  return (
    <div className="trace" style={{ ['--lanes' as string]: lanes.length }}>
      <div className="trace-head">
        <div className="trace-data">
          {title && <span className="trace-title">{title}</span>}
          {dataNames.map((d) => <span key={d} className={`trace-datum ${touched.has(d) ? 'lit' : ''}`}>{d}</span>)}
        </div>
        {!live && (
          <div className="trace-controls">
            <button type="button" onClick={() => { if (visible >= events.length) setVisible(0); setPlaying((p) => !p) }} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
            <button type="button" onClick={() => { setVisible(0); setPlaying(true) }} aria-label="Replay"><RotateCcw size={13} /></button>
            <span className="tiny muted">{visible} / {events.length}</span>
          </div>
        )}
        {live && <span className="trace-live"><span className="dot" />live</span>}
      </div>
      <div className="trace-lanes">{lanes.map((l) => <div key={l.key} className={`trace-lane ${l.kind}`}>{l.label}</div>)}</div>
      <div className="trace-grid">
        {shown.map((e) => {
          if (e.kind === 'stage') return <div key={e.id} className="trace-stage"><span>{e.title}</span>{e.detail && <small>{e.detail}</small>}</div>
          const c = col(e.lane)
          const laneKind = lanes[c]?.kind ?? 'agent'
          return (
            <div key={e.id} className="trace-row">
              {lanes.map((l, i) => {
                if (i === c) return (
                  <div key={l.key} className={`trace-card ${e.kind} ${laneKind}`}>
                    <div className="trace-card-title">{e.strength && <Chip tone={e.strength === 'strong' ? 'gold' : e.strength === 'moderate' ? 'outline' : 'gray'}>{e.strength}</Chip>}{e.title}</div>
                    {e.detail && <div className="trace-card-detail">{e.detail}</div>}
                  </div>
                )
                if (e.link === 'to-code' && codeCol >= 0 && i === codeCol) return <div key={l.key} className="trace-link to"><span>→ {e.title.replace(/^(calls|asks|records a) /, '')}</span></div>
                if (e.link === 'from-code' && i !== c && lanes[i].kind === 'agent' && (i === c - 1 || i === c + 1)) return <div key={l.key} className="trace-link from"><span>← result</span></div>
                return <div key={l.key} />
              })}
            </div>
          )
        })}
        {live && shown.length === 0 && <div className="trace-stage"><span>Waiting for the first event…</span></div>}
        <div ref={endRef} />
      </div>
    </div>
  )
}
