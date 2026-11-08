import { motion } from 'framer-motion'
import type { LeverParams } from '../../services/api'
import { DANGER, EMERALD, FOREST, Frame, GRAY, Label, ORANGE, clamp, money, pct, useCountUp, useMotionScale } from './shared'

/* A dial turns to the lever's size while the shortfall risk counts down and the lowest-cushion bar grows. */
export default function DialVisual({ p }: { p: LeverParams }) {
  const scale = useMotionScale()
  const main = p.dial.freed_up_per_month || p.dial.extra_income_per_month || p.dial.goal_contribution_per_month
  const share = clamp(main / Math.max(1, p.typical_spending), 0, 0.3)
  const angle = -120 + (share / 0.3) * 240
  const risk = useCountUp(p.after.prob_shortfall, p.before.prob_shortfall, 2000)
  const maxB = Math.max(p.before.median_min_buffer, p.after.median_min_buffer, 1)
  const cx = 300, cy = 290, r = 150
  const ticks = Array.from({ length: 13 }, (_, i) => -120 + i * 20)
  const dialLabel = p.dial.freed_up_per_month ? `free up ${money(p.dial.freed_up_per_month)} a month` : p.dial.extra_income_per_month ? `add ${money(p.dial.extra_income_per_month)} a month` : `save ${money(p.dial.goal_contribution_per_month)} a month`
  return (
    <Frame label={`${p.lever_label}: shortfall risk ${pct(p.before.prob_shortfall)} to ${pct(p.after.prob_shortfall)}`}>
      <circle cx={cx} cy={cy} r={r + 26} fill="#FFF8F1" stroke="#E9ECE4" strokeWidth={3} />
      {ticks.map((a) => {
        const rad = ((a - 90) * Math.PI) / 180
        return <line key={a} x1={cx + Math.cos(rad) * (r + 4)} y1={cy + Math.sin(rad) * (r + 4)} x2={cx + Math.cos(rad) * (r + 18)} y2={cy + Math.sin(rad) * (r + 18)} stroke={a <= angle ? ORANGE : '#d5d9cc'} strokeWidth={a % 60 === 0 ? 5 : 3} strokeLinecap="round" />
      })}
      <motion.g initial={scale ? { rotate: -120 } : false} animate={{ rotate: angle }} transition={{ duration: 1.8, ease: 'easeInOut' }} style={{ originX: `${cx}px`, originY: `${cy}px` }}>
        <circle cx={cx} cy={cy} r={r - 20} fill={FOREST} />
        <line x1={cx} y1={cy} x2={cx} y2={cy - r + 40} stroke={ORANGE} strokeWidth={14} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={16} fill={ORANGE} />
      </motion.g>
      <Label x={cx} y={cy + r + 62} size={17} color={FOREST} anchor="middle" weight={700}>{dialLabel}</Label>
      <Label x={cx} y={cy + r + 88} size={13} color={GRAY} anchor="middle">{pct(share)} of what you spend</Label>
      <g transform="translate(600, 110)">
        <Label x={0} y={0} size={14} color={GRAY}>chance of running dry</Label>
        <Label x={0} y={62} size={54} color={risk > p.after.prob_shortfall + 0.02 ? DANGER : EMERALD} weight={800}>{pct(risk)}</Label>
        <Label x={0} y={92} size={13} color={GRAY}>from {pct(p.before.prob_shortfall)} if nothing changes</Label>
        <Label x={0} y={160} size={14} color={GRAY}>lowest the cushion typically gets</Label>
        <rect x={0} y={176} width={Math.max(4, 320 * Math.max(0, p.before.median_min_buffer) / maxB)} height={18} rx={6} fill="#D9E0CF" />
        <Label x={0} y={214} size={13} color={GRAY}>{money(p.before.median_min_buffer)} if nothing changes</Label>
        <motion.rect x={0} y={228} height={18} rx={6} fill={EMERALD} initial={scale ? { width: Math.max(4, 320 * Math.max(0, p.before.median_min_buffer) / maxB) } : false} animate={{ width: Math.max(4, 320 * Math.max(0, p.after.median_min_buffer) / maxB) }} transition={{ delay: 0.8, duration: 1.4 }} />
        <Label x={0} y={266} size={13} color={EMERALD} weight={600}>{money(p.after.median_min_buffer)} with the lever</Label>
        {p.dial.emergency_floor > 0 && <Label x={0} y={306} size={13} color={GRAY}>keeps a {money(p.dial.emergency_floor)} floor before saving anything</Label>}
      </g>
    </Frame>
  )
}
