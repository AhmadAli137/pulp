import { motion } from 'framer-motion'
import type { CalendarParams } from '../../services/api'
import { Big, Frame, INK, Label, MINT, MUTED, ORANGE, ROSE, pct, useMotionScale } from './shared'

/* Two four-week strips. Top: bills land on day 3, pay arrives day 5, the balance dips below zero in between.
   Bottom: pay first, no dip. The habit is timing, not shortage. */
export default function CalendarVisual({ p }: { p: CalendarParams }) {
  const scale = useMotionScale()
  const x0 = 90, cell = 29, gap = 3
  const strip = (y: number, dipDays: number[], title: string) => (
    <g>
      <Label x={x0} y={y - 18} size={16} color={INK} weight={800}>{title}</Label>
      {Array.from({ length: 28 }, (_, d) => {
        const day = d + 1
        const dip = dipDays.includes(day)
        const pay = day === 5 || (dipDays.length === 0 && day === 1)
        return (
          <motion.rect key={d} x={x0 + d * (cell + gap)} y={y} width={cell} height={cell} rx={7}
            fill={dip ? ROSE : pay ? MINT : 'rgba(251,246,238,0.12)'}
            filter={dip || pay ? 'url(#glow)' : undefined}
            initial={scale ? { opacity: 0, scale: 0.5 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.025 * d + (y > 200 ? 1.4 : 0), type: 'spring', stiffness: 260, damping: 18 }} />
        )
      })}
      <Label x={x0 + 2 * (cell + gap) + cell / 2} y={y + cell + 24} size={13} color={ORANGE} anchor="middle" weight={700}>bills</Label>
      <Label x={x0 + (dipDays.length ? 4 : 0) * (cell + gap) + cell / 2} y={y + cell + 24} size={13} color={MINT} anchor="middle" weight={700}>pay arrives</Label>
      <Label x={x0 + 27 * (cell + gap) + cell} y={y + cell + 24} size={11} color={MUTED} anchor="end">4 weeks</Label>
    </g>
  )
  return (
    <Frame label={`Timing dips: ${p.neg_months} months went below zero, ${pct(p.timing_share)} of them with enough income`}>
      {strip(120, [3, 4], 'how your months go now')}
      <motion.text x={x0 + 3 * (cell + gap)} y={200} fontSize={15} fill={ROSE} fontWeight={800} initial={scale ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>below zero for two days, every month like this</motion.text>
      {strip(300, [], 'the same month, pay before bills')}
      <motion.text x={x0} y={380} fontSize={15} fill={MINT} fontWeight={800} initial={scale ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 2.4 }}>same money, no dip</motion.text>
      <Big x={500} y={478} size={24} anchor="middle">{p.neg_months} of {p.months} months dipped below zero</Big>
      <Label x={500} y={508} size={15} color={MUTED} anchor="middle">in {pct(p.timing_share)} of those months the money that came in still covered what went out</Label>
    </Frame>
  )
}
