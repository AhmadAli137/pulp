import { motion } from 'framer-motion'
import type { LeverParams } from '../../services/api'
import { Big, Frame, INK, Label, LINE, MINT, MUTED, ORANGE, ROSE, clamp, money, pct, useCountUp, useMotionScale } from './shared'

/* A dial turns to the lever's size while the shortfall risk counts down and the lowest-cushion bar grows. */
export default function DialVisual({ p }: { p: LeverParams }) {
  const scale = useMotionScale()
  const main = p.dial.freed_up_per_month || p.dial.extra_income_per_month || p.dial.goal_contribution_per_month
  const share = clamp(main / Math.max(1, p.typical_spending), 0, 0.3)
  const angle = -120 + (share / 0.3) * 240
  const risk = useCountUp(p.after.prob_shortfall, p.before.prob_shortfall, 2000)
  const maxB = Math.max(p.before.median_min_buffer, p.after.median_min_buffer, 1)
  const cx = 290, cy = 280, r = 150
  const ticks = Array.from({ length: 13 }, (_, i) => -120 + i * 20)
  const engineLabel = p.dial.freed_up_per_month ? `free up ${money(p.dial.freed_up_per_month)} a month` : p.dial.extra_income_per_month ? `add ${money(p.dial.extra_income_per_month)} a month` : `save ${money(p.dial.goal_contribution_per_month)} a month`
  const title = p.action ?? engineLabel
  return (
    <Frame label={`${title}: shortfall risk ${pct(p.before.prob_shortfall)} to ${pct(p.after.prob_shortfall)}`}>
      <circle cx={cx} cy={cy} r={r + 30} fill="rgba(255,255,255,0.04)" stroke={LINE} strokeWidth={3} />
      {ticks.map((a) => {
        const rad = ((a - 90) * Math.PI) / 180
        const lit = a <= angle
        return <line key={a} x1={cx + Math.cos(rad) * (r + 6)} y1={cy + Math.sin(rad) * (r + 6)} x2={cx + Math.cos(rad) * (r + 22)} y2={cy + Math.sin(rad) * (r + 22)} stroke={lit ? ORANGE : 'rgba(251,246,238,0.25)'} strokeWidth={a % 60 === 0 ? 6 : 3} strokeLinecap="round" filter={lit ? 'url(#glow)' : undefined} />
      })}
      <motion.g initial={scale ? { rotate: -120 } : false} animate={{ rotate: angle }} transition={{ type: 'spring', stiffness: 60, damping: 14, delay: 0.3 }} style={{ originX: `${cx}px`, originY: `${cy}px` }}>
        <circle cx={cx} cy={cy} r={r - 20} fill="#0F2A20" stroke={INK} strokeWidth={3} />
        <line x1={cx} y1={cy} x2={cx} y2={cy - r + 40} stroke="url(#juice-v)" strokeWidth={16} strokeLinecap="round" filter="url(#glow)" />
        <circle cx={cx} cy={cy} r={18} fill={ORANGE} />
      </motion.g>
      <Big x={cx} y={cy + r + 70} size={20} anchor="middle">{title.length > 34 ? title.slice(0, 33) + '…' : title}</Big>
      <Label x={cx} y={cy + r + 96} size={13} color={MUTED} anchor="middle">{p.action ? engineLabel : `${pct(share)} of what you spend`}</Label>
      <g transform="translate(600, 90)">
        <Label x={0} y={0} size={14} color={MUTED}>chance of running dry</Label>
        <Big x={0} y={66} size={60} color={risk > p.after.prob_shortfall + 0.02 ? ROSE : MINT}>{pct(risk)}</Big>
        <Label x={0} y={96} size={13} color={MUTED}>from {pct(p.before.prob_shortfall)} if nothing changes</Label>
        <Label x={0} y={164} size={14} color={MUTED}>lowest the cushion typically gets</Label>
        <rect x={0} y={180} width={Math.max(4, 320 * Math.max(0, p.before.median_min_buffer) / maxB)} height={20} rx={8} fill={LINE} />
        <Label x={0} y={219} size={13} color={MUTED}>{money(p.before.median_min_buffer)} if nothing changes</Label>
        <motion.rect x={0} y={232} height={20} rx={8} fill="url(#mint-v)" filter="url(#glow)" initial={scale ? { width: Math.max(4, 320 * Math.max(0, p.before.median_min_buffer) / maxB) } : false} animate={{ width: Math.max(4, 320 * Math.max(0, p.after.median_min_buffer) / maxB) }} transition={{ delay: 0.8, duration: 1.4 }} />
        <Label x={0} y={271} size={13} color={MINT} weight={700}>{money(p.after.median_min_buffer)} with this</Label>
        {p.means && <Label x={0} y={312} size={14} color={INK} weight={600}>{p.means.length > 46 ? p.means.slice(0, 45) + '…' : p.means}</Label>}
        {!p.means && p.dial.emergency_floor > 0 && <Label x={0} y={312} size={13} color={MUTED}>keeps a {money(p.dial.emergency_floor)} floor before saving anything</Label>}
      </g>
    </Frame>
  )
}
