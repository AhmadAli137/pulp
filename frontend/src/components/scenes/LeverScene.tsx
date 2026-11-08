import { useEffect, useState } from 'react'
import type { LeverParams } from '../../services/api'
import { fmt } from '../ui'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* Turning one dial: the runway bar grows and the shortfall probability counts down from before to after. */
function useTween(target: number, ms = 2400, start = 0) {
  const [v, setV] = useState(reduced() ? target : start)
  useEffect(() => {
    if (reduced()) { setV(target); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      setV(start + (target - start) * e)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, start])
  return v
}

export default function LeverScene({ p }: { p: LeverParams }) {
  const d = p.dial
  const main = d.freed_up_per_month > 0 ? ['free up per month', d.freed_up_per_month] as const
    : d.extra_income_per_month > 0 ? ['extra income per month', d.extra_income_per_month] as const
      : d.goal_contribution_per_month > 0 ? ['saved per month', d.goal_contribution_per_month] as const
        : ['emergency floor', d.emergency_floor] as const
  const maxDial = main[0] === 'emergency floor' ? Math.max(1, p.typical_spending * 6) : Math.max(1, p.typical_spending * 0.3)
  const frac = Math.min(1, main[1] / maxDial)
  const k = useTween(1)
  const angle = -130 + 260 * frac * k
  const pShort = p.before.prob_shortfall + (p.after.prob_shortfall - p.before.prob_shortfall) * k
  const minBuf = p.before.median_min_buffer + (p.after.median_min_buffer - p.before.median_min_buffer) * k
  const barMax = Math.max(1, Math.abs(p.before.median_min_buffer), Math.abs(p.after.median_min_buffer), p.typical_spending)
  return (
    <div className="scene lever">
      <svg viewBox="0 0 560 220" role="img" aria-label={`${p.lever_label}: shortfall risk from ${fmt.pct(p.before.prob_shortfall)} to ${fmt.pct(p.after.prob_shortfall)}`}>
        <g transform="translate(110 110)">
          <circle r={70} fill="var(--card)" stroke="var(--line)" strokeWidth={10} />
          <path d="M-60 36 A70 70 0 1 1 60 36" fill="none" stroke="var(--orange)" strokeWidth={10} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - frac * k} />
          <line x1={0} y1={0} x2={0} y2={-52} stroke="var(--forest)" strokeWidth={4} strokeLinecap="round" transform={`rotate(${angle})`} />
          <circle r={7} fill="var(--forest)" />
          <text y={95} textAnchor="middle" fontSize={11} fill="var(--gray)">{main[0]}</text>
          <text y={112} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--charcoal)">{fmt.money(main[1] * k)}</text>
        </g>
        <g transform="translate(230 40)">
          <text fontSize={12} fill="var(--charcoal)" fontWeight={600}>{p.lever_label}</text>
          <text y={32} fontSize={11} fill="var(--gray)">chance of running out under the shock</text>
          <text y={64} fontSize={30} fontWeight={700} fill={pShort < p.before.prob_shortfall ? 'var(--emerald)' : 'var(--charcoal)'}>{fmt.pct(pShort)}</text>
          <text x={110} y={64} fontSize={11} fill="var(--gray)">was {fmt.pct(p.before.prob_shortfall)}</text>
          <text y={100} fontSize={11} fill="var(--gray)">lowest point of the buffer (median path)</text>
          <rect y={108} height={14} rx={4} width={300} fill="var(--mint)" />
          <rect y={108} height={14} rx={4} width={300 * Math.max(0, Math.min(1, (minBuf / barMax + 1) / 2))} fill={minBuf >= 0 ? 'var(--emerald)' : 'var(--danger)'} />
          <line x1={150} y1={104} x2={150} y2={126} stroke="var(--charcoal)" strokeDasharray="2 2" />
          <text y={140} fontSize={11} fill="var(--charcoal)">{fmt.money(minBuf)} <tspan fill="var(--gray)">(zero at the dotted line)</tspan></text>
          <text y={168} fontSize={10} fill="var(--gray)">{[d.freed_up_per_month > 0 && `free up ${fmt.money(d.freed_up_per_month)}`, d.goal_contribution_per_month > 0 && `save ${fmt.money(d.goal_contribution_per_month)}`, d.emergency_floor > 0 && `floor ${fmt.money(d.emergency_floor)}`, d.extra_income_per_month > 0 && `+${fmt.money(d.extra_income_per_month)} income`].filter(Boolean).join(' · ')}</text>
        </g>
      </svg>
    </div>
  )
}
