import { motion } from 'framer-motion'
import type { TwoFuturesParams } from '../../services/api'
import { Big, Frame, INK, Label, LINE, MINT, MUTED, ORANGE, ROSE, clamp, money, pct, useCountUp, useMotionScale } from './shared'

/* A road that forks: the upper path is the plan, the lower is staying the course. Heights follow the buffer paths. */
export default function ForkVisual({ p }: { p: TwoFuturesParams }) {
  const scale = useMotionScale()
  const stay = p.stay.buffer_path, plan = p.plan.buffer_path
  const n = Math.max(stay.length, plan.length, 2)
  const maxV = Math.max(...stay, ...plan, p.goal.target_amount, 1)
  const minV = Math.min(0, ...stay, ...plan)
  const x0 = 110, x1 = 740, yTop = 70, yBot = 420
  const X = (i: number) => x0 + (i / (n - 1)) * (x1 - x0)
  const Y = (v: number) => yBot - ((v - minV) / (maxV - minV)) * (yBot - yTop)
  const path = (arr: number[]) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${X(i)} ${Y(v)}`).join(' ')
  const before = useCountUp(p.stay.prob_shortfall, 0, 1400)
  const after = useCountUp(p.plan.prob_shortfall, p.stay.prob_shortfall, 1800)
  const same = p.stay.label === p.plan.label
  const planName = p.plan.action ?? p.plan.label
  const levers = Object.entries(p.plan.levers).filter(([, v]) => v > 0)
  const leverName: Record<string, string> = { freed_up_per_month: 'free up', goal_contribution_per_month: 'save', emergency_floor: 'floor', extra_income_per_month: 'add income' }
  const road = { strokeWidth: 14, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <Frame label={`Two futures: staying the course ${pct(p.stay.prob_shortfall)} chance of running dry, the plan ${pct(p.plan.prob_shortfall)}`}>
      <line x1={x0} x2={x1} y1={Y(0)} y2={Y(0)} stroke={LINE} strokeWidth={2} strokeDasharray="6 6" />
      <Label x={x1 + 8} y={Y(0) + 5} size={12} color={MUTED}>$0</Label>
      {p.goal.target_amount > 0 && (
        <g>
          <line x1={x0} x2={x1} y1={Y(p.goal.target_amount)} y2={Y(p.goal.target_amount)} stroke={MINT} strokeWidth={2} strokeDasharray="10 8" opacity={0.7} />
          <Label x={x0} y={Y(p.goal.target_amount) - 10} size={13} color={MINT} weight={700}>{p.goal.label}: {money(p.goal.target_amount)} by month {p.goal.target_months}</Label>
        </g>
      )}
      {/* the shared road before the fork, then the two futures */}
      <motion.path d={path(stay)} fill="none" stroke={ROSE} {...road} opacity={0.9} filter="url(#glow-soft)"
        initial={scale ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 2.2, ease: 'easeInOut' }} />
      {!same && <motion.path d={path(plan)} fill="none" stroke={MINT} {...road} filter="url(#glow)"
        initial={scale ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 2.2, ease: 'easeInOut', delay: 0.4 }} />}
      {!same && <motion.circle r={9} fill={INK} initial={scale ? { opacity: 0 } : false} animate={{ opacity: [0, 1, 1, 0], cx: plan.map((_, i) => X(i)), cy: plan.map((v) => Y(v)) }} transition={{ duration: 2.2, delay: 0.4, ease: 'easeInOut' }} />}
      <circle cx={X(0)} cy={Y(stay[0] ?? 0)} r={11} fill={ORANGE} stroke={INK} strokeWidth={3} filter="url(#glow)" />
      <Label x={X(0) - 16} y={Y(stay[0] ?? 0) + 5} size={14} color={INK} anchor="end" weight={700}>today</Label>
      <Label x={x1 + 14} y={clamp(Y(stay[stay.length - 1] ?? 0) + 5, yTop, yBot + 30)} size={14} color={ROSE} weight={800}>{same ? 'stay the course' : 'if nothing changes'}</Label>
      {!same && <Label x={x1 + 14} y={clamp(Y(plan[plan.length - 1] ?? 0) + 5, yTop, yBot)} size={14} color={MINT} weight={800}>{planName.length > 28 ? planName.slice(0, 27) + '…' : planName}</Label>}
      {p.plan.months_to_goal != null && p.goal.target_amount > 0 && <circle cx={X(Math.min(n - 1, Math.round(p.plan.months_to_goal)))} cy={Y(p.goal.target_amount)} r={10} fill={MINT} stroke={INK} strokeWidth={3} filter="url(#glow)" />}
      <g transform="translate(110, 470)">
        <Label x={0} y={0} size={14} color={MUTED}>chance of running dry under this shock</Label>
        <Big x={0} y={44} size={36} color={ROSE}>{pct(before)}</Big>
        {!same && <>
          <Label x={120} y={44} size={26} color={MUTED}>→</Label>
          <Big x={160} y={44} size={36} color={MINT}>{pct(after)}</Big>
        </>}
      </g>
      {!same && (
        <g transform="translate(480, 470)">
          <Label x={0} y={0} size={14} color={MUTED}>{p.plan.means ? 'what it does for you' : 'what the plan asks of you, each month'}</Label>
          {p.plan.means
            ? <Label x={0} y={30} size={15} color={INK} weight={600}>{p.plan.means.length > 62 ? p.plan.means.slice(0, 61) + '…' : p.plan.means}</Label>
            : levers.map(([k, v], i) => (
              <g key={k} transform={`translate(${i * 124}, 16)`}>
                <rect x={0} y={0} width={116} height={34} rx={17} fill="rgba(167,243,208,0.16)" stroke={MINT} strokeWidth={1.5} />
                <Label x={58} y={22} size={12} color={MINT} anchor="middle" weight={700}>{leverName[k]} {money(v)}</Label>
              </g>
            ))}
        </g>
      )}
    </Frame>
  )
}
