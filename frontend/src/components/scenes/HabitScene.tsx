import type { HabitParams } from '../../services/api'
import { fmt } from '../ui'

/* One small picture per habit kind, driven only by the params. CSS keyframes live in styles.css (.habit-*). */
function Cup({ x, y, w = 90, h = 110, level = 0.7, label, tone = 'var(--orange)', extra }: { x: number; y: number; w?: number; h?: number; level?: number; label?: string; tone?: string; extra?: React.ReactNode }) {
  const id = `cup-${x}-${y}`
  return (
    <g>
      <defs><clipPath id={id}><path d={`M${x} ${y} h${w} l-10 ${h} h-${w - 20} z`} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <rect x={x} y={y} width={w} height={h} fill="var(--orange-soft)" />
        <rect x={x} y={y + h * (1 - level)} width={w} height={h * level} fill={tone} />
        {extra}
      </g>
      <path d={`M${x} ${y} h${w} l-10 ${h} h-${w - 20} z`} fill="none" stroke="var(--forest)" strokeWidth={2} />
      {label && <text x={x + w / 2} y={y + h + 16} textAnchor="middle" fontSize={11} fill="var(--gray)">{label}</text>}
    </g>
  )
}

export default function HabitScene({ p }: { p: HabitParams }) {
  const n = p.numbers
  const body = (() => {
    switch (p.kind) {
      case 'timing': {
        const days = Array.from({ length: 28 }, (_, i) => i + 1)
        const row = (y: number, payDay: number, billDay: number, label: string) => (
          <g>
            <text x={10} y={y - 8} fontSize={11} fill="var(--charcoal)">{label}</text>
            {days.map((d) => {
              const neg = d >= billDay && d < payDay
              return <rect key={d} x={10 + (d - 1) * 18} y={y} width={15} height={22} rx={3} fill={neg ? 'var(--danger)' : 'var(--mint)'} className={neg ? 'habit-pulse' : ''} />
            })}
            <text x={10 + (billDay - 1) * 18} y={y + 38} fontSize={9} fill="var(--gray)">bills</text>
            <text x={10 + (payDay - 1) * 18} y={y + 38} fontSize={9} fill="var(--emerald)">pay arrives</text>
          </g>
        )
        return (<svg viewBox="0 0 520 180" role="img" aria-label="Bills land before pay arrives">
          {row(30, 6, 3, `how months go now: below zero between the bills and payday (${n.neg_months ?? 0} months)`)}
          {row(115, 2, 6, 'same money, pay first: no dip')}
        </svg>)
      }
      case 'fee':
        return (<svg viewBox="0 0 520 180" role="img" aria-label="Fees dripping from the buffer">
          <Cup x={60} y={20} level={0.75} label="your buffer" />
          {[0, 1, 2].map((i) => <circle key={i} cx={128} cy={140} r={4} fill="var(--orange)" className="habit-drip" style={{ animationDelay: `${i * 700}ms` }} />)}
          <text x={200} y={70} fontSize={13} fill="var(--charcoal)">fees and penalty interest</text>
          <text x={200} y={92} fontSize={20} fontWeight={700} fill="var(--danger)">{fmt.pct(n.fee_share ?? 0, 1)} of everything that leaves</text>
          <text x={200} y={114} fontSize={11} fill="var(--gray)">about four times the typical account</text>
        </svg>)
      case 'creep': {
        const inc = n.income_drift_pm ?? 0, sp = n.spending_drift_pm ?? 0
        const pts = (slope: number, y0: number) => Array.from({ length: 25 }, (_, i) => `${20 + i * 19},${y0 - slope * i * 300}`).join(' ')
        return (<svg viewBox="0 0 520 180" role="img" aria-label="Spending growing faster than income">
          <polyline points={pts(inc, 110)} fill="none" stroke="var(--emerald)" strokeWidth={2.5} pathLength={1} className="habit-draw" />
          <polyline points={pts(sp, 120)} fill="none" stroke="var(--orange)" strokeWidth={2.5} pathLength={1} className="habit-draw" style={{ animationDelay: '300ms' }} />
          <text x={20} y={160} fontSize={10} fill="var(--gray)">24 months ago</text><text x={500} y={160} textAnchor="end" fontSize={10} fill="var(--gray)">now</text>
          <text x={300} y={30} fontSize={11} fill="var(--emerald)">income {fmt.pct(inc, 1)} of I per month</text>
          <text x={300} y={48} fontSize={11} fill="var(--orange-text)">spending {fmt.pct(sp, 1)} of S per month</text>
        </svg>)
      }
      case 'transfer':
        return (<svg viewBox="0 0 520 180" role="img" aria-label="A regular transfer to another bank">
          <Cup x={50} y={20} level={0.6} label="this account" />
          <Cup x={360} y={20} level={0.45} label="another bank" tone="var(--emerald)" />
          <path d="M150 70 C 230 30, 300 30, 360 70" fill="none" stroke="var(--forest)" strokeWidth={2} strokeDasharray="6 5" className="habit-flow" />
          <text x={255} y={36} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--charcoal)">{fmt.money(n.amount ?? 0)} most months</text>
          <text x={255} y={110} textAnchor="middle" fontSize={11} fill="var(--gray)">the real cushion is probably larger than this balance shows</text>
        </svg>)
      case 'margin': {
        const ratio = Math.min(1, n.spending_ratio ?? 0)
        return (<svg viewBox="0 0 520 180" role="img" aria-label="Spending fills almost the whole inflow">
          <Cup x={60} y={20} level={1} tone="var(--mint)" label="what comes in" />
          <Cup x={200} y={20} level={ratio} label={`what goes out · ${fmt.pct(ratio)}`} />
          <text x={340} y={60} fontSize={12} fill="var(--charcoal)">in {fmt.money(n.I ?? 0)}</text>
          <text x={340} y={82} fontSize={12} fill="var(--charcoal)">out {fmt.money(n.S ?? 0)}</text>
          <text x={340} y={110} fontSize={13} fontWeight={600} fill={ratio >= 0.95 ? 'var(--danger)' : 'var(--emerald)'}>{fmt.money(Math.max(0, (n.I ?? 0) - (n.S ?? 0)))} left in a typical month</text>
        </svg>)
      }
      case 'volatile': {
        const cv = n.income_cv ?? 0.5
        const pts = Array.from({ length: 24 }, (_, i) => `${20 + i * 21},${100 + Math.sin(i * 1.9) * 45 * Math.min(1.5, cv) * (i % 3 === 0 ? 1 : 0.4)}`).join(' ')
        return (<svg viewBox="0 0 520 180" role="img" aria-label="Uneven income month to month">
          <line x1={20} y1={100} x2={500} y2={100} stroke="var(--line)" />
          <polyline points={pts} fill="none" stroke="var(--orange)" strokeWidth={2.5} pathLength={1} className="habit-draw" />
          <text x={20} y={30} fontSize={12} fill="var(--charcoal)">income swings · volatility {fmt.num(cv, 2)}</text>
          <text x={20} y={165} fontSize={10} fill="var(--gray)">the dotted line is a typical month; the buffer has to absorb every dip</text>
        </svg>)
      }
      case 'loan': {
        const share = Math.min(0.9, n.loan_payment_share ?? 0.3)
        return (<svg viewBox="0 0 520 180" role="img" aria-label="A fixed slice of each month is locked for the loan">
          <Cup x={60} y={20} level={1} tone="var(--mint)" extra={<rect x={60} y={20} width={90} height={110 * share} fill="var(--forest)" opacity={0.85} />} label="each month's inflow" />
          <text x={200} y={60} fontSize={13} fill="var(--charcoal)">loan payment</text>
          <text x={200} y={88} fontSize={22} fontWeight={700} fill="var(--forest)">{fmt.pct(share)} of inflow, fixed</text>
          <text x={200} y={110} fontSize={11} fill="var(--gray)">it does not shrink when income does</text>
        </svg>)
      }
      default:
        return (<svg viewBox="0 0 520 180" role="img" aria-label="A calm account">
          <Cup x={215} y={20} level={0.7} label="steady" />
          <text x={260} y={170} textAnchor="middle" fontSize={11} fill="var(--gray)">nothing in the record stands out</text>
        </svg>)
    }
  })()
  return (
    <div className="scene habit">
      {body}
      <div className="tiny muted scene-evidence">{p.label}{p.evidence ? ` · ${p.evidence}` : ''}</div>
    </div>
  )
}
