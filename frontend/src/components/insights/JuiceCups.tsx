/* Beginner-friendly views for Insights findings: a row of juice cups whose fill is a percentage, a provenance tag that
   separates recorded outcomes from simulations, and a Simple | Detailed toggle. Every value is passed in from the same
   data object the detailed chart reads, so both views always agree. */
import { useEffect, useId, useState, type ReactNode } from 'react'
import { api, type Research } from '../../services/api'
import './insights-visuals.css'

export interface Cup { label: string; value: number; sub?: string; highlight?: boolean }

/** Where a finding's numbers come from. One object per finding, read by both the simple and the detailed view. */
export interface Source { kind: 'recorded' | 'simulated'; what: string; period: string }

/** The account records behind every Stage 1 finding (monthly summaries and the loan snapshot). */
export const RECORDS_PERIOD = '2020-01 to 2025-12'

export function Provenance({ source }: { source: Source }) {
  return (
    <p className="prov-line">
      <span className={`prov-tag prov-${source.kind}`}>{source.kind === 'recorded' ? 'Recorded' : 'Simulated'}</span>
      <span>{source.what} · {source.period}</span>
    </p>
  )
}

export function ProvenanceLegend() {
  return (
    <p className="prov-legend small muted">
      <span className="prov-tag prov-recorded">Recorded</span> happened in the bank's records.{' '}
      <span className="prov-tag prov-simulated">Simulated</span> what the engine computes would happen under a shock.
    </p>
  )
}

export function ViewToggle({ value, onChange, label }: { value: 'simple' | 'detailed'; onChange: (v: 'simple' | 'detailed') => void; label: string }) {
  return (
    <div className="view-toggle" role="group" aria-label={`${label}: view`}>
      {(['simple', 'detailed'] as const).map((v) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{v === 'simple' ? 'Simple' : 'Detailed'}</button>
      ))}
    </div>
  )
}

/** A finding with both views. Simple shows the cups; Detailed shows the chart and table. */
export function Finding({ title, source, simple, detailed, defaultView = 'simple', children }: {
  title: string; source: Source; simple: ReactNode; detailed: ReactNode; defaultView?: 'simple' | 'detailed'; children?: ReactNode
}) {
  const [view, setView] = useState<'simple' | 'detailed'>(defaultView)
  return (
    <div className="finding">
      <div className="finding-head">
        <Provenance source={source} />
        <ViewToggle value={view} onChange={setView} label={title} />
      </div>
      {children}
      <div className="finding-body">{view === 'simple' ? simple : detailed}</div>
    </div>
  )
}

/** A row of cups. value is a percentage 0-100; the fill height is the value. */
export function JuiceCups({ cups, title, tone = 'juice', unit = '%', decimals = 0 }: {
  cups: Cup[]; title?: string; tone?: 'juice' | 'warn' | 'muted'; unit?: string; decimals?: number
}) {
  return (
    <figure className="cups">
      {title && <figcaption>{title}</figcaption>}
      <ul className="cups-row">
        {cups.map((c) => <li key={c.label}><OneCup cup={c} tone={tone} unit={unit} decimals={decimals} /></li>)}
      </ul>
    </figure>
  )
}

function OneCup({ cup, tone, unit, decimals }: { cup: Cup; tone: 'juice' | 'warn' | 'muted'; unit: string; decimals: number }) {
  const id = useId().replace(/:/g, '')
  const v = Math.max(0, Math.min(100, cup.value))
  const top = 10
  const bottom = 82
  const level = bottom - (bottom - top) * (v / 100)
  const text = `${cup.value.toFixed(decimals)}${unit}`
  return (
    <div className={`cup${cup.highlight ? ' cup-mine' : ''}`}>
      <strong className="cup-value">{text}</strong>
      <svg viewBox="0 0 64 88" role="img" aria-label={`${cup.label}: ${text}${cup.sub ? ` (${cup.sub})` : ''}`}>
        <defs>
          <clipPath id={`c${id}`}><path d="M9 10 L55 10 L49 82 L15 82 Z" /></clipPath>
        </defs>
        <path d="M9 10 L55 10 L49 82 L15 82 Z" className="cup-glass" />
        <g clipPath={`url(#c${id})`}>
          <rect x="0" y={level} width="64" height={88 - level} className={`cup-fill cup-${tone}`} />
          {v > 2 && <path d={`M0 ${level} Q16 ${level - 2.4} 32 ${level} T64 ${level}`} className={`cup-surface cup-${tone}`} />}
        </g>
        {[25, 50, 75].map((t) => {
          const y = bottom - (bottom - top) * (t / 100)
          const x = 9 + (6 * (y - top)) / (bottom - top)
          return <line key={t} x1={x} x2={x + 5} y1={y} y2={y} className="cup-tick" />
        })}
        <path d="M9 10 L55 10 L49 82 L15 82 Z" className="cup-outline" />
      </svg>
      <span className="cup-label">{cup.label}</span>
      {cup.sub && <span className="cup-sub">{cup.sub}</span>}
    </div>
  )
}

/** One fetch of the research summary per page, shared by every Insights section. */
let researchPromise: Promise<Research | null> | null = null
export function useResearch() {
  const [research, setResearch] = useState<Research | null>(null)
  useEffect(() => {
    let live = true
    researchPromise ??= api.research().catch(() => { researchPromise = null; return null })
    void researchPromise.then((r) => { if (live) setResearch(r) })
    return () => { live = false }
  }, [])
  return research
}
