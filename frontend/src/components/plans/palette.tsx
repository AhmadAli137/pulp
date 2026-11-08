/* Shared vocabulary for the plan views: step categories (colour + icon), finalist roles, formatting helpers. */
import { Briefcase, Clock, CreditCard, House, PiggyBank, ShoppingCart, Target, TrendingUp, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PlanRole, PlanStep } from '../../services/api'

export const CATEGORY: Record<PlanStep['category'], { label: string; color: string; Icon: LucideIcon }> = {
  income: { label: 'Income', color: '#2F7A5B', Icon: Briefcase },
  housing: { label: 'Housing', color: '#8B5E3C', Icon: House },
  spending: { label: 'Spending', color: '#C2410C', Icon: ShoppingCart },
  debt: { label: 'Debt', color: '#6B5B95', Icon: CreditCard },
  saving: { label: 'Saving', color: '#3B6EA8', Icon: PiggyBank },
  investing: { label: 'Investing', color: '#0F766E', Icon: TrendingUp },
  timing: { label: 'Timing', color: '#A16207', Icon: Clock },
  goal: { label: 'Goal', color: '#D9650F', Icon: Target },
}

export type AnyRole = PlanRole | 'falls_short' | 'baseline'
export const ROLE: Record<AnyRole, { label: string; color: string; short: string }> = {
  best_shortfall: { label: 'Covers the gap best', color: '#B4532A', short: 'Gap' },
  best_resilience: { label: 'Strongest cushion', color: '#2F7A5B', short: 'Cushion' },
  best_goals: { label: 'Furthest toward your goals', color: '#3B6EA8', short: 'Goals' },
  best_tradeoff: { label: 'Best balance', color: '#E86A0C', short: 'Balance' },
  least_disruption: { label: 'Easiest to live with', color: '#6B5B95', short: 'Easiest' },
  falls_short: { label: 'Falls short', color: '#B42318', short: 'Short' },
  baseline: { label: 'Carry on as you are', color: '#7C8177', short: 'Now' },
}
export const roleOf = (r?: string | null): AnyRole => (r && r in ROLE ? (r as AnyRole) : 'best_tradeoff')

export const money = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '−' : ''
  return a >= 10000 ? `${s}$${Math.round(a / 1000)}k` : a >= 1000 ? `${s}$${(a / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${s}$${Math.round(a)}`
}
/** A zoomed 0-1 domain that still lands on round gridlines: steps of 25% when the data spans half the range or
    more, otherwise 10%. */
export function domainOf(vals: number[]): { lo: number; hi: number; ticks: number[] } {
  const v = vals.filter((x) => Number.isFinite(x))
  const mn = Math.max(0, Math.min(1, ...(v.length ? v : [0]))), mx = Math.min(1, Math.max(0, ...(v.length ? v : [1])))
  let step = 0.25
  let lo = Math.floor(mn / step) * step, hi = Math.ceil(mx / step) * step
  if (hi - lo < 0.5) { step = 0.1; lo = Math.floor(mn / step) * step; hi = Math.ceil(mx / step) * step }
  if (hi - lo < step * 2) { hi = Math.min(1, lo + step * 2); lo = Math.max(0, hi - step * 2) }
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100)
  return { lo, hi, ticks }
}
export const dollars = (v: number) => `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-CA')}`
export const pct = (v: number) => `${Math.round(v * 100)}%`

/** "+$800/mo", "−$1,200 once", or both. */
export function effectLabel(s: PlanStep): string {
  const parts: string[] = []
  if (s.monthly_effect) parts.push(`${s.monthly_effect > 0 ? '+' : '−'}${dollars(Math.abs(s.monthly_effect)).replace('−', '')}/mo`)
  if (s.one_off) parts.push(`${s.one_off > 0 ? '+' : '−'}${dollars(Math.abs(s.one_off)).replace('−', '')} once`)
  return parts.join(' · ')
}

/** Month axis wording: months for short horizons, years for long ones. */
export function monthLabel(m: number, longTerm: boolean): string {
  if (m === 0) return 'now'
  if (!longTerm) return `m${m}`
  const y = Math.floor(m / 12), mo = m % 12
  return y === 0 ? `${mo} mo` : mo === 0 ? `${y} yr` : `${y} yr ${mo} mo`
}
export function monthTicks(horizon: number, longTerm: boolean): number[] {
  const step = longTerm ? 12 : horizon <= 12 ? 2 : horizon <= 24 ? 3 : 6
  const out: number[] = []
  for (let m = 0; m <= horizon; m += step) out.push(m)
  if (out[out.length - 1] !== horizon) out.push(horizon)
  return out
}

export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setR(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return !!r
}

export function CategoryLegend({ used }: { used?: PlanStep['category'][] }) {
  const keys = (used && used.length ? [...new Set(used)] : (Object.keys(CATEGORY) as PlanStep['category'][]))
  return (
    <ul className="lp-legend" aria-label="Step categories">
      {keys.map((k) => { const { label, color, Icon } = CATEGORY[k]; return <li key={k}><span className="lp-cat-dot" style={{ background: color }}><Icon size={11} color="#fff" aria-hidden="true" /></span>{label}</li> })}
    </ul>
  )
}
