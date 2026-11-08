import { motion } from 'framer-motion'
import type { SwarmParams } from '../../services/api'
import { Big, DollarAxis, Frame, INK, Label, MINT, MUTED, MonthAxis, ORANGE, ROSE, money, pct, useCountUp, useMotionScale } from './shared'

/* Every scenario the engine scored, drawn as a thin path of the cushion over the horizon. Strategist ideas are
   orange, grid levers cream; the best path thickens and glows and gets its name. */
export default function SwarmVisual({ p }: { p: SwarmParams }) {
  const scale = useMotionScale()
  const cands = p.candidates
  const all = cands.flatMap((c) => c.buffer_path)
  const hi = Math.max(1, ...all), lo = Math.min(0, ...all)
  const x0 = 120, x1 = 900, yTop = 60, yBot = 380
  const X = (i: number, n: number) => x0 + (i / Math.max(1, n - 1)) * (x1 - x0)
  const Y = (v: number) => yBot - ((v - lo) / (hi - lo)) * (yBot - yTop)
  const path = (a: number[]) => a.map((v, i) => `${i === 0 ? 'M' : 'L'} ${X(i, a.length)} ${Y(v)}`).join(' ')
  const count = useCountUp(cands.length, 0, 2200)
  const best = cands.find((c) => c.best)
  const bestName = best ? (best.action ?? best.label) : ''
  return (
    <Frame label={`${cands.length} scenarios scored over ${p.horizon_months} months`}>
      <DollarAxis x={x0} x2={x1} lo={lo} hi={hi} Y={Y} title="cash" />
      <MonthAxis x0={x0} x1={x1} y={yBot + 12} months={p.horizon_months} />
      <g transform="translate(560, 26)" aria-hidden="true">
        <line x1={0} x2={26} y1={0} y2={0} stroke={INK} strokeOpacity={0.4} strokeWidth={3} /><Label x={32} y={5} size={14} color={MUTED}>engine grid</Label>
        <line x1={130} x2={156} y1={0} y2={0} stroke={ORANGE} strokeOpacity={0.8} strokeWidth={3} /><Label x={162} y={5} size={14} color={MUTED}>Strategist</Label>
        <line x1={250} x2={276} y1={0} y2={0} stroke="url(#juice)" strokeWidth={8} strokeLinecap="round" /><Label x={282} y={5} size={14} color={MUTED}>best</Label>
      </g>
      {cands.map((c, i) => (
        <motion.path key={i} d={path(c.buffer_path)} fill="none" stroke={c.best ? 'url(#juice)' : c.source === 'strategist' ? ORANGE : INK}
          strokeWidth={c.best ? 9 : 2.4} strokeOpacity={c.best ? 1 : c.source === 'strategist' ? 0.75 : 0.35} strokeLinecap="round"
          className={c.best ? 'stage-glow-path' : ''}
          initial={scale ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: (c.best ? 0.6 : 0) + (i % 9) * 0.05, ease: 'easeOut' }} />
      ))}
      {best && <motion.circle r={11} fill={ORANGE} stroke={INK} strokeWidth={3} filter="url(#glow)" cx={X(best.buffer_path.length - 1, best.buffer_path.length)} cy={Y(best.buffer_path[best.buffer_path.length - 1])}
        initial={scale ? { scale: 0, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.1, duration: 0.5, ease: 'easeOut' }} />}
      {best && <Label x={X(best.buffer_path.length - 1, best.buffer_path.length) - 18} y={Y(best.buffer_path[best.buffer_path.length - 1]) - 18} size={15} color={ORANGE} anchor="end" weight={800}>{bestName.length > 40 ? bestName.slice(0, 39) + '…' : bestName}</Label>}
      <g transform="translate(120, 478)">
        <Big x={0} y={0} size={38}>{Math.round(count)} ways through this</Big>
        <Label x={0} y={30} size={13} color={MUTED}>{p.grid_size} from the engine’s grid · {cands.filter((c) => c.source === 'strategist').length} the Strategist thought up</Label>
        <Label x={0} y={52} size={13} color={MUTED}>{cands.reduce((a, c) => a + c.flags, 0)} flagged by the Challenger · scored on solvency, your goal, disruption</Label>
      </g>
      {best && <g transform="translate(660, 478)">
        <Label x={0} y={0} size={13} color={MUTED}>best so far</Label>
        <Big x={0} y={32} size={22} color={ORANGE}>{pct(best.prob_shortfall)} chance of running dry</Big>
        <Label x={0} y={56} size={12} color={best.flags ? ROSE : MINT}>{best.flags ? `${best.flags} Challenger flag` : 'no Challenger flag'} · score {best.score.toFixed(2)}</Label>
        <Label x={0} y={78} size={12} color={MUTED}>lowest point {money(Math.min(...best.buffer_path))} · weights {pct(p.weights.resilience)} / {pct(p.weights.goal)}</Label>
      </g>}
    </Frame>
  )
}
