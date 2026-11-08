import type { RiverParams } from '../../services/api'
import { Big, Frame, INK, Label, MINT, MUTED, ORANGE, ROSE, Stream, money, pct } from './shared'

const NAMES: Record<string, string> = {
  cash_deposits: 'cash deposits', transfers_in: 'transfers in', pension: 'pension', interest: 'interest',
  household_bills: 'household bills', insurance: 'insurance', loan_payments: 'loan', loan: 'loan', bank_fees: 'fees', fees: 'fees',
  cash_withdrawals: 'cash out', 'cash out': 'cash out', card_withdrawals: 'card spending', card: 'card spending', transfers_out: 'transfers out',
}

/* The river: tributaries (where money comes from) join a trunk, which splits into the outflow streams. Width = share. */
export default function RiverVisual({ p }: { p: RiverParams }) {
  const ins = Object.entries(p.parts_in).filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const outs = Object.entries(p.parts_out).filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const trunkW = 64
  const yTop = 90, yBot = 470
  const spread = (n: number, i: number) => yTop + (n <= 1 ? (yBot - yTop) / 2 : (i * (yBot - yTop)) / (n - 1))
  const name = (k: string) => NAMES[k] ?? k.replaceAll('_', ' ')
  return (
    <Frame label={`Money river: ${money(p.inflow)} in, ${money(p.outflow)} out`}>
      {ins.map(([k, v], i) => {
        const y = spread(ins.length, i)
        return (
          <g key={k}>
            <Stream d={`M 50 ${y} C 220 ${y}, 260 280, 400 280`} width={10 + trunkW * v} color="url(#juice)" speed={0.7 + v} glow={v > 0.3} />
            <Label x={60} y={y - 16} size={15} color={INK} weight={700}>{name(k)}</Label>
            <Label x={60} y={y + 26} size={13} color={MUTED}>{pct(v)} of what comes in</Label>
          </g>
        )
      })}
      <Stream d="M 400 280 L 600 280" width={trunkW} color="url(#juice)" speed={1.2} />
      <Big x={500} y={236} size={20} anchor="middle">{money(p.inflow)} in</Big>
      <Big x={500} y={338} size={20} color={p.surplus >= 0 ? MINT : ROSE} anchor="middle">{p.surplus >= 0 ? `${money(p.surplus)} stays` : `${money(-p.surplus)} short`}</Big>
      {outs.map(([k, v], i) => {
        const y = spread(outs.length, i)
        return (
          <g key={k}>
            <Stream d={`M 600 280 C 740 280, 780 ${y}, 950 ${y}`} width={8 + trunkW * v} color="#FB923C" speed={0.7 + v} opacity={0.85} glow={v > 0.3} />
            <Label x={940} y={y - 16} size={15} color={INK} weight={700} anchor="end">{name(k)}</Label>
            <Label x={940} y={y + 26} size={13} color={MUTED} anchor="end">{pct(v)} of what goes out</Label>
          </g>
        )
      })}
      <circle cx={500} cy={280} r={12} fill={ORANGE} filter="url(#glow)" />
    </Frame>
  )
}
