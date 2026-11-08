import { motion } from 'framer-motion'
import type { RibbonParams } from '../../services/api'
import { Big, DollarAxis, Frame, INK, Label, MINT, MUTED, MonthAxis, ORANGE, ROSE, money, useMotionScale } from './shared'

/* Two ribbons across the months: income and spending. When spending drifts up faster than income, they converge. */
export default function RibbonVisual({ p }: { p: RibbonParams }) {
  const scale = useMotionScale()
  const n = Math.max(6, Math.min(36, p.months))
  const x0 = 110, x1 = 880, yTop = 70, yBot = 400
  const inc = Array.from({ length: n }, (_, i) => p.inflow * (1 + p.income_drift_pm * (i - n + 1)))
  const spd = Array.from({ length: n }, (_, i) => p.outflow * (1 + p.spending_drift_pm * (i - n + 1)))
  const all = [...inc, ...spd]
  const lo = Math.min(...all) * 0.9, hi = Math.max(...all) * 1.08
  const X = (i: number) => x0 + (i / (n - 1)) * (x1 - x0)
  const Y = (v: number) => yBot - ((v - lo) / Math.max(1, hi - lo)) * (yBot - yTop)
  const path = (a: number[]) => a.map((v, i) => `${i === 0 ? 'M' : 'L'} ${X(i)} ${Y(v)}`).join(' ')
  const gapNow = inc[n - 1] - spd[n - 1], gapThen = inc[0] - spd[0]
  const creep = p.spending_drift_pm - p.income_drift_pm
  return (
    <Frame label={`Spending drifting ${(p.spending_drift_pm * 100).toFixed(1)}% a month, income ${(p.income_drift_pm * 100).toFixed(1)}%`}>
      <DollarAxis x={x0} x2={x1} lo={lo} hi={hi} Y={Y} title="per month" />
      <motion.path d={path(inc)} fill="none" stroke={MINT} strokeWidth={18} strokeLinecap="round" opacity={0.9} filter="url(#glow-soft)" initial={scale ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 1.1 }} />
      <motion.path d={path(spd)} fill="none" stroke="url(#juice)" strokeWidth={18} strokeLinecap="round" filter="url(#glow-soft)" initial={scale ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.3 }} />
      <Label x={x0} y={Y(inc[0]) - 20} size={15} color={MINT} weight={800}>income</Label>
      <Label x={x0} y={Y(spd[0]) + 36} size={15} color={ORANGE} weight={800}>spending</Label>
      <MonthAxis x0={x0} x1={x1} y={yBot + 14} months={n - 1} start={1} title="months back" />
      <Label x={x1 + 6} y={Y(inc[n - 1]) + 5} size={14} color={MINT} weight={700}>{money(inc[n - 1])}</Label>
      <Label x={x1 + 6} y={Y(spd[n - 1]) + 5} size={14} color={ORANGE} weight={700}>{money(spd[n - 1])}</Label>
      <Big x={500} y={506} size={22} color={creep > 0 ? ROSE : INK} anchor="middle">
        {creep > 0 ? `the gap between them went from ${money(gapThen)} to ${money(gapNow)} a month` : `the gap is holding at about ${money(gapNow)} a month`}
      </Big>
      <Label x={500} y={536} size={14} color={MUTED} anchor="middle">spending moves {(p.spending_drift_pm * 100).toFixed(1)}% of a typical month each month; income {(p.income_drift_pm * 100).toFixed(1)}%</Label>
    </Frame>
  )
}
