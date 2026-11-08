import { motion } from 'framer-motion'
import type { PodiumParams } from '../../services/api'
import { DANGER, EMERALD, FOREST, Frame, GRAY, Label, ORANGE, money, pct, useMotionScale } from './shared'

/* Three podium steps rise in: 2nd, 1st (tallest), 3rd. A faint bar behind shows staying the course. */
export default function PodiumVisual({ p }: { p: PodiumParams }) {
  const scale = useMotionScale()
  const order = [1, 0, 2].map((i) => p.top[i]).filter(Boolean)
  const heights = [200, 280, 150]
  const xs = [150, 410, 670]
  const w = 220
  const base = 440
  const leverLine = (e: PodiumParams['top'][number]) => {
    const parts: string[] = []
    if (e.levers.freed_up_per_month) parts.push(`free up ${money(e.levers.freed_up_per_month)}`)
    if (e.levers.extra_income_per_month) parts.push(`add ${money(e.levers.extra_income_per_month)}`)
    if (e.levers.goal_contribution_per_month) parts.push(`save ${money(e.levers.goal_contribution_per_month)}`)
    if (e.levers.emergency_floor) parts.push(`floor ${money(e.levers.emergency_floor)}`)
    return parts.length ? parts.join(' · ') + ' a month' : 'no change to spending'
  }
  return (
    <Frame label={`Podium: ${p.top[0]?.label ?? 'no plan'} first`}>
      {p.stay && (
        <g>
          <rect x={60} y={40} width={420} height={64} rx={12} fill="#F4F5ED" />
          <Label x={78} y={66} size={13} color={GRAY}>if nothing changes · {p.stay.label}</Label>
          <Label x={78} y={90} size={16} color={DANGER} weight={700}>{pct(p.stay.prob_shortfall)} chance of running dry · score {p.stay.score.toFixed(2)}</Label>
        </g>
      )}
      {order.map((e, i) => {
        const h = heights[i], x = xs[i]
        const first = e.rank === 1
        return (
          <g key={e.rank}>
            <motion.rect x={x} width={w} rx={14} fill={first ? ORANGE : '#D9E0CF'}
              initial={scale ? { y: base, height: 0 } : false} animate={{ y: base - h, height: h }} transition={{ delay: 0.3 * i + (first ? 0.5 : 0), duration: 0.9, ease: 'easeOut' }} />
            <motion.g initial={scale ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 0.3 * i + 1.1 }}>
              <Label x={x + w / 2} y={base - h + 36} size={28} color={first ? '#fff' : FOREST} anchor="middle" weight={800}>#{e.rank}</Label>
              <Label x={x + w / 2} y={base - h + 64} size={14} color={first ? '#fff' : FOREST} anchor="middle" weight={700}>{e.label.length > 30 ? e.label.slice(0, 29) + '…' : e.label}</Label>
              <Label x={x + w / 2} y={base - h + 88} size={13} color={first ? '#FFE9D6' : GRAY} anchor="middle">P(shortfall) {pct(e.prob_shortfall)} · score {e.score.toFixed(2)}</Label>
              {h > 170 && <Label x={x + w / 2} y={base - h + 110} size={11} color={first ? '#FFE9D6' : GRAY} anchor="middle">{leverLine(e).length > 40 ? leverLine(e).slice(0, 39) + '…' : leverLine(e)}</Label>}
              {e.flags.length > 0 && (
                <g transform={`translate(${x + w / 2 - 50}, ${base - h - 30})`}>
                  <rect width={100} height={24} rx={12} fill={e.flags[0].severity === 'high' ? DANGER : '#FFE1C7'} />
                  <Label x={50} y={16} size={11} color={e.flags[0].severity === 'high' ? '#fff' : '#C75610'} anchor="middle" weight={700}>{e.flags[0].severity} flag</Label>
                </g>
              )}
              <Label x={x + w / 2} y={base - h - (e.flags.length ? 44 : 14)} size={12} color={e.source === 'strategist' ? ORANGE : GRAY} anchor="middle" weight={600}>{e.source === 'strategist' ? 'Strategist lever' : 'from the grid'}</Label>
            </motion.g>
          </g>
        )
      })}
      <line x1={60} x2={940} y1={base} y2={base} stroke={FOREST} strokeWidth={4} strokeLinecap="round" />
      <Label x={500} y={490} size={15} color={EMERALD} anchor="middle" weight={700}>{p.top[0]?.why ? (p.top[0].why.length > 110 ? p.top[0].why.slice(0, 109) + '…' : p.top[0].why) : ''}</Label>
      <Label x={500} y={520} size={12} color={GRAY} anchor="middle">score = {p.objective} · safety {pct(p.weights.resilience)} / goal {pct(p.weights.goal)}</Label>
    </Frame>
  )
}
