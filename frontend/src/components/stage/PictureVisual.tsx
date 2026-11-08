import { useEffect, useState } from 'react'
import type { PictureParams } from '../../services/api'
import { Cup, FOREST, Frame, GRAY, Label, Stream, clamp, money } from './shared'

/* The living picture: an inflow river feeding the cup, an outflow river leaving it. Stream widths follow the amounts;
   the cup level is the buffer against twelve months of spending. Shown whenever nothing else is on stage. */
export default function PictureVisual({ p }: { p: PictureParams }) {
  const [go, setGo] = useState(false)
  useEffect(() => { const t = setTimeout(() => setGo(true), 60); return () => clearTimeout(t) }, [p.buffer, p.inflow, p.outflow])
  const max = Math.max(p.inflow, p.outflow, 1)
  const wIn = clamp(10 + 44 * (p.inflow / max), 10, 54)
  const wOut = clamp(10 + 44 * (p.outflow / max), 10, 54)
  const level = go ? clamp(p.months_of_spending / 12, 0.03, 1) : 0
  const surplus = p.inflow - p.outflow
  return (
    <Frame label={`Your money: ${money(p.inflow)} in, ${money(p.outflow)} out, ${money(p.buffer)} in the cup`}>
      <Stream d="M 40 150 C 200 150, 260 240, 390 260" width={wIn} speed={0.8 + p.inflow / max} />
      <Label x={48} y={118} size={17} color={FOREST} weight={700}>what comes in</Label>
      <Label x={48} y={142} size={15} color={GRAY}>{money(p.inflow)} a month</Label>
      <Cup x={390} y={130} w={220} h={280} level={level} label={money(p.buffer)} sub={`${p.months_of_spending.toFixed(1)} months of spending in the cup`} />
      <Stream d="M 610 300 C 740 320, 820 240, 960 170" width={wOut} color="#EA6510" speed={0.8 + p.outflow / max} opacity={0.75} />
      <Label x={952} y={126} size={17} color={FOREST} weight={700} anchor="end">what goes out</Label>
      <Label x={952} y={150} size={15} color={GRAY} anchor="end">{money(p.outflow)} a month</Label>
      <Label x={500} y={498} size={18} color={surplus >= 0 ? '#2F7A5B' : '#C2410C'} anchor="middle" weight={700}>
        {surplus >= 0 ? `${money(surplus)} left in a typical month` : `${money(-surplus)} short in a typical month`}
      </Label>
      <Label x={500} y={526} size={14} color={GRAY} anchor="middle">runway with no shock: {p.runway_label}</Label>
    </Frame>
  )
}
