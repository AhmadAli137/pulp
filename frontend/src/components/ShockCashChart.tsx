import { useReducedMotion } from 'framer-motion'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ShockReport } from '../services/api'
import { Card, DataTable, fmt } from './ui'

const shortDollars = new Intl.NumberFormat('en-CA', { notation: 'compact', maximumFractionDigits: 1 })

export default function ShockCashChart({ report, payNow, showTable }: { report: ShockReport; payNow?: ShockReport; showTable: boolean }) {
  const reduceMotion = useReducedMotion()
  const title = payNow ? 'Cash with each choice' : 'Cash over time'
  const left = payNow ? 'Wait' : 'Without shock'
  const right = payNow ? 'Pay now' : 'After shock'
  const horizon = report.verdict.horizon_months
  const points = (payNow?.cash_path ?? report.cash_path).map((point, index) => ({
    month: point.month,
    first: payNow ? (
      point.month === 0 ? (index === 0 ? report.baseline.buffer_left : report.shocked.buffer_left) : report.verdict.cash_left_at_horizon
    ) : point.baseline,
    second: point.after_shock,
  }))
  const hasUpfront = points.length > 2

  return (
    <Card title={title} right={<span className="small muted">Scenario estimate · CAD</span>}>
      <div className="scenario-chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={points} margin={{ top: 12, right: 18, bottom: 14, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis type="number" dataKey="month" domain={[0, horizon]} allowDecimals={false} tickCount={Math.min(horizon + 1, 7)} tickFormatter={(month: number) => `${month}`} label={{ value: 'Months from start', position: 'insideBottom', offset: -9 }} />
            <YAxis type="number" width={68} domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} tickFormatter={(value: number) => `${value < 0 ? '−' : ''}$${shortDollars.format(Math.abs(value))}`} />
            <ReferenceLine y={0} stroke="var(--gray)" strokeDasharray="3 3" />
            <Tooltip formatter={(value) => typeof value === 'number' ? fmt.money(value, 2) : value} labelFormatter={(month) => month === 0 && hasUpfront ? 'Month 0 · see exact amounts below' : `Month ${month}`} />
            <Legend verticalAlign="top" height={29} />
            <Line type="linear" dataKey="first" name={left} stroke="var(--forest)" strokeDasharray="6 4" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={!reduceMotion} animationDuration={650} />
            <Line type="linear" dataKey="second" name={right} stroke="var(--orange-text)" strokeWidth={3} dot={{ r: 4 }} isAnimationActive={!reduceMotion} animationDuration={650} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="small muted">This estimate starts at your recent average cash balance. Month 0 includes any upfront cost. A line below $0 shows cash you would need to find to cover the scenario.</p>
      <details open={showTable || undefined} className="scenario-details">
        <summary>View exact amounts</summary>
        <DataTable caption={title} headers={['When', left, right]} rows={points.map((point, index) => [
          point.month === 0 && hasUpfront ? `Month 0 ${index === 0 ? 'before' : 'after'} upfront cost` : `Month ${point.month}`,
          fmt.money(point.first, 2),
          fmt.money(point.second, 2),
        ])} />
      </details>
    </Card>
  )
}
