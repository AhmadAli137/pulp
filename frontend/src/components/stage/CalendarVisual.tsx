import { motion } from 'framer-motion'
import type { CalendarParams } from '../../services/api'
import { DANGER, EMERALD, FOREST, Frame, GRAY, Label, ORANGE, pct, useMotionScale } from './shared'

/* Two four-week strips. Top: bills land on day 3, pay arrives day 5, the balance dips below zero in between.
   Bottom: pay first, no dip. The habit is timing, not shortage. */
export default function CalendarVisual({ p }: { p: CalendarParams }) {
  const scale = useMotionScale()
  const x0 = 90, cell = 29, gap = 3
  const strip = (y: number, dipDays: number[], title: string) => (
    <g>
      <Label x={x0} y={y - 16} size={15} color={FOREST} weight={700}>{title}</Label>
      {Array.from({ length: 28 }, (_, d) => {
        const day = d + 1
        const dip = dipDays.includes(day)
        return (
          <motion.rect key={d} x={x0 + d * (cell + gap)} y={y} width={cell} height={cell} rx={6}
            fill={dip ? DANGER : day === 5 || (dipDays.length === 0 && day === 1) ? EMERALD : '#EEF1E8'} opacity={dip ? 0.85 : 1}
            initial={scale ? { opacity: 0, scale: 0.6 } : false} animate={{ opacity: dip ? 0.85 : 1, scale: 1 }} transition={{ delay: 0.02 * d + (y > 200 ? 1.4 : 0), duration: 0.3 }} />
        )
      })}
      <Label x={x0 + 2 * (cell + gap) + cell / 2} y={y + cell + 22} size={12} color={ORANGE} anchor="middle" weight={600}>bills</Label>
      <Label x={x0 + (dipDays.length ? 4 : 0) * (cell + gap) + cell / 2} y={y + cell + 22} size={12} color={EMERALD} anchor="middle" weight={600}>pay arrives</Label>
      <Label x={x0 + 27 * (cell + gap) + cell} y={y + cell + 22} size={11} color={GRAY} anchor="end">4 weeks</Label>
    </g>
  )
  return (
    <Frame label={`Timing dips: ${p.neg_months} months went below zero, ${pct(p.timing_share)} of them with enough income`}>
      {strip(120, [3, 4], 'how your months go now')}
      <motion.text x={x0 + 3 * (cell + gap)} y={198} fontSize={14} fill={DANGER} fontWeight={700} initial={scale ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>below zero for two days, every month like this</motion.text>
      {strip(300, [], 'the same month, pay before bills')}
      <motion.text x={x0} y={378} fontSize={14} fill={EMERALD} fontWeight={700} initial={scale ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 2.4 }}>same money, no dip</motion.text>
      <Label x={500} y={470} size={18} color={FOREST} anchor="middle" weight={700}>{p.neg_months} of {p.months} months dipped below zero</Label>
      <Label x={500} y={500} size={15} color={GRAY} anchor="middle">in {pct(p.timing_share)} of those months the money that came in still covered what went out</Label>
    </Frame>
  )
}
