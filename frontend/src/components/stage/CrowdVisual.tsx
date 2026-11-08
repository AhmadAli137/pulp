import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type { CrowdParams } from '../../services/api'
import { FOREST, Frame, GRAY, Label, ORANGE, pct, useCountUp, useMotionScale } from './shared'

const DOTS = 600

/* A field of dots for the whole bank. The archetype's share lights orange; one pulsing dot is you. */
export default function CrowdVisual({ p }: { p: CrowdParams }) {
  const scale = useMotionScale()
  const lit = Math.round(DOTS * p.archetype.share)
  const dots = useMemo(() => {
    let seed = 7
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    const cols = 40
    return Array.from({ length: DOTS }, (_, i) => {
      const c = i % cols, r = Math.floor(i / cols)
      return { x: 90 + c * 21 + (rnd() - 0.5) * 8, y: 70 + r * 22 + (rnd() - 0.5) * 8, order: rnd() }
    })
  }, [])
  const litIdx = useMemo(() => [...dots.keys()].sort((a, b) => dots[a].order - dots[b].order).slice(0, lit), [dots, lit])
  const litSet = new Set(litIdx)
  const you = litIdx[Math.floor(litIdx.length / 2)] ?? 0
  const count = useCountUp(p.archetype.size, 0, 1600)
  return (
    <Frame label={`${p.n_total} accounts; ${p.archetype.name} is ${pct(p.archetype.share)} of them`}>
      {dots.map((d, i) => {
        const on = litSet.has(i)
        return (
          <motion.circle key={i} cx={d.x} cy={d.y} r={i === you ? 9 : 5.5} fill={on ? ORANGE : '#D9DDCF'}
            className={i === you ? 'stage-you' : ''}
            initial={scale ? { opacity: 0, scale: 0 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 * d.order + (on ? 0.5 : 0), duration: 0.35 }} />
        )
      })}
      <g transform="translate(90, 440)">
        <Label x={0} y={0} size={13} color={GRAY}>{p.n_total.toLocaleString()} accounts at this bank · each dot is about {Math.round(p.n_total / DOTS)} of them</Label>
        <Label x={0} y={40} size={26} color={FOREST} weight={800}>{Math.round(count).toLocaleString()} are “{p.archetype.name}”</Label>
        <Label x={0} y={70} size={15} color={GRAY}>{pct(p.archetype.share)} of the bank · {Math.round(p.archetype.survive6_layoff_pct)}% of them would last six months on 55% income</Label>
        <Label x={0} y={100} size={15} color={ORANGE} weight={700}>the pulsing dot is you{p.you.runway_layoff != null ? ` · ${p.you.runway_layoff.toFixed(1)} months of runway` : p.you.survives6_layoff ? ' · you make it' : ''}</Label>
      </g>
    </Frame>
  )
}
