/* Replay a run: every real agent run for this account (conversation turns typed or spoken, persona builds and their
   Gemini refinement, personal decks, plan searches, and the Stage 1 distillation of the records), newest first.
   Pick one to replay exactly those events in the relay, step by step, with the live log beside it.
   Deep link: /agents?run=<id>. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ClipboardCopy, Download, MessageCircle, RefreshCw, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api, type AgentRun, type AgentRunSummary, type Persona } from '../../services/api'
import { useApp } from '../../stores/useApp'
import AgentRelay from './AgentRelay'
import AgentSymbol, { STAGE_COLOR, type Stage } from './AgentSymbol'
import RunLog, { logLine } from './RunLog'

type Mode = 'plain' | 'technical'
export type RunFilter = 0 | 1 | 2 | 3

function ago(iso: string | null) {
  if (!iso) return 'From the records'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (!Number.isFinite(s)) return iso
  if (s < 45) return 'just now'
  if (s < 90) return '1 min ago'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 5400) return '1 hour ago'
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}
const absolute = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-CA') : 'Built from the stored Stage 1 results')
const dur = (s: number) => (s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`)
/** Commands sent by page buttons read as plain titles ("explain:plan_search" becomes "Explain: plan search"). */
export function niceTitle(t: string) {
  const m = t.match(/^(explain|ask|show):([^?]*)/i)
  if (!m) return t
  return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}: ${m[2].replace(/[_-]+/g, ' ').trim()}`
}

export default function RunReplay({ accountId, personas, filter, onFilter, narrow }: {
  accountId: number; personas: Persona[]; filter: RunFilter; onFilter: (f: RunFilter) => void; narrow: boolean
}) {
  const openPulp = useApp((s) => s.openPulp)
  const [params, setParams] = useSearchParams()
  const runParam = params.get('run')
  const [runs, setRuns] = useState<AgentRunSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [run, setRun] = useState<AgentRun | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [cur, setCur] = useState(-1)
  const [seek, setSeek] = useState<{ i: number; n: number } | undefined>()
  const [mode, setMode] = useState<Mode>('plain')
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    api.agentRuns(accountId).then((r) => setRuns(r.runs)).catch(() => setError('Runs are not available right now.')).finally(() => setLoading(false))
  }, [accountId])
  useEffect(() => { setRuns(null); setRun(null); load() }, [load])

  // Open the run named in the URL (deep link), and keep the URL in step with the open run.
  useEffect(() => {
    if (!runParam) { setRun(null); return }
    if (run?.id === runParam) return
    let stop = false
    setRunError(null); setCur(-1); setSeek(undefined)
    api.agentRun(accountId, runParam).then((r) => { if (!stop) setRun(r) }).catch(() => { if (!stop) { setRun(null); setRunError('That run is no longer stored. Pick another below.') } })
    return () => { stop = true }
  }, [accountId, runParam]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (run && runParam === run.id) document.getElementById('run-replay')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [run?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('run', id); else next.delete('run')
    setParams(next, { replace: true })
  }

  const shown = useMemo(() => (runs ?? []).filter((r) => !filter || r.stage === filter), [runs, filter])
  const events = run?.events ?? []
  const jump = (i: number) => setSeek((s) => ({ i, n: (s?.n ?? 0) + 1 }))

  const text = () => events.map((e) => logLine(e, mode, personas)).join('\n')
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${run?.title}\n${text()}`); setCopied(true); window.setTimeout(() => setCopied(false), 1600) } catch { setCopied(false) }
  }
  const download = () => {
    if (!run) return
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pulp-run-${accountId}-${run.id}.json`
    document.body.appendChild(a); a.click(); a.remove()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <section className="run-replay" id="run-replay" aria-labelledby="run-replay-title">
      <div className="run-head">
        <div>
          <h2 id="run-replay-title">Replay a run</h2>
          <p className="ag-muted">Every time the agents actually worked for this account is kept here. Pick one to replay it step by step and read its log.</p>
        </div>
        <button type="button" className="run-refresh" onClick={load} disabled={loading} aria-label="Refresh the list of runs"><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>
      </div>

      <div className="run-filters" role="radiogroup" aria-label="Filter runs by stage">
        {([0, 1, 2, 3] as RunFilter[]).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={filter === f} className={`run-filter ${filter === f ? 'on' : ''}`} onClick={() => onFilter(f)}
            style={f ? { ['--stage-color' as string]: STAGE_COLOR[f as Stage] } : undefined}>
            {f === 0 ? 'All' : `Stage ${f}`}{runs && <span className="run-filter-n">{f === 0 ? runs.length : runs.filter((r) => r.stage === f).length}</span>}
          </button>
        ))}
      </div>

      {run && (
        <div className="run-open" style={{ ['--stage-color' as string]: STAGE_COLOR[run.stage as Stage] }} aria-label={`Replay: ${niceTitle(run.title)}`} role="region">
          <div className="run-open-head">
            <div className="run-open-title">
              <span className="run-stage">Stage {run.stage}</span>
              <h3>{niceTitle(run.title)}</h3>
              <p className="ag-muted"><span title={absolute(run.at)}>{ago(run.at)}</span> · {run.trigger}{run.source ? ` · ${run.source}` : ''} · {run.n_events} steps · {dur(run.duration_s)}</p>
            </div>
            <div className="run-open-actions">
              <div className="relay-mode" role="group" aria-label="Log detail">
                <button type="button" aria-pressed={mode === 'plain'} onClick={() => setMode('plain')}>Plain</button>
                <button type="button" aria-pressed={mode === 'technical'} onClick={() => setMode('technical')}>Technical</button>
              </div>
              <button type="button" className="run-btn" onClick={() => void copy()}>{copied ? <Check size={15} /> : <ClipboardCopy size={15} />} {copied ? 'Copied' : 'Copy log'}</button>
              <button type="button" className="run-btn" onClick={download}><Download size={15} /> Download log (JSON)</button>
              <button type="button" className="run-btn ghost" onClick={() => choose(null)} aria-label="Close this replay"><X size={15} /></button>
            </div>
          </div>
          <label className="run-scrub">
            <span>Step {Math.max(0, cur + 1)} of {events.length}</span>
            <input type="range" min={-1} max={Math.max(0, events.length - 1)} value={cur} onChange={(e) => jump(Number(e.target.value))} aria-label="Scrub through the run" />
          </label>
          <div className="run-stage-grid">
            <AgentRelay key={run.id} events={events} personas={personas} compact={narrow} label={`Replay of ${niceTitle(run.title)}`} mode={mode}
              seek={seek} onStep={(i) => setCur(i)} hideSteps />
            <div className="run-log-wrap">
              <h4>Log</h4>
              <RunLog events={events} current={cur} mode={mode} personas={personas} onJump={jump} />
            </div>
          </div>
        </div>
      )}
      {runError && <p className="ag-muted" role="status">{runError}</p>}

      {error && <p className="ag-muted" role="status">{error}</p>}
      {!runs && !error && <p className="ag-muted" role="status">Loading the runs…</p>}
      {runs && shown.length === 0 && (
        <div className="run-empty">
          <p>No {filter ? `Stage ${filter} ` : ''}runs yet. Talk to Pulp, shuffle a twist or open Shocks, and every agent step is recorded here to replay.</p>
          <button type="button" className="agents-try" onClick={() => openPulp('__intro__')}><MessageCircle size={15} />Try it: open Pulp</button>
        </div>
      )}
      {shown.length > 0 && (
        <ol className="run-list" aria-label="Recorded runs, newest first">
          {shown.map((r) => (
            <li key={r.id} className={run?.id === r.id ? 'on' : ''} style={{ ['--stage-color' as string]: STAGE_COLOR[r.stage as Stage] }}>
              <button type="button" className="run-item" onClick={() => choose(r.id)} aria-current={run?.id === r.id ? 'true' : undefined} aria-label={`Replay run: ${niceTitle(r.title)}`}>
                <span className="run-when" title={absolute(r.at)}>{ago(r.at)}</span>
                <span className="run-stage">Stage {r.stage}</span>
                <span className="run-main"><strong>{niceTitle(r.title)}</strong><small>{r.trigger}</small></span>
                <span className="run-agents" aria-hidden="true">{r.agents.slice(0, 6).map((a) => <AgentSymbol key={a} agent={a} size={20} personas={personas} />)}{r.agents.length > 6 && <i>+{r.agents.length - 6}</i>}</span>
                <span className="run-stats">{r.n_events} steps · {dur(r.duration_s)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
