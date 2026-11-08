/* The trade-off: every candidate the planners tried on the plane of staying solvent (x) and reaching your goals (y).
   Screened candidates are light crosses, dominated ones small grey dots, the Pareto set outlined, the finalists large
   role-coloured dots (size = disruption), plans that fall short red triangles, and today's course a hollow ring. */
import { useMemo, useState } from 'react'
import type { SearchCandidate } from '../../services/api'
import type { FullPlan, FullResult } from './searchFixture'
import { ROLE, domainOf, pct, roleOf } from './palette'

type XKey = 'resilience' | 'shortfall'
const W = 600, H = 380, M = { l: 58, r: 18, t: 16, b: 50 }

const xOf = (p: { components?: FullPlan['components']; resilience?: number; shortfall?: number }, k: XKey) =>
  'components' in p && p.components ? (k === 'resilience' ? p.components.resilience : p.components.shortfall ?? 1) : (k === 'resilience' ? p.resilience ?? 0 : p.shortfall ?? 1)

interface Tip { x: number; y: number; title: string; lines: string[] }

export default function TradeoffChart({ result, selectedId, highlightId, onSelect, xKey = 'resilience', small = false }: {
  result: FullResult; selectedId: string; highlightId?: string | null; onSelect?: (id: string) => void; xKey?: XKey; small?: boolean
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const cands = result.search?.candidates ?? []
  const finalists = result.plans
  const caut = result.cautionary ?? []
  const base = result.baseline
  const xName = xKey === 'resilience' ? 'Staying solvent (resilience)' : 'Shortfall covered'
  const plotted = cands.filter((c) => !(c.status === 'screened' && c.resilience === 0 && c.goals === 0))
  const xd = domainOf([...plotted.map((c) => xOf(c, xKey)), ...finalists.map((p) => xOf(p, xKey)), ...caut.map((p) => xOf(p, xKey)), xOf(base, xKey)])
  const yd = domainOf([...plotted.map((c) => c.goals), ...finalists.map((p) => p.components.goals), ...caut.map((p) => p.components.goals), base.components.goals])
  const unit = (v: number, d: { lo: number; hi: number }) => Math.max(0, Math.min(1, (v - d.lo) / (d.hi - d.lo || 1)))
  const PX = (v: number) => M.l + unit(v, xd) * (W - M.l - M.r)
  const PY = (v: number) => H - M.b - unit(v, yd) * (H - M.t - M.b)
  const frontier = useMemo(() => {
    const pts = [...cands.filter((c) => c.status !== 'screened').map((c) => ({ x: xOf(c, xKey), y: c.goals })), ...finalists.map((p) => ({ x: xOf(p, xKey), y: p.components.goals }))]
      .sort((a, b) => b.x - a.x || b.y - a.y)
    const out: { x: number; y: number }[] = []
    let best = -1
    for (const p of pts) if (p.y > best + 1e-9) { out.push(p); best = p.y }
    return out.sort((a, b) => a.x - b.x)
  }, [cands, finalists, xKey])
  const stepPath = frontier.length > 1
    ? frontier.map((p, i) => (i === 0 ? `M ${PX(p.x)} ${PY(p.y)}` : `H ${PX(p.x)} V ${PY(p.y)}`)).join(' ')
    : ''
  const show = (e: { currentTarget: Element }, t: Omit<Tip, 'x' | 'y'>) => {
    const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement
    const box = (e.currentTarget as SVGGraphicsElement).getBoundingClientRect()
    const host = svg?.parentElement?.getBoundingClientRect()
    if (!host) return
    setTip({ ...t, x: box.left - host.left + box.width / 2, y: box.top - host.top })
  }
  const planLines = (p: FullPlan) => [
    `${xName}: ${pct(xOf(p, xKey))}`, `Reaching your goals: ${pct(p.components.goals)}`,
    ...(p.components.shortfall != null && xKey === 'resilience' && result.plan_mode !== 'long_term' ? [`Shortfall covered: ${pct(p.components.shortfall)}`] : []),
    `Disruption: ${pct(p.components.disruption)}`, p.survives === false ? `Runs short in month ${p.first_short_month ?? '?'}` : `Score ${Math.round(p.score * 100)}`,
  ]
  // finalist labels, nudged apart vertically so they do not overlap
  const labels = finalists.map((p) => ({ id: p.id, x: PX(xOf(p, xKey)), y: PY(p.components.goals), text: ROLE[roleOf(p.role)].label, color: ROLE[roleOf(p.role)].color }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15
  const r = (d: number) => (small ? 5 : 7) + (small ? 5 : 9) * Math.max(0, Math.min(1, d))
  const hl = highlightId && highlightId !== selectedId ? highlightId : null
  const hlPt = hl ? [...finalists, ...cands].find((c) => c.id === hl) : null
  return (
    <div className={`lp-scatter ${small ? 'small' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${xName} against reaching your goals for ${cands.length || finalists.length} plans`} onMouseLeave={() => setTip(null)}>
        {xd.ticks.map((t) => (
          <g key={`x${t}`}>
            <line x1={PX(t)} x2={PX(t)} y1={M.t} y2={H - M.b} className="lp-grid" />
            <text x={PX(t)} y={H - M.b + 18} className="lp-tick" textAnchor="middle">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {yd.ticks.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.l} x2={W - M.r} y1={PY(t)} y2={PY(t)} className="lp-grid" />
            <text x={M.l - 8} y={PY(t) + 4} className="lp-tick" textAnchor="end">{Math.round(t * 100)}%</text>
          </g>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 8} className="lp-axis" textAnchor="middle">{xName} →</text>
        <text transform={`translate(15 ${(M.t + H - M.b) / 2}) rotate(-90)`} className="lp-axis" textAnchor="middle">Reaching your goals →</text>
        {plotted.map((c) => <CandidateMark key={c.id} c={c} x={PX(xOf(c, xKey))} y={PY(c.goals)} small={small} />)}
        {stepPath && <path d={stepPath} className="lp-frontier" />}
        <g className="lp-pt lp-pt-base" tabIndex={0} role="button" aria-label={`${base.name}: ${planLines(base).join(', ')}`}
          onMouseEnter={(e) => show(e, { title: base.name, lines: planLines(base) })} onFocus={(e) => show(e, { title: base.name, lines: planLines(base) })} onBlur={() => setTip(null)}>
          <circle cx={PX(xOf(base, xKey))} cy={PY(base.components.goals)} r={r(0)} />
          {!small && <text x={PX(xOf(base, xKey)) + 11} y={PY(base.components.goals) + 15} className="lp-pt-label muted">today’s course</text>}
        </g>
        {caut.map((p) => {
          const x = PX(xOf(p, xKey)), y = PY(p.components.goals), s = r(p.components.disruption) + 1
          return (
            <g key={p.id} className="lp-pt lp-pt-short" tabIndex={0} role="button" aria-label={`Falls short: ${p.name}. ${planLines(p).join(', ')}`}
              onMouseEnter={(e) => show(e, { title: `Falls short · ${p.name}`, lines: planLines(p) })} onFocus={(e) => show(e, { title: `Falls short · ${p.name}`, lines: planLines(p) })} onBlur={() => setTip(null)}>
              <path d={`M ${x} ${y - s} L ${x + s} ${y + s * 0.8} L ${x - s} ${y + s * 0.8} Z`} />
            </g>
          )
        })}
        {hlPt && <circle cx={PX(xOf(hlPt as FullPlan, xKey))} cy={PY('components' in hlPt ? hlPt.components.goals : (hlPt as SearchCandidate).goals)} r={small ? 12 : 17} className="lp-hl-ring" />}
        {finalists.map((p) => {
          const role = ROLE[roleOf(p.role)]
          const x = PX(xOf(p, xKey)), y = PY(p.components.goals)
          const on = p.id === selectedId
          return (
            <g key={p.id} className={`lp-pt lp-pt-final ${on ? 'on' : ''}`} tabIndex={0} role="button" aria-pressed={on}
              aria-label={`${role.label}: ${p.name}. ${planLines(p).join(', ')}`} onClick={() => onSelect?.(p.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(p.id) } }}
              onMouseEnter={(e) => show(e, { title: `${role.label} · ${p.name}`, lines: planLines(p) })} onFocus={(e) => show(e, { title: `${role.label} · ${p.name}`, lines: planLines(p) })} onBlur={() => setTip(null)}>
              {on && <circle cx={x} cy={y} r={r(p.components.disruption) + 5} fill="none" stroke={role.color} strokeWidth={2} opacity={0.5} />}
              <circle cx={x} cy={y} r={r(p.components.disruption)} fill={role.color} stroke="#fff" strokeWidth={2} />
            </g>
          )
        })}
        {!small && labels.map((l) => {
          const right = l.x < W * 0.72
          return <text key={l.id} x={l.x + (right ? 16 : -16)} y={l.y + 4} textAnchor={right ? 'start' : 'end'} className="lp-pt-label" fill={l.color}>{l.text}</text>
        })}
      </svg>
      {tip && (
        <div className="lp-tip" style={{ left: tip.x, top: tip.y }} role="status">
          <strong>{tip.title}</strong>
          {tip.lines.map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </div>
  )
}

function CandidateMark({ c, x, y, small }: { c: SearchCandidate; x: number; y: number; small: boolean }) {
  const t = `${c.name} · resilience ${pct(c.resilience)} · goals ${pct(c.goals)}${c.reason ? ` · ${c.reason}` : ''}`
  if (c.status === 'screened') {
    const s = small ? 2.5 : 3.2
    return <path d={`M ${x - s} ${y - s} L ${x + s} ${y + s} M ${x + s} ${y - s} L ${x - s} ${y + s}`} className="lp-c-screened"><title>{t}</title></path>
  }
  if (c.status === 'dominated') return <circle cx={x} cy={y} r={small ? 2.4 : 3} className="lp-c-dominated"><title>{t}</title></circle>
  if (c.status === 'pareto') return <circle cx={x} cy={y} r={small ? 4 : 5} className="lp-c-pareto"><title>{t}</title></circle>
  return null
}

/** Legend for the scatter's marks. */
export function TradeoffLegend({ longTerm }: { longTerm?: boolean }) {
  return (
    <ul className="lp-legend lp-mark-legend" aria-label="Chart key">
      <li><svg width="14" height="14" aria-hidden="true"><path d="M3 3 L11 11 M11 3 L3 11" className="lp-c-screened" /></svg>screened out</li>
      <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="3" className="lp-c-dominated" /></svg>beaten by another plan</li>
      <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className="lp-c-pareto" /></svg>on the frontier</li>
      <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="#E86A0C" /></svg>finalist (bigger = more upheaval)</li>
      {!longTerm && <li><svg width="14" height="14" aria-hidden="true"><path d="M7 1 L13 12 L1 12 Z" fill="#B42318" opacity=".8" /></svg>falls short</li>}
      <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="#7C8177" strokeWidth="2" /></svg>today’s course</li>
      <li><svg width="18" height="14" aria-hidden="true"><path d="M1 12 H7 V6 H13 V2" fill="none" stroke="#2F7A5B" strokeWidth="2" strokeDasharray="4 3" /></svg>best possible trade-off</li>
    </ul>
  )
}
