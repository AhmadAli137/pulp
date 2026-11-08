import { motion } from 'framer-motion'
import type { TwoFuturesParams } from '../../services/api'
import { DANGER, EMERALD, FOREST, Frame, GRAY, Label, ORANGE, clamp, money, pct, useCountUp, useMotionScale } from './shared'

/* A road that forks: the upper path is the plan, the lower is staying the course. Heights follow the buffer paths. */
export default function ForkVisual({ p }: { p: TwoFuturesParams }) {
  const scale = useMotionScale()
  const stay = p.stay.buffer_path, plan = p.plan.buffer_path
  const n = Math.max(stay.length, plan.length, 2)
  const maxV = Math.max(...stay, ...plan, p.goal.target_amount, 1)
  const minV = Math.min(0, ...stay, ...plan)
  const x0 = 110, x1 = 760, yTop = 70, yBot = 430
  const X = (i: number) => x0 + (i / (n - 1)) * (x1 - x0)
  const Y = (v: number) => yBot - ((v - minV) / (maxV - minV)) * (yBot - yTop)
  const path = (arr: number[]) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${X(i)} ${Y(v)}`).join(' ')
  const before = useCountUp(p.stay.prob_shortfall, 0, 1400)
  const after = useCountUp(p.plan.prob_shortfall, p.stay.prob_shortfall, 1800)
  const same = p.stay.label === p.plan.label
  const levers = Object.entries(p.plan.levers).filter(([, v]) => v > 0)
  const leverName: Record<string, string> = { freed_up_per_month: 'free up', goal_contribution_per_month: 'save', emergency_floor: 'floor', extra_income_per_month: 'add income' }
  return (
    <Frame label={`Two futures: staying the course ${pct(p.stay.prob_shortfall)} chance of running dry, the plan ${pct(p.plan.prob_shortfall)}`}>
      <line x1={x0} x2={x1} y1={Y(0)} y2={Y(0)} stroke="#c9cfc0" strokeWidth={2} strokeDasharray="6 6" />
      <Label x={x1 + 8} y={Y(0) + 5} size={12} color={GRAY}>$0</Label>
      {p.goal.target_amount > 0 && (
        <g>
          <line x1={x0} x2={x1} y1={Y(p.goal.target_amount)} y2={Y(p.goal.target_amount)} stroke={EMERALD} strokeWidth={2} strokeDasharray="10 8" />
          <Label x={x0} y={Y(p.goal.target_amount) - 10} size={13} color={EMERALD} weight={600}>{p.goal.label}: {money(p.goal.target_amount)} by month {p.goal.target_months}</Label>
        </g>
      )}
      <motion.path d={path(stay)} fill="none" stroke={DANGER} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" opacity={0.85}
        initial={scale ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 2.2, ease: 'easeInOut' }} />
      {!same && <motion.path d={path(plan)} fill="none" stroke={EMERALD} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round"
        initial={scale ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 2.2, ease: 'easeInOut', delay: 0.4 }} />}
      <circle cx={X(0)} cy={Y(stay[0] ?? 0)} r={10} fill={ORANGE} stroke="#fff" strokeWidth={3} />
      <Label x={X(0) - 14} y={Y(stay[0] ?? 0) + 5} size={13} color={FOREST} anchor="end" weight={600}>today</Label>
      <Label x={x1 + 14} y={clamp(Y(stay[stay.length - 1] ?? 0) + 5, yTop, yBot + 30)} size={14} color={DANGER} weight={700}>{same ? 'stay the course' : 'if nothing changes'}</Label>
      {!same && <Label x={x1 + 14} y={clamp(Y(plan[plan.length - 1] ?? 0) + 5, yTop, yBot)} size={14} color={EMERALD} weight={700}>{p.plan.label.length > 26 ? p.plan.label.slice(0, 25) + '…' : p.plan.label}</Label>}
      {p.plan.months_to_goal != null && p.goal.target_amount > 0 && <circle cx={X(Math.min(n - 1, Math.round(p.plan.months_to_goal)))} cy={Y(p.goal.target_amount)} r={9} fill={EMERALD} stroke="#fff" strokeWidth={3} />}
      <g transform="translate(110, 470)">
        <Label x={0} y={0} size={14} color={GRAY}>chance of running dry under this shock</Label>
        <Label x={0} y={38} size={30} color={DANGER} weight={800}>{pct(before)}</Label>
        {!same && <>
          <Label x={130} y={38} size={22} color={GRAY}>→</Label>
          <Label x={170} y={38} size={30} color={EMERALD} weight={800}>{pct(after)}</Label>
        </>}
      </g>
      {!same && levers.length > 0 && (
        <g transform="translate(520, 470)">
          <Label x={0} y={0} size={14} color={GRAY}>what the plan asks of you, each month</Label>
          {levers.map(([k, v], i) => (
            <g key={k} transform={`translate(${i * 120}, 16)`}>
              <rect x={0} y={0} width={112} height={32} rx={16} fill="#EAF3E6" />
              <Label x={56} y={21} size={12} color={FOREST} anchor="middle" weight={600}>{leverName[k]} {money(v)}</Label>
            </g>
          ))}
        </g>
      )}
    </Frame>
  )
}
