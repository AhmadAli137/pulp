import { motion } from 'framer-motion'
import type { SwarmParams } from '../../services/api'
import { DANGER, FOREST, Frame, GRAY, Label, ORANGE, money, pct, useCountUp, useMotionScale } from './shared'

/* Every scenario the engine scored, drawn as a thin path of the cushion over the horizon. Strategist levers are orange,
   grid levers forest; the best path thickens and glows. */
export default function SwarmVisual({ p }: { p: SwarmParams }) {
  const scale = useMotionScale()
  const cands = p.candidates
  const all = cands.flatMap((c) => c.buffer_path)
  const hi = Math.max(1, ...all), lo = Math.min(0, ...all)
  const x0 = 90, x1 = 920, yTop = 60, yBot = 400
  const X = (i: number, n: number) => x0 + (i / Math.max(1, n - 1)) * (x1 - x0)
  const Y = (v: number) => yBot - ((v - lo) / (hi - lo)) * (yBot - yTop)
  const path = (a: number[]) => a.map((v, i) => `${i === 0 ? 'M' : 'L'} ${X(i, a.length)} ${Y(v)}`).join(' ')
  const count = useCountUp(cands.length, 0, 2200)
  const best = cands.find((c) => c.best)
  return (
    <Frame label={`${cands.length} scenarios scored over ${p.horizon_months} months`}>
      <line x1={x0} x2={x1} y1={Y(0)} y2={Y(0)} stroke="#c9cfc0" strokeWidth={2} strokeDasharray="6 6" />
      <Label x={x1 + 6} y={Y(0) + 5} size={12} color={GRAY}>$0</Label>
      {cands.map((c, i) => (
        <motion.path key={i} d={path(c.buffer_path)} fill="none" stroke={c.best ? ORANGE : c.source === 'strategist' ? ORANGE : FOREST}
          strokeWidth={c.best ? 7 : 2.2} strokeOpacity={c.best ? 1 : c.source === 'strategist' ? 0.7 : 0.28} strokeLinecap="round"
          className={c.best ? 'stage-glow-path' : ''}
          initial={scale ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 1.6, delay: (c.best ? 1.2 : 0) + (i % 9) * 0.12, ease: 'easeOut' }} />
      ))}
      {best && <Label x={X(best.buffer_path.length - 1, best.buffer_path.length) - 6} y={Y(best.buffer_path[best.buffer_path.length - 1]) - 14} size={14} color={ORANGE} anchor="end" weight={700}>{best.label}</Label>}
      <Label x={x0} y={430} size={13} color={GRAY}>now</Label>
      <Label x={x1} y={430} size={13} color={GRAY} anchor="end">{p.horizon_months} months</Label>
      <g transform="translate(90, 470)">
        <Label x={0} y={0} size={34} color={FOREST} weight={800}>{Math.round(count)} scenarios scored</Label>
        <Label x={0} y={30} size={13} color={GRAY}>{p.grid_size} from the lever grid · {cands.filter((c) => c.source === 'strategist').length} proposed by the Strategist · flags from the Challenger: {cands.reduce((a, c) => a + c.flags, 0)}</Label>
        <Label x={0} y={56} size={12} color={GRAY}>score = {p.objective} · safety {pct(p.weights.resilience)} / goal {pct(p.weights.goal)}</Label>
      </g>
      {best && <g transform="translate(640, 470)">
        <Label x={0} y={0} size={13} color={GRAY}>best so far</Label>
        <Label x={0} y={28} size={18} color={ORANGE} weight={800}>{pct(best.prob_shortfall)} chance of running dry</Label>
        <Label x={0} y={52} size={12} color={best.flags ? DANGER : GRAY}>{best.flags ? `${best.flags} Challenger flag` : 'no Challenger flag'} · score {best.score.toFixed(2)}</Label>
        <Label x={0} y={74} size={12} color={GRAY}>lowest point {money(Math.min(...best.buffer_path))}</Label>
      </g>}
    </Frame>
  )
}
