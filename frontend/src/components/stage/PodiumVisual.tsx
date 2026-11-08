import { motion } from 'framer-motion'
import type { PodiumParams } from '../../services/api'
import { Big, Frame, INK, Label, MINT, MUTED, ORANGE, ROSE, money, pct, useMotionScale } from './shared'

/* Three podium steps rise in: 2nd, 1st (tallest), 3rd. Each step carries the plan as a decision a person can make. */
export default function PodiumVisual({ p }: { p: PodiumParams }) {
  const scale = useMotionScale()
  const order = [1, 0, 2].map((i) => p.top[i]).filter(Boolean)
  const heights = [210, 290, 160]
  const xs = [130, 395, 660]
  const w = 240
  const base = 430
  const leverLine = (e: PodiumParams['top'][number]) => {
    const parts: string[] = []
    if (e.levers.freed_up_per_month) parts.push(`free up ${money(e.levers.freed_up_per_month)}`)
    if (e.levers.extra_income_per_month) parts.push(`add ${money(e.levers.extra_income_per_month)}`)
    if (e.levers.goal_contribution_per_month) parts.push(`save ${money(e.levers.goal_contribution_per_month)}`)
    if (e.levers.emergency_floor) parts.push(`floor ${money(e.levers.emergency_floor)}`)
    return parts.length ? parts.join(' · ') + ' a month' : 'no change to spending'
  }
  const wrap = (s: string, n: number): string[] => {
    const words = s.split(' '); const lines: string[] = []; let cur = ''
    for (const wd of words) { if ((cur + ' ' + wd).trim().length > n) { if (cur) lines.push(cur); cur = wd } else cur = (cur + ' ' + wd).trim() }
    if (cur) lines.push(cur)
    return lines.slice(0, 2)
  }
  const first = p.top[0]
  return (
    <Frame label={`Podium: ${first ? (first.action ?? first.label) : 'no plan'} first`}>
      {p.stay && (
        <g>
          <rect x={60} y={32} width={440} height={66} rx={14} fill="rgba(251,113,133,0.12)" stroke="rgba(251,113,133,0.4)" />
          <Label x={78} y={58} size={13} color={MUTED}>if nothing changes</Label>
          <Big x={78} y={86} size={20} color={ROSE}>{pct(p.stay.prob_shortfall)} chance of running dry</Big>
        </g>
      )}
      {order.map((e, i) => {
        const h = heights[i], x = xs[i]
        const top = e.rank === 1
        const title = e.action ?? e.label
        const lines = wrap(title, 26)
        const sub = e.means ?? leverLine(e)
        const ink = top ? '#1b1f1c' : INK
        const soft = top ? '#5a3a24' : MUTED
        return (
          <g key={e.rank}>
            <motion.rect x={x} width={w} rx={18} fill={top ? 'url(#juice-v)' : '#EEF2EA'} stroke={top ? 'none' : '#D9E0CF'} strokeWidth={1.5} filter={top ? 'url(#glow)' : undefined}
              initial={scale ? { y: base, height: 0 } : false} animate={{ y: base - h, height: h }} transition={{ delay: 0.15 * i + (top ? 0.2 : 0), duration: 0.5, ease: 'easeOut' }} />
            <motion.g initial={scale ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 0.15 * i + 0.5 }}>
              <Big x={x + w / 2} y={base - h + 40} size={30} color={ink} anchor="middle">#{e.rank}</Big>
              {lines.map((ln, li) => <Label key={li} x={x + w / 2} y={base - h + 70 + li * 20} size={15} color={ink} anchor="middle" weight={800} family="Manrope, sans-serif">{ln}</Label>)}
              <Label x={x + w / 2} y={base - h + 70 + lines.length * 20 + 6} size={13} color={soft} anchor="middle" weight={600}>{pct(e.prob_shortfall)} chance of running dry</Label>
              {h > 180 && wrap(sub, 32).map((ln, li) => <Label key={li} x={x + w / 2} y={base - h + 70 + lines.length * 20 + 28 + li * 16} size={11.5} color={soft} anchor="middle">{ln}</Label>)}
              {e.action && <Label x={x + w / 2} y={base - 14} size={10.5} color={soft} anchor="middle">{e.label.length > 34 ? e.label.slice(0, 33) + '…' : e.label}</Label>}
              {e.flags.length > 0 && (
                <g transform={`translate(${x + w / 2 - 56}, ${base - h - 32})`}>
                  <rect width={112} height={26} rx={13} fill={e.flags[0].severity === 'high' ? ROSE : '#FFE1C7'} stroke={e.flags[0].severity === 'high' ? 'none' : ORANGE} />
                  <Label x={56} y={17} size={11} color={e.flags[0].severity === 'high' ? '#1b1f1c' : '#FFD7B5'} anchor="middle" weight={800}>{e.flags[0].severity} flag</Label>
                </g>
              )}
              <Label x={x + w / 2} y={base - h - (e.flags.length ? 46 : 14)} size={12} color={e.source === 'strategist' ? ORANGE : MUTED} anchor="middle" weight={700}>{e.source === 'strategist' ? 'the Strategist’s idea' : 'from the engine'}</Label>
            </motion.g>
          </g>
        )
      })}
      <line x1={60} x2={940} y1={base} y2={base} stroke={INK} strokeWidth={5} strokeLinecap="round" opacity={0.9} />
      <Label x={500} y={486} size={15} color={MINT} anchor="middle" weight={700}>{first?.means ?? (first?.why ? (first.why.length > 110 ? first.why.slice(0, 109) + '…' : first.why) : '')}</Label>
      <Label x={500} y={516} size={12} color={MUTED} anchor="middle">scored on staying solvent, reaching your goal and how much it disrupts your life · weights {pct(p.weights.resilience)} / {pct(p.weights.goal)}</Label>
    </Frame>
  )
}
