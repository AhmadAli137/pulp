import type { RiverParams } from '../../services/api'
import { EMERALD, FOREST, Frame, GRAY, Label, ORANGE, Stream, money, pct } from './shared'

const NAMES: Record<string, string> = {
  cash_deposits: 'cash deposits', transfers_in: 'transfers in', pension: 'pension', interest: 'interest',
  household_bills: 'household bills', insurance: 'insurance', loan_payments: 'loan', bank_fees: 'fees',
  cash_withdrawals: 'cash out', card_withdrawals: 'card spending', transfers_out: 'transfers out',
}

/* The river: tributaries (where money comes from) join a trunk, which splits into the outflow streams. Width = share. */
export default function RiverVisual({ p }: { p: RiverParams }) {
  const ins = Object.entries(p.parts_in).filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const outs = Object.entries(p.parts_out).filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const trunkW = 56
  const yTop = 90, yBot = 470
  const spread = (n: number, i: number) => yTop + (n <= 1 ? (yBot - yTop) / 2 : (i * (yBot - yTop)) / (n - 1))
  return (
    <Frame label={`Money river: ${money(p.inflow)} in, ${money(p.outflow)} out`}>
      {ins.map(([k, v], i) => {
        const y = spread(ins.length, i)
        return (
          <g key={k}>
            <Stream d={`M 60 ${y} C 220 ${y}, 260 280, 400 280`} width={8 + trunkW * v} speed={0.7 + v} />
            <Label x={60} y={y - 14} size={14} color={FOREST} weight={600}>{NAMES[k] ?? k.replaceAll('_', ' ')}</Label>
            <Label x={60} y={y + 24} size={13} color={GRAY}>{pct(v)} of inflow</Label>
          </g>
        )
      })}
      <Stream d="M 400 280 L 600 280" width={trunkW} speed={1.2} />
      <Label x={500} y={244} size={15} color={FOREST} anchor="middle" weight={700}>{money(p.inflow)} in</Label>
      <Label x={500} y={332} size={15} color={p.surplus >= 0 ? EMERALD : '#C2410C'} anchor="middle" weight={700}>{p.surplus >= 0 ? `${money(p.surplus)} stays` : `${money(-p.surplus)} short`}</Label>
      {outs.map(([k, v], i) => {
        const y = spread(outs.length, i)
        return (
          <g key={k}>
            <Stream d={`M 600 280 C 740 280, 780 ${y}, 940 ${y}`} width={6 + trunkW * v} color="#EA6510" speed={0.7 + v} opacity={0.8} />
            <Label x={940} y={y - 14} size={14} color={FOREST} weight={600} anchor="end">{NAMES[k] ?? k.replaceAll('_', ' ')}</Label>
            <Label x={940} y={y + 24} size={13} color={GRAY} anchor="end">{pct(v)} of outflow</Label>
          </g>
        )
      })}
      <circle cx={500} cy={280} r={9} fill={ORANGE} />
    </Frame>
  )
}
