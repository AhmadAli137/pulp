import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { TimelineParams } from '../../services/api'
import { DANGER, EMERALD, FOREST, Frame, GRAY, Label, ORANGE, clamp, money, useMotionScale } from './shared'

/* Months tick left to right. The twist card lands at month 0, the cup drains by the gap each month, the income bar
   drops to the EI level. If the cup runs dry, that month flashes. */
export default function TimelineVisual({ p }: { p: TimelineParams }) {
  const scale = useMotionScale()
  const months = Math.max(1, p.duration_months)
  const [m, setM] = useState(scale ? 0 : months)
  useEffect(() => {
    if (!scale) { setM(months); return }
    setM(0)
    let i = 0
    const id = setInterval(() => { i += 0.1; setM(Math.min(months, i)); if (i >= months) clearInterval(id) }, 110)
    return () => clearInterval(id)
  }, [months, scale, p.buffer_start])
  const x0 = 120, x1 = 900
  const xm = (mm: number) => x0 + (mm / months) * (x1 - x0)
  const level = p.monthly_gap > 0 ? clamp((p.buffer_start - p.monthly_gap * m) / Math.max(1, p.buffer_start), 0, 1) : 1
  const cupX = xm(Math.min(m, months)) - 36
  const dry = p.runs_out_month != null && m >= p.runs_out_month
  const barMax = Math.max(p.income_before, p.spending_after, 1)
  const bar = (v: number) => 160 * (v / barMax)
  const left = p.monthly_gap > 0 ? Math.max(0, p.buffer_start - p.monthly_gap * Math.min(m, months)) : p.buffer_start
  return (
    <Frame label={`${months} months under the shock, ${p.runway_label} months of runway`}>
      <motion.g initial={scale ? { y: -140, opacity: 0, rotate: -8 } : false} animate={{ y: 0, opacity: 1, rotate: -4 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
        <rect x={x0 - 60} y={40} width={150} height={92} rx={12} fill="#fff" stroke={FOREST} strokeWidth={3} />
        <Label x={x0 + 15} y={72} size={13} color={GRAY} anchor="middle">TWIST CARD</Label>
        <Label x={x0 + 15} y={100} size={16} color={FOREST} anchor="middle" weight={700}>{p.income_after < p.income_before ? `income to ${Math.round((p.income_after / Math.max(1, p.income_before)) * 100)}%` : 'bills up'}</Label>
      </motion.g>
      <line x1={x0} x2={x1} y1={400} y2={400} stroke="#c9cfc0" strokeWidth={3} />
      {Array.from({ length: months + 1 }, (_, i) => (
        <g key={i}>
          <line x1={xm(i)} x2={xm(i)} y1={392} y2={408} stroke={GRAY} strokeWidth={2} />
          <Label x={xm(i)} y={432} size={14} color={i <= m ? FOREST : GRAY} anchor="middle" weight={i <= m ? 600 : 400}>{i === 0 ? 'now' : `m${i}`}</Label>
        </g>
      ))}
      {p.events.map((e, i) => (
        <g key={i}>
          <circle cx={xm(e.month)} cy={400} r={7} fill={ORANGE} />
          <Label x={xm(e.month)} y={458} size={12} color={GRAY} anchor="middle">{e.label}</Label>
        </g>
      ))}
      {p.runs_out_month != null && (
        <g>
          <circle cx={xm(p.runs_out_month)} cy={400} r={dry ? 16 : 8} fill={DANGER} opacity={dry ? 0.9 : 0.4} className={dry ? 'stage-flash' : ''} />
          <Label x={xm(p.runs_out_month)} y={482} size={13} color={DANGER} anchor="middle" weight={700}>cup runs dry after {p.runs_out_month.toFixed(1)} months</Label>
        </g>
      )}
      {/* the travelling cup */}
      <g transform={`translate(${cupX}, 250)`}>
        <path d="M0 0 L72 0 L62 110 L10 110 Z" fill="#FFF8F1" stroke={dry ? DANGER : FOREST} strokeWidth={4} strokeLinejoin="round" />
        <clipPath id="tl-cup"><path d="M0 0 L72 0 L62 110 L10 110 Z" /></clipPath>
        <rect clipPath="url(#tl-cup)" x={-5} y={110 - level * 106} width={82} height={120} fill={ORANGE} />
        <Label x={36} y={-12} size={14} color={dry ? DANGER : FOREST} anchor="middle" weight={700}>{money(left)}</Label>
      </g>
      {/* income and spending bars */}
      <g transform="translate(680, 60)">
        <Label x={0} y={0} size={13} color={GRAY}>each month</Label>
        <rect x={0} y={14} width={bar(p.income_before)} height={22} rx={6} fill="#D9E0CF" />
        <Label x={bar(p.income_before) + 10} y={31} size={13} color={GRAY}>{money(p.income_before)} before</Label>
        <motion.rect x={0} y={44} height={22} rx={6} fill={EMERALD} initial={scale ? { width: bar(p.income_before) } : false} animate={{ width: bar(p.income_after) }} transition={{ delay: 1, duration: 1.2 }} />
        <Label x={bar(p.income_after) + 10} y={61} size={13} color={EMERALD} weight={600}>{money(p.income_after)} in</Label>
        <rect x={0} y={74} width={bar(p.spending_after)} height={22} rx={6} fill={ORANGE} />
        <Label x={bar(p.spending_after) + 10} y={91} size={13} color={ORANGE} weight={600}>{money(p.spending_after)} out</Label>
        {p.monthly_gap > 0 && <Label x={0} y={126} size={16} color={DANGER} weight={700}>{money(p.monthly_gap)} short each month</Label>}
        {p.monthly_gap <= 0 && <Label x={0} y={126} size={16} color={EMERALD} weight={700}>still covered each month</Label>}
      </g>
      <Label x={500} y={530} size={15} color={GRAY} anchor="middle">{p.verdict}</Label>
    </Frame>
  )
}
