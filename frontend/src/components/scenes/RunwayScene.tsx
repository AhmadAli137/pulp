import { useEffect, useState } from 'react'
import type { RunwayParams } from '../../services/api'
import { fmt } from '../ui'

/* The cup is the buffer. Each month under the shock the level drops by the monthly gap; if the cup runs dry the month flashes. */
export default function RunwayScene({ p, durationMs = 5000 }: { p: RunwayParams; durationMs?: number }) {
  const [go, setGo] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setGo(true)); return () => cancelAnimationFrame(id) }, [])
  const months = Math.max(1, p.duration_months)
  const cap = Math.max(p.buffer_start, 1)
  const endLevel = p.runs_out_month != null ? 0 : Math.max(0, p.buffer_start - p.monthly_gap * months) / cap
  const runSeconds = p.runs_out_month != null ? (Math.min(p.runs_out_month, months) / months) * durationMs : durationMs
  const cupX = 60, cupW = 150, cupY = 40, cupH = 170
  const ticks = Array.from({ length: months + 1 }, (_, i) => i)
  const incomeMax = Math.max(p.income_before, p.spending_after, 1)
  const barW = 200
  return (
    <div className="scene runway">
      <svg viewBox="0 0 560 270" role="img" aria-label={`Buffer of ${fmt.money(p.buffer_start)} under the shock: ${p.runway_label} months`}>
        <defs><clipPath id="cup-clip"><path d={`M${cupX} ${cupY} h${cupW} l-14 ${cupH} h-${cupW - 28} z`} /></clipPath></defs>
        <g clipPath="url(#cup-clip)">
          <rect x={cupX} y={cupY} width={cupW} height={cupH} fill="var(--orange-soft)" />
          <g style={{ transformOrigin: `${cupX + cupW / 2}px ${cupY + cupH}px`, transform: `scaleY(${go ? endLevel : 1})`, transition: `transform ${runSeconds}ms linear` }}>
            <rect x={cupX} y={cupY} width={cupW} height={cupH} fill="var(--orange)" />
            <rect x={cupX} y={cupY} width={cupW} height={6} fill="#ffb27a" />
          </g>
          {p.monthly_gap > 0 && <rect className="pulp-bits" x={cupX + 20} y={cupY + 20} width={cupW - 40} height={cupH - 40} fill="url(#none)" opacity={0.15} />}
        </g>
        <path d={`M${cupX} ${cupY} h${cupW} l-14 ${cupH} h-${cupW - 28} z`} fill="none" stroke="var(--forest)" strokeWidth={2.5} />
        <text x={cupX + cupW / 2} y={cupY - 14} textAnchor="middle" fontSize={12} fill="var(--gray)">buffer {fmt.money(p.buffer_start)}</text>
        {/* month ticks under the cup */}
        {ticks.map((m) => {
          const x = cupX - 10 + (m / months) * (cupW + 20)
          const out = p.runs_out_month != null && m === Math.ceil(p.runs_out_month)
          return (
            <g key={m}>
              <line x1={x} y1={cupY + cupH + 8} x2={x} y2={cupY + cupH + 16} stroke="var(--gray-2)" />
              <text x={x} y={cupY + cupH + 30} textAnchor="middle" fontSize={10} fill={out ? 'var(--danger)' : 'var(--gray)'} className={out && go ? 'flash' : ''} style={out ? { animationDelay: `${runSeconds}ms` } : undefined}>{m === 0 ? 'now' : `m${m}`}</text>
            </g>
          )
        })}
        {/* marker travelling along the months */}
        <circle cy={cupY + cupH + 12} r={4} fill="var(--forest)" style={{ transform: `translateX(${go ? cupX - 10 + (p.runs_out_month != null ? (Math.min(p.runs_out_month, months) / months) * (cupW + 20) : cupW + 20) : cupX - 10}px)`, transition: `transform ${runSeconds}ms linear` }} />
        {/* income before / after and spending */}
        <g transform="translate(300 60)">
          <text x={0} y={-16} fontSize={12} fill="var(--gray)">income and spending per month</text>
          <text x={0} y={12} fontSize={11} fill="var(--charcoal)">income before</text>
          <rect x={0} y={18} height={12} rx={3} fill="var(--mint)" width={barW * (p.income_before / incomeMax)} />
          <text x={barW + 8} y={28} fontSize={11} fill="var(--gray)">{fmt.money(p.income_before)}</text>
          <text x={0} y={54} fontSize={11} fill="var(--charcoal)">income during the shock</text>
          <rect x={0} y={60} height={12} rx={3} fill="var(--emerald)" width={barW * (go ? p.income_after / incomeMax : p.income_before / incomeMax)} style={{ transition: 'width 1200ms ease' }} />
          <text x={barW + 8} y={70} fontSize={11} fill="var(--gray)">{fmt.money(p.income_after)}</text>
          <text x={0} y={96} fontSize={11} fill="var(--charcoal)">spending</text>
          <rect x={0} y={102} height={12} rx={3} fill="var(--orange)" width={barW * (p.spending_after / incomeMax)} />
          <text x={barW + 8} y={112} fontSize={11} fill="var(--gray)">{fmt.money(p.spending_after)}</text>
          <text x={0} y={146} fontSize={12} fontWeight={600} fill={p.monthly_gap > 0 ? 'var(--danger)' : 'var(--emerald)'}>{p.monthly_gap > 0 ? `gap ${fmt.money(p.monthly_gap)} a month` : 'no monthly gap'}</text>
          <text x={0} y={170} fontSize={12} fill="var(--charcoal)">{p.runs_out_month != null ? `cup runs dry in month ${Math.ceil(p.runs_out_month)} of ${months}` : `lasts the ${months} months`}</text>
          <text x={0} y={190} fontSize={11} fill="var(--gray)">official runway {p.runway_label} · {p.verdict}</text>
        </g>
      </svg>
    </div>
  )
}
