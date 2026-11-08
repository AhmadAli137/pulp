import { useEffect, useState } from 'react'
import type { CupParams } from '../../services/api'
import { Cup, FOREST, Frame, GRAY, Label, clamp, money } from './shared'

/* One big cup. Twelve months of spending would fill it to the rim; tick marks show how many months are in it. */
export default function CupVisual({ p }: { p: CupParams }) {
  const [go, setGo] = useState(false)
  useEffect(() => { const t = setTimeout(() => setGo(true), 60); return () => clearTimeout(t) }, [p.buffer])
  const level = go ? clamp(p.months_of_spending / 12, 0.03, 1) : 0
  const x = 350, y = 70, w = 300, h = 380
  return (
    <Frame label={`${p.label}: ${money(p.buffer)}, ${p.months_of_spending.toFixed(1)} months of spending`}>
      {[3, 6, 9, 12].map((m) => {
        const yy = y + h - (m / 12) * (h - 12)
        return (
          <g key={m}>
            <line x1={x + w + 18} x2={x + w + 40} y1={yy} y2={yy} stroke={m === 6 ? FOREST : '#c9cfc0'} strokeWidth={m === 6 ? 3 : 2} />
            <Label x={x + w + 50} y={yy + 6} size={14} color={m === 6 ? FOREST : GRAY} weight={m === 6 ? 700 : 500}>{m === 6 ? '6 months (the twist)' : `${m} mo`}</Label>
          </g>
        )
      })}
      <Cup x={x} y={y} w={w} h={h} level={level} label={money(p.buffer)} sub={p.label} />
      <Label x={500} y={524} size={16} color={GRAY} anchor="middle">{p.months_of_spending.toFixed(1)} months of {money(p.outflow)} spending</Label>
    </Frame>
  )
}
