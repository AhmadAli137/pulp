import { useEffect, useState } from 'react'
import type { TwoFuturesParams } from '../../services/api'
import { fmt } from '../ui'
import { Chip } from '../ui'

/* Two futures side by side: stay the course versus the plan. The buffer path draws itself; the goal line and the month it is reached are marked. */
function Panel({ title, path, goalAmount, max, months, reached, tone, go }: { title: string; path: number[]; goalAmount: number; max: number; months: number; reached: number | null; tone: string; go: boolean }) {
  const W = 230, H = 150, x0 = 10, y0 = 10
  const sx = (i: number) => x0 + (i / Math.max(1, months)) * (W - 20)
  const sy = (v: number) => y0 + (1 - Math.max(0, Math.min(v, max)) / max) * (H - 30)
  const d = path.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ')
  const gy = goalAmount > 0 && goalAmount <= max ? sy(goalAmount) : null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: buffer path over ${months} months`}>
      <text x={x0} y={y0 + 2} fontSize={11} fontWeight={600} fill="var(--charcoal)">{title}</text>
      <line x1={x0} y1={sy(0)} x2={W - 10} y2={sy(0)} stroke="var(--line)" />
      {gy != null && <><line x1={x0} y1={gy} x2={W - 10} y2={gy} stroke="var(--gold)" strokeDasharray="4 3" /><text x={W - 10} y={gy - 3} textAnchor="end" fontSize={9} fill="var(--orange-text)">goal {fmt.money(goalAmount)}</text></>}
      <path d={d} fill="none" stroke={tone} strokeWidth={2.5} pathLength={1} strokeDasharray={1} strokeDashoffset={go ? 0 : 1} style={{ transition: 'stroke-dashoffset 3600ms ease-out' }} />
      {reached != null && reached <= months && <g style={{ opacity: go ? 1 : 0, transition: 'opacity 600ms 3400ms' }}><circle cx={sx(reached)} cy={gy ?? sy(path[Math.min(path.length - 1, Math.round(reached))] ?? 0)} r={5} fill={tone} /><text x={sx(reached)} y={(gy ?? sy(0)) - 10} textAnchor="middle" fontSize={9} fill="var(--charcoal)">month {Math.round(reached)}</text></g>}
      {reached == null && goalAmount > 0 && <text x={W - 10} y={H - 4} textAnchor="end" fontSize={9} fill="var(--gray)">goal not reached in {months} months</text>}
      <text x={x0} y={H - 4} fontSize={9} fill="var(--gray)">now</text>
      <text x={W - 10} y={H - 4} textAnchor="end" fontSize={9} fill="var(--gray)">{reached == null && goalAmount > 0 ? '' : `month ${months}`}</text>
    </svg>
  )
}

export default function TwoFuturesScene({ p }: { p: TwoFuturesParams }) {
  const [go, setGo] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setGo(true)); return () => cancelAnimationFrame(id) }, [])
  const months = Math.max(p.stay.buffer_path.length, p.plan.buffer_path.length) - 1
  const max = Math.max(1, ...p.stay.buffer_path, ...p.plan.buffer_path, p.goal.target_amount)
  const lv = p.plan.levers
  const levers = [
    lv.freed_up_per_month > 0 && `free up ${fmt.money(lv.freed_up_per_month)}/mo`,
    lv.goal_contribution_per_month > 0 && `save ${fmt.money(lv.goal_contribution_per_month)}/mo`,
    lv.emergency_floor > 0 && `floor ${fmt.money(lv.emergency_floor)}`,
    lv.extra_income_per_month > 0 && `+${fmt.money(lv.extra_income_per_month)}/mo income`,
  ].filter(Boolean) as string[]
  return (
    <div className="scene two-futures">
      <div className="two-panels">
        <Panel title={p.stay.label || 'Stay the course'} path={p.stay.buffer_path} goalAmount={p.goal.target_amount} max={max} months={months} reached={p.stay.months_to_goal} tone="var(--gray-2)" go={go} />
        <Panel title={p.plan.label || 'The plan'} path={p.plan.buffer_path} goalAmount={p.goal.target_amount} max={max} months={months} reached={p.plan.months_to_goal} tone="var(--emerald)" go={go} />
      </div>
      <div className="row wrap scene-chips">
        <Chip tone="outline">goal: {p.goal.label} · {fmt.money(p.goal.target_amount)} by month {p.goal.target_months}</Chip>
        <Chip tone={p.plan.prob_shortfall < p.stay.prob_shortfall ? 'gold' : 'gray'}>P(shortfall) {fmt.pct(p.stay.prob_shortfall)} → {fmt.pct(p.plan.prob_shortfall)}</Chip>
        {levers.map((l) => <Chip key={l} tone="outline">{l}</Chip>)}
      </div>
    </div>
  )
}
