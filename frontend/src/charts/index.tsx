import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Cell,
} from 'recharts'
import type { Branch, HistoryRow, Strategy } from '../services/api'
import { fmt } from '../components/ui'

export const C = { forest: '#183B2D', emerald: '#2F7A5B', mint: '#E8EDDE', gold: '#F97316', gray: '#8C9286', danger: '#C2410C', line: '#E9ECE4', charcoal: '#252920' }
const money = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(v)}`)
const tipStyle = { borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 12, boxShadow: '0 8px 24px rgba(22,63,53,0.08)' }

/* Historical cash flow: money in vs money out by month. */
export function CashFlowChart({ history, I, S }: { history: HistoryRow[]; I: number; S: number }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.gray }} interval="preserveStartEnd" minTickGap={28} />
        <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: C.gray }} width={52} />
        <Tooltip formatter={(v) => fmt.money(Number(v))} contentStyle={tipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="money_in" name="Money in" fill={C.emerald} radius={[3, 3, 0, 0]} />
        <Bar dataKey="money_out" name="Money out" fill={C.gold} radius={[3, 3, 0, 0]} />
        <ReferenceLine y={I} stroke={C.emerald} strokeDasharray="4 4" label={{ value: 'I', fontSize: 11, fill: C.emerald, position: 'right' }} />
        <ReferenceLine y={S} stroke={C.gold} strokeDasharray="4 4" label={{ value: 'S', fontSize: 11, fill: C.gold, position: 'right' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* Historical liquidity: average and minimum balance by month. */
export function LiquidityChart({ history, B }: { history: HistoryRow[]; B: number }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.gray }} interval="preserveStartEnd" minTickGap={28} />
        <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: C.gray }} width={52} />
        <Tooltip formatter={(v) => fmt.money(Number(v))} contentStyle={tipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area dataKey="avg_daily_balance" name="Average daily balance" stroke={C.forest} fill={C.mint} strokeWidth={2} />
        <Line dataKey="min_balance" name="Minimum balance" stroke={C.danger} strokeWidth={1.5} dot={false} />
        <ReferenceLine y={0} stroke={C.charcoal} />
        <ReferenceLine y={B} stroke={C.emerald} strokeDasharray="4 4" label={{ value: 'B', fontSize: 11, fill: C.emerald, position: 'right' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* Scenario fan chart: median projected buffer with p10–p90 and p25–p75 bands, plus baseline median. */
export function FanChart({ months, p10, p25, p50, p75, p90, baseline, det, goal, height = 300 }: { months: number[]; p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[]; baseline?: number[]; det?: number[]; goal?: number[]; height?: number }) {
  const data = months.map((m, i) => ({ m, p10: p10[i], p25: p25[i], p50: p50[i], p75: p75[i], p90: p90[i], band1: [p10[i], p90[i]], band2: [p25[i], p75[i]], baseline: baseline?.[i], det: det?.[i], goal: goal?.[i] }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="m" tick={{ fontSize: 11, fill: C.gray }} label={{ value: 'Months from now', position: 'insideBottom', offset: -2, fontSize: 11, fill: C.gray }} height={34} />
        <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: C.gray }} width={52} />
        <Tooltip contentStyle={tipStyle} formatter={(v, name) => [Array.isArray(v) ? `${fmt.money(v[0])} to ${fmt.money(v[1])}` : fmt.money(Number(v)), String(name)]} labelFormatter={(l) => `Month ${l}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area dataKey="band1" name="10th to 90th percentile" stroke="none" fill={C.emerald} fillOpacity={0.12} />
        <Area dataKey="band2" name="25th to 75th percentile" stroke="none" fill={C.emerald} fillOpacity={0.22} />
        <Line dataKey="p50" name="Median buffer (scenario)" stroke={C.forest} strokeWidth={2.5} dot={false} />
        {baseline && <Line dataKey="baseline" name="Median buffer (baseline)" stroke={C.gray} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />}
        {det && <Line dataKey="det" name="Typical-month path" stroke={C.gold} strokeWidth={1.5} dot={false} />}
        {goal && <Line dataKey="goal" name="Goal fund (median)" stroke={C.emerald} strokeWidth={2} dot={false} />}
        <ReferenceLine y={0} stroke={C.danger} strokeWidth={1.5} label={{ value: 'Cash runs out', fontSize: 11, fill: C.danger, position: 'insideTopRight' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* Branching paths: one median line per branch. */
export function BranchChart({ branches, active, onPick }: { branches: Branch[]; active: string; onPick: (k: string) => void }) {
  const colors: Record<string, string> = { baseline: C.gray, income_loss: C.danger, higher_costs: C.gold, positive_income: C.emerald, combined: '#7a2e27' }
  const n = branches[0]?.median_path.length ?? 0
  const data = Array.from({ length: n }, (_, i) => Object.fromEntries([['m', i], ...branches.map((b) => [b.key, b.median_path[i]])]))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="m" tick={{ fontSize: 11, fill: C.gray }} label={{ value: 'Months from today', position: 'insideBottom', offset: -2, fontSize: 11, fill: C.gray }} height={34} />
        <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: C.gray }} width={52} />
        <Tooltip contentStyle={tipStyle} formatter={(v) => fmt.money(Number(v))} labelFormatter={(l) => `Month ${l}`} />
        <Legend wrapperStyle={{ fontSize: 12, cursor: 'pointer' }} onClick={(e) => onPick(String((e as { dataKey?: string }).dataKey))} />
        {branches.map((b) => (
          <Line key={b.key} dataKey={b.key} name={b.label} stroke={colors[b.key]} strokeWidth={b.key === active ? 3.5 : 1.5} strokeOpacity={b.key === active ? 1 : 0.6} dot={false} />
        ))}
        <ReferenceLine y={0} stroke={C.charcoal} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* Financial vulnerability: official runway under several shocks (bars). */
export function VulnerabilityChart({ rows }: { rows: { name: string; runway: number | null; label: string }[] }) {
  const data = rows.map((r) => ({ ...r, v: r.runway == null ? 120 : r.runway }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={C.line} horizontal={false} />
        <XAxis type="number" domain={[0, (d: number) => Math.min(Math.max(12, d * 1.1), 120)]} tick={{ fontSize: 11, fill: C.gray }} label={{ value: 'Months of runway', position: 'insideBottom', offset: -2, fontSize: 11, fill: C.gray }} height={34} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: C.charcoal }} width={150} />
        <Tooltip contentStyle={tipStyle} formatter={(_v, _n, p) => [(p as { payload: { label: string } }).payload.label, 'Runway']} />
        <ReferenceLine x={6} stroke={C.gold} strokeDasharray="4 4" label={{ value: '6 mo', fontSize: 11, fill: C.gold, position: 'top' }} />
        <Bar dataKey="v" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: C.charcoal, formatter: (v: unknown) => (Number(v) >= 120 ? '120+' : Number(v).toFixed(1)) }}>
          {data.map((d) => <Cell key={d.name} fill={d.v >= 6 ? C.emerald : C.danger} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* Strategy comparison: buffer median path per strategy. */
export function StrategyChart({ strategies, recommended }: { strategies: Strategy[]; recommended: string }) {
  const colors: Record<string, string> = { stay: C.gray, buffer_first: C.forest, goal_first: C.gold, balanced: C.emerald }
  const n = strategies[0]?.buffer_median_path.length ?? 0
  const data = Array.from({ length: n }, (_, i) => Object.fromEntries([['m', i], ...strategies.map((s) => [s.key, s.buffer_median_path[i]])]))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="m" tick={{ fontSize: 11, fill: C.gray }} label={{ value: 'Months (stress: see label)', position: 'insideBottom', offset: -2, fontSize: 11, fill: C.gray }} height={34} />
        <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: C.gray }} width={52} />
        <Tooltip contentStyle={tipStyle} formatter={(v) => fmt.money(Number(v))} labelFormatter={(l) => `Month ${l}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {strategies.filter((s) => s.feasible).map((s) => (
          <Line key={s.key} dataKey={s.key} name={`${s.label}${s.key === recommended ? ' (recommended)' : ''}`} stroke={colors[s.key]} strokeWidth={s.key === recommended ? 3.5 : 1.5} dot={false} />
        ))}
        <ReferenceLine y={0} stroke={C.danger} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* Before vs after replanning: buffer and goal paths from two snapshots. */
export function ReplanChart({ before, after }: { before: { buffer: number[]; goal: number[] } | null; after: { buffer: number[]; goal: number[] } }) {
  const n = after.buffer.length
  const data = Array.from({ length: n }, (_, i) => ({ m: i, b_after: after.buffer[i], g_after: after.goal[i], b_before: before?.buffer[i], g_before: before?.goal[i] }))
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="m" tick={{ fontSize: 11, fill: C.gray }} height={30} />
        <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: C.gray }} width={52} />
        <Tooltip contentStyle={tipStyle} formatter={(v) => fmt.money(Number(v))} labelFormatter={(l) => `Month ${l}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {before && <Line dataKey="b_before" name="Buffer (previous plan)" stroke={C.gray} strokeDasharray="5 4" strokeWidth={1.5} dot={false} />}
        <Line dataKey="b_after" name="Buffer (current plan)" stroke={C.forest} strokeWidth={2.5} dot={false} />
        {before && <Line dataKey="g_before" name="Goal fund (previous)" stroke={C.gold} strokeDasharray="5 4" strokeWidth={1.5} dot={false} />}
        <Line dataKey="g_after" name="Goal fund (current)" stroke={C.emerald} strokeWidth={2.5} dot={false} />
        <ReferenceLine y={0} stroke={C.danger} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* Population finding: survival by quartile for two rankings. */
export function QuartileChart({ buffer, ratio }: { buffer: { quartile: string; survive6_pct: number }[]; ratio: { quartile: string; survive6_pct: number }[] }) {
  const data = buffer.map((b, i) => ({ q: b.quartile, buffer: b.survive6_pct, ratio: ratio[i]?.survive6_pct }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="q" tick={{ fontSize: 11, fill: C.gray }} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: C.gray }} width={44} />
        <Tooltip contentStyle={tipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="buffer" name="Ranked by cash buffer" fill={C.gray} radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 10, fill: C.gray, formatter: (v: unknown) => `${Math.round(Number(v))}%` }} />
        <Bar dataKey="ratio" name="Ranked by spending ÷ income" fill={C.emerald} radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 10, fill: C.forest, formatter: (v: unknown) => `${Math.round(Number(v))}%` }} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* Matched-pair outcomes. */
export function PairChart({ both_ok, expected, both_fail, reversals }: { both_ok: number; expected: number; both_fail: number; reversals: number }) {
  const data = [
    { name: 'Both last 6 months', v: both_ok, c: C.gray },
    { name: 'Bigger buffer lasts, smaller fails', v: expected, c: C.gray },
    { name: 'Both fail', v: both_fail, c: C.gray },
    { name: 'Smaller buffer lasts, bigger fails', v: reversals, c: C.gold },
  ]
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={C.line} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: C.gray }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: C.charcoal }} width={210} />
        <Tooltip contentStyle={tipStyle} />
        <Bar dataKey="v" name="Pairs" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: C.charcoal }}>
          {data.map((d) => <Cell key={d.name} fill={d.c} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* Cohort: runway distribution of peers with the selected account marked. */
export function CohortChart({ buckets, myBucket }: { buckets: { bucket: string; n: number }[]; myBucket: string | null }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={buckets} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: C.gray }} label={{ value: 'Runway under the layoff twist (months)', position: 'insideBottom', offset: -2, fontSize: 11, fill: C.gray }} height={34} />
        <YAxis tick={{ fontSize: 11, fill: C.gray }} width={36} />
        <Tooltip contentStyle={tipStyle} />
        <Bar dataKey="n" name="Peers" radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 10, fill: C.gray }}>
          {buckets.map((b) => <Cell key={b.bucket} fill={b.bucket === myBucket ? C.gold : C.emerald} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* Goal progress: current vs projected goal fund toward target. */
export function GoalProgressChart({ path, target, deadline }: { path: number[]; target: number; deadline: number }) {
  const data = path.map((v, i) => ({ m: i, v, target }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="m" tick={{ fontSize: 11, fill: C.gray }} height={30} />
        <YAxis tickFormatter={money} tick={{ fontSize: 11, fill: C.gray }} width={52} />
        <Tooltip contentStyle={tipStyle} formatter={(v) => fmt.money(Number(v))} labelFormatter={(l) => `Month ${l}`} />
        <Area dataKey="v" name="Goal fund (projected)" stroke={C.emerald} fill={C.mint} strokeWidth={2} />
        <ReferenceLine y={target} stroke={C.gold} strokeDasharray="4 4" label={{ value: 'Target', fontSize: 11, fill: C.gold, position: 'insideTopLeft' }} />
        <ReferenceLine x={deadline} stroke={C.gray} strokeDasharray="4 4" label={{ value: 'Deadline', fontSize: 11, fill: C.gray, position: 'top' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}


/* Six-month layoff survival by quantile bin of one behavioural feature (Insights explorer). */
export function FeatureSurvivalChart({ bins }: { bins: { range: string; n: number; survive6_layoff_pct: number; survive6_combined_pct: number }[] }) {
  const data = bins.map((b) => ({ range: b.range, n: b.n, layoff: b.survive6_layoff_pct, combined: b.survive6_combined_pct }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.line} vertical={false} />
        <XAxis dataKey="range" tick={{ fontSize: 11, fill: C.gray }} interval={0} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: C.gray }} width={44} />
        <Tooltip contentStyle={tipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.n ?? ''} accounts`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="layoff" name="Layoff, 55% income" fill={C.emerald} radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 10, fill: C.forest, formatter: (v: unknown) => `${Math.round(Number(v))}%` }} />
        <Bar dataKey="combined" name="Layoff + bills 15%" fill={C.gold} radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 10, fill: C.gray, formatter: (v: unknown) => `${Math.round(Number(v))}%` }} />
      </BarChart>
    </ResponsiveContainer>
  )
}
