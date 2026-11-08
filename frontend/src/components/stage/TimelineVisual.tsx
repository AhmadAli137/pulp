import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { TimelineParams } from '../../services/api'
import { Big, Frame, INK, Label, LINE, MINT, MUTED, ORANGE, ROSE, clamp, money, useMotionScale } from './shared'

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
  const bar = (v: number) => 170 * (v / barMax)
  const left = p.monthly_gap > 0 ? Math.max(0, p.buffer_start - p.monthly_gap * Math.min(m, months)) : p.buffer_start
  const trailW = xm(Math.min(m, months)) - x0
  return (
    <Frame label={`${months} months under the shock, ${p.runway_label} months of runway`}>
      <motion.g initial={scale ? { y: -160, opacity: 0, rotate: -10 } : false} animate={{ y: 0, opacity: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.1 }}>
        <rect x={x0 - 60} y={36} width={160} height={96} rx={14} fill="#FFFDF8" />
        <Label x={x0 + 20} y={66} size={11} color="#c75610" anchor="middle" weight={700}>TWIST CARD</Label>
        <Label x={x0 + 20} y={96} size={17} color="#183B2D" anchor="middle" weight={800} family="Manrope, sans-serif">{p.income_after < p.income_before ? `income to ${Math.round((p.income_after / Math.max(1, p.income_before)) * 100)}%` : 'bills up'}</Label>
      </motion.g>
      <line x1={x0} x2={x1} y1={400} y2={400} stroke={LINE} strokeWidth={4} strokeLinecap="round" />
      {trailW > 0 && <line x1={x0} x2={x0 + trailW} y1={400} y2={400} stroke={dry ? ROSE : ORANGE} strokeWidth={6} strokeLinecap="round" filter="url(#glow)" />}
      {Array.from({ length: months + 1 }, (_, i) => (
        <g key={i}>
          <line x1={xm(i)} x2={xm(i)} y1={390} y2={410} stroke={i <= m ? INK : MUTED} strokeWidth={2.5} />
          <Label x={xm(i)} y={436} size={15} color={i <= m ? INK : MUTED} anchor="middle" weight={i <= m ? 700 : 400}>{i === 0 ? 'now' : `m${i}`}</Label>
        </g>
      ))}
      {p.events.map((e, i) => {
        const stack = p.events.slice(0, i).filter((o) => Math.abs(o.month - e.month) < 0.5).length
        return (
          <g key={i}>
            <circle cx={xm(e.month)} cy={400} r={8} fill={ORANGE} filter="url(#glow)" />
            <Label x={xm(e.month)} y={462 + stack * 18} size={12} color={MUTED} anchor="middle">{e.label}</Label>
          </g>
        )
      })}
      {p.runs_out_month != null && (
        <g>
          <circle cx={xm(p.runs_out_month)} cy={400} r={dry ? 18 : 9} fill={ROSE} opacity={dry ? 1 : 0.5} className={dry ? 'stage-flash' : ''} filter="url(#glow)" />
          <Label x={xm(p.runs_out_month)} y={500} size={15} color={ROSE} anchor="middle" weight={800}>cup runs dry after {p.runs_out_month.toFixed(1)} months</Label>
        </g>
      )}
      {/* the travelling cup */}
      <g transform={`translate(${cupX}, 250)`}>
        <path d="M0 0 L72 0 L62 110 L10 110 Z" fill="rgba(255,255,255,0.06)" stroke={dry ? ROSE : INK} strokeWidth={4} strokeLinejoin="round" />
        <clipPath id="tl-cup"><path d="M0 0 L72 0 L62 110 L10 110 Z" /></clipPath>
        <rect clipPath="url(#tl-cup)" x={-5} y={110 - level * 106} width={82} height={120} fill={dry ? ROSE : 'url(#juice-v)'} />
        <Label x={36} y={-14} size={15} color={dry ? ROSE : INK} anchor="middle" weight={800}>{money(left)}</Label>
      </g>
      {/* income and spending bars */}
      <g transform="translate(660, 50)">
        <Label x={0} y={0} size={13} color={MUTED}>each month</Label>
        <rect x={0} y={14} width={bar(p.income_before)} height={22} rx={8} fill={LINE} />
        <Label x={bar(p.income_before) + 10} y={31} size={13} color={MUTED}>{money(p.income_before)} before</Label>
        <motion.rect x={0} y={44} height={22} rx={8} fill="url(#mint-v)" initial={scale ? { width: bar(p.income_before) } : false} animate={{ width: bar(p.income_after) }} transition={{ delay: 1, duration: 1.2 }} />
        <Label x={bar(p.income_after) + 10} y={61} size={13} color={MINT} weight={700}>{money(p.income_after)} in</Label>
        <rect x={0} y={74} width={bar(p.spending_after)} height={22} rx={8} fill="url(#juice)" />
        <Label x={bar(p.spending_after) + 10} y={91} size={13} color={ORANGE} weight={700}>{money(p.spending_after)} out</Label>
        {p.monthly_gap > 0 && <Big x={0} y={136} size={22} color={ROSE}>{money(p.monthly_gap)} short each month</Big>}
        {p.monthly_gap <= 0 && <Big x={0} y={136} size={22} color={MINT}>still covered each month</Big>}
      </g>
      <Label x={500} y={540} size={14} color={MUTED} anchor="middle">{p.verdict}</Label>
    </Frame>
  )
}
