import { useEffect, useState } from 'react'
import type { PictureParams } from '../../services/api'
import { Big, Cup, Frame, INK, Label, MINT, MUTED, ROSE, Stream, clamp, money } from './shared'

/* The living picture: an inflow river feeding the cup, an outflow river leaving it. Stream widths follow the amounts;
   the cup level is the buffer against twelve months of spending. Shown whenever nothing else is on stage. */
export default function PictureVisual({ p }: { p: PictureParams }) {
  const [go, setGo] = useState(false)
  useEffect(() => { const t = setTimeout(() => setGo(true), 60); return () => clearTimeout(t) }, [p.buffer, p.inflow, p.outflow])
  const max = Math.max(p.inflow, p.outflow, 1)
  const wIn = clamp(14 + 48 * (p.inflow / max), 14, 62)
  const wOut = clamp(14 + 48 * (p.outflow / max), 14, 62)
  const level = go ? clamp(p.months_of_spending / 12, 0.03, 1) : 0
  const surplus = p.inflow - p.outflow
  return (
    <Frame label={`Your money: ${money(p.inflow)} in, ${money(p.outflow)} out, ${money(p.buffer)} in the cup`}>
      <Stream d="M 30 150 C 200 150, 260 250, 390 268" width={wIn} color="url(#juice)" speed={0.8 + p.inflow / max} />
      <Label x={48} y={112} size={18} color={INK} weight={800}>what comes in</Label>
      <Big x={48} y={146} size={26}>{money(p.inflow)}<tspan fontSize={15} fill={MUTED} fontWeight={500}> a month</tspan></Big>
      <Cup x={390} y={120} w={220} h={290} level={level} label={money(p.buffer)} sub={`${p.months_of_spending.toFixed(1)} months of spending in the cup`} />
      <Stream d="M 610 300 C 740 320, 820 240, 970 170" width={wOut} color="#FB923C" speed={0.8 + p.outflow / max} opacity={0.85} />
      <Label x={952} y={112} size={18} color={INK} weight={800} anchor="end">what goes out</Label>
      <Big x={952} y={146} size={26} anchor="end">{money(p.outflow)}<tspan fontSize={15} fill={MUTED} fontWeight={500}> a month</tspan></Big>
      <Big x={500} y={500} size={24} color={surplus >= 0 ? MINT : ROSE} anchor="middle">
        {surplus >= 0 ? `${money(surplus)} left in a typical month` : `${money(-surplus)} short in a typical month`}
      </Big>
      <Label x={500} y={530} size={14} color={MUTED} anchor="middle">runway with no shock: {p.runway_label}</Label>
    </Frame>
  )
}
