/* Cash, month by month: the selected plan against today's course, with the plans that fall short as thin dashed
   lines for contrast, the shock window shaded, a $0 line and the end values labelled. */
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { LifePlan } from '../../services/api'
import { ROLE, dollars, money, monthLabel, monthTicks, roleOf } from './palette'

export default function CashMonthChart({ plan, baseline, cautionary = [], horizon, shock, longTerm = false, height = 280 }: {
  plan: LifePlan; baseline: LifePlan; cautionary?: LifePlan[]; horizon: number; shock?: { start: number; duration: number } | null; longTerm?: boolean; height?: number
}) {
  const color = ROLE[roleOf(plan.role)].color
  const data = Array.from({ length: horizon + 1 }, (_, m) => {
    const row: Record<string, number> = { m, plan: plan.outcome.cash_path[m] ?? NaN, base: baseline.outcome.cash_path[m] ?? NaN }
    cautionary.forEach((c, i) => { row[`c${i}`] = c.outcome.cash_path[m] ?? NaN })
    return row
  })
  const names: Record<string, string> = { plan: plan.name, base: 'Today’s course', ...Object.fromEntries(cautionary.map((c, i) => [`c${i}`, `Falls short: ${c.name}`])) }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const endLabel = (key: string, fill: string) => (props: any) => {
    if (props.index !== horizon || props.value == null) return <g key={`${key}${props.index}`} />
    return <text x={Number(props.x) + 6} y={Number(props.y) + 4} fontSize={12} fontWeight={700} fill={fill} key={key}>{money(Number(props.value))}</text>
  }
  return (
    <div className="lp-cash">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 12, right: 58, left: 4, bottom: 18 }}>
          <CartesianGrid stroke="#E9ECE4" vertical={false} />
          {shock && shock.duration > 0 && <ReferenceArea x1={shock.start} x2={Math.min(horizon, shock.start + shock.duration - 1)} fill="#F97316" fillOpacity={0.08} label={{ value: 'shock', position: 'insideTop', fontSize: 11, fill: '#C75610' }} />}
          <XAxis dataKey="m" type="number" domain={[0, horizon]} ticks={monthTicks(horizon, longTerm)} tickFormatter={(m) => monthLabel(Number(m), longTerm)} tick={{ fontSize: 11, fill: '#7C8177' }}
            label={{ value: longTerm ? 'Years from now' : 'Months from now', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#7C8177' }} />
          <YAxis tickFormatter={(v) => money(Number(v))} tick={{ fontSize: 11, fill: '#7C8177' }} width={56} label={{ value: 'Cash (CAD)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 11, fill: '#7C8177' }} />
          <ReferenceLine y={0} stroke="#9AA093" strokeWidth={1.5} />
          <Tooltip formatter={(v, k) => [dollars(Number(v)), names[String(k)] ?? String(k)]} labelFormatter={(m) => (longTerm ? monthLabel(Number(m), true) : `Month ${m}`)} contentStyle={{ borderRadius: 10, border: '1px solid #E9ECE4', fontSize: 12 }} />
          {cautionary.map((c, i) => <Line key={c.id} dataKey={`c${i}`} stroke="#B42318" strokeOpacity={0.55} strokeWidth={1.4} strokeDasharray="5 4" dot={false} isAnimationActive={false} />)}
          <Line dataKey="base" stroke="#7C8177" strokeWidth={2} strokeDasharray="2 3" dot={false} isAnimationActive={false} label={endLabel('b', '#7C8177')} />
          <Line dataKey="plan" stroke={color} strokeWidth={3} dot={false} isAnimationActive={false} label={endLabel('p', color)} />
        </LineChart>
      </ResponsiveContainer>
      <ul className="lp-legend" aria-label="Lines">
        <li><i className="lp-line" style={{ background: color }} />{plan.name}</li>
        <li><i className="lp-line dotted" />today’s course</li>
        {cautionary.length > 0 && <li><i className="lp-line dashed" />plans that fall short</li>}
      </ul>
    </div>
  )
}
