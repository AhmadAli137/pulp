import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { TimelineParams } from '../../services/api'
import { H, W, clamp, kMoney, money, niceTicks, useMotionScale } from './shared'

/* "Your cushion, month by month": one bar per month for the cushion left at the end of that month.
   It starts at today's cushion (after any one-off cost), drops by the monthly gap, and once it passes $0 the bars turn
   red and hang below the line, labelled with how short you are. A marker shows the month it runs out.
   Reads in five seconds: start, how fast it drains, when it is empty, how short you end up. */

const FOREST = '#1c4639'
const ORANGE = '#E86A0C'
const ORANGE_DEEP = '#9c4f30'
const RED = '#b4432b'
const MUTED = '#5f6b63'
const GRID = '#E3E8DF'

/** Cushion at the end of each month 0..N: the buffer minus the monthly gap (or plus the surplus). */
export function cushionPath(p: TimelineParams): number[] {
  const n = Math.max(1, Math.round(p.duration_months))
  return Array.from({ length: n + 1 }, (_, m) => p.buffer_start - p.monthly_gap * m)
}

function useNarrow(ref: React.RefObject<SVGSVGElement | null>) {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width > 0 && e.contentRect.width < 700))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return narrow
}

export default function TimelineVisual({ p }: { p: TimelineParams }) {
  const motionOn = useMotionScale() > 0
  const svgRef = useRef<SVGSVGElement | null>(null)
  const narrow = useNarrow(svgRef)
  const k = narrow ? 1.45 : 1 // labels grow when the figure is drawn small, so they stay readable
  const n = Math.max(1, Math.round(p.duration_months))
  const path = cushionPath(p)
  const end = path[n]
  const gap = p.monthly_gap
  const emptyAt = p.buffer_start <= 0 ? 0 : gap > 0 && p.buffer_start / gap < n ? p.buffer_start / gap : null
  const shortBy = Math.max(0, -end)

  // chart box
  const x0 = narrow ? 150 : 130, x1 = 965, yTop = narrow ? 200 : 168, yBot = narrow ? 445 : 465
  const hi = Math.max(1, ...path)
  const lo = Math.min(0, ...path)
  const ticks = niceTicks(lo, hi, narrow ? 3 : 4)
  const top = Math.max(hi, ticks[ticks.length - 1] ?? hi)
  // leave room under the deepest red bar for its 'short $X' label, above the month names
  const bottom = Math.min(lo, ticks[0] ?? lo) - (lo < 0 ? (hi - lo) * (narrow ? 0.22 : 0.16) : 0)
  const Y = (v: number) => yTop + ((top - v) / Math.max(1, top - bottom)) * (yBot - yTop)
  const Y0 = Y(0)
  const slot = (x1 - x0) / (n + 1)
  const X = (m: number) => x0 + slot * (m + 0.5) // centre of month m's bar
  const bw = Math.min(64, slot * 0.62)
  const labelEvery = n <= (narrow ? 4 : 8) ? 1 : Math.ceil(n / (narrow ? 4 : 6))
  const monthName = (m: number) => (m === 0 ? 'Today' : n <= (narrow ? 3 : 6) ? `Month ${m}` : `M${m}`)

  // words
  const card = p.events.find((e) => e.month === 0)?.label
  const pctKept = p.income_before > 0 ? Math.round((p.income_after / p.income_before) * 100) : null
  const incomeWords = p.income_after < p.income_before - 1
    ? `Income falls to ${money(p.income_after)}${pctKept != null ? ` (${pctKept}%)` : ''}`
    : `Income stays ${money(p.income_after)}`
  const gapWords = gap > 0 ? `you're ${money(gap)} short each month` : gap < 0 ? `${money(-gap)} left over each month` : 'money in still covers spending'
  const verdict = emptyAt === null
    ? `Makes it: ${money(Math.max(0, end))} left after ${n} month${n === 1 ? '' : 's'}.`
    : emptyAt === 0
      ? `Does not make it: the cost is more than the cushion, so you're short from the start${shortBy > 0 ? `, ${money(shortBy)} by month ${n}` : ''}.`
      : `Does not make it: empty after ${emptyAt.toFixed(1)} months, ${money(shortBy)} short by month ${n}.`
  const label = `Cushion month by month: starts at ${money(p.buffer_start)}. ${verdict}`

  const fs = (s: number) => Math.round(s * k)
  const anim = (i: number) => (motionOn ? { duration: 0.45, delay: 0.15 + i * Math.min(0.18, 1.6 / (n + 1)), ease: 'easeOut' as const } : { duration: 0 })

  return (
    <svg ref={svgRef} className="stage-svg timeline-cushion" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="tl-juice" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#F7A650" /><stop offset="1" stopColor={ORANGE} /></linearGradient>
        <pattern id="tl-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#F3D9D2" /><line x1="0" y1="0" x2="0" y2="10" stroke={RED} strokeWidth="4" />
        </pattern>
      </defs>

      {/* header: what the shock does to a typical month, and which card it is */}
      {card && (
        <g>
          <rect x={30} y={18} rx={14} height={fs(30)} width={Math.min(420, 22 + card.length * fs(10.5))} fill="#FBEFE6" />
          <text x={44} y={18 + fs(30) / 2 + fs(6)} fontSize={fs(17)} fontWeight={800} fill={ORANGE_DEEP}>{card}</text>
        </g>
      )}
      {(() => {
        const y1 = card ? 18 + fs(30) + fs(30) : fs(34)
        const spend = `spending ${p.spending_after > p.income_before + 1 ? 'rises to' : 'stays'} ${money(p.spending_after)}`
        return (
          <g>
            <text x={30} y={y1} fontSize={fs(19)} fill={FOREST} fontWeight={600}>{narrow ? incomeWords : `${incomeWords}  ·  ${spend}`}</text>
            <text x={30} y={y1 + fs(28)} fontSize={fs(20)} fill={gap > 0 ? RED : FOREST} fontWeight={800}>{gapWords[0].toUpperCase() + gapWords.slice(1)}</text>
          </g>
        )
      })()}

      {/* dollar axis: light gridlines, a strong $0 line */}
      <g aria-hidden="true">
        {ticks.filter((v) => v !== 0).map((v) => (
          <g key={v}>
            <line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} stroke={GRID} strokeWidth={1.5} />
            <text x={x0 - 12} y={Y(v) + fs(6)} fontSize={fs(16)} fill={MUTED} textAnchor="end">{kMoney(v)}</text>
          </g>
        ))}
        <line x1={x0} x2={x1} y1={Y0} y2={Y0} stroke={FOREST} strokeWidth={3} />
        <text x={x0 - 12} y={Y0 + fs(6)} fontSize={fs(16)} fill={FOREST} textAnchor="end" fontWeight={800}>$0</text>
        {!narrow && <text x={x0 - 12} y={yTop - 16} fontSize={15} fill={MUTED} textAnchor="end" fontWeight={700}>cushion left</text>}
      </g>

      {/* one bar per month: juice above $0, red and hatched below it */}
      {path.map((v, m) => {
        const above = v >= 0
        const h = Math.abs(Y(v) - Y0)
        const y = above ? Y0 - h : Y0
        const showValue = m === 0 || m === n || m % labelEvery === 0
        return (
          <g key={m}>
            <motion.rect x={X(m) - bw / 2} width={bw} rx={5} fill={above ? (m === 0 ? FOREST : 'url(#tl-juice)') : 'url(#tl-hatch)'}
              stroke={above ? 'none' : RED} strokeWidth={above ? 0 : 2}
              initial={motionOn ? { y: Y0, height: 0 } : false} animate={{ y, height: Math.max(h, v === 0 ? 0 : 2) }} transition={anim(m)} />
            {showValue && h > 0 && (
              <motion.text x={X(m)} textAnchor="middle" fontSize={fs(above ? 15 : 15)} fontWeight={800} fill={above ? (m === 0 ? FOREST : ORANGE_DEEP) : RED}
                initial={motionOn ? { opacity: 0, y: above ? Y0 - 8 : Y0 + 22 } : false}
                animate={{ opacity: 1, y: above ? y - 9 : y + h + fs(20) }} transition={anim(m)}>
                {above ? kMoney(v) : `short ${kMoney(-v).replace('−', '')}`}
              </motion.text>
            )}
            {(m % labelEvery === 0 || m === n) && (
              <text x={X(m)} y={yBot + fs(30)} fontSize={fs(16)} fill={m === 0 ? FOREST : MUTED} fontWeight={m === 0 ? 800 : 500} textAnchor="middle">{monthName(m)}</text>
            )}
          </g>
        )
      })}

      {/* when it runs out */}
      {emptyAt !== null && emptyAt > 0 && (() => {
        const xe = X(emptyAt)
        const lx = clamp(xe, x0 + 90 * k, x1 - 90 * k)
        return (
          <motion.g initial={motionOn ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: motionOn ? 0.15 + Math.min(1.6, emptyAt * 0.18) + 0.3 : 0, duration: 0.3 }}>
            <line x1={xe} x2={xe} y1={yTop - 6} y2={Y0 + 3} stroke={RED} strokeWidth={2.5} strokeDasharray="7 6" />
            <path d={`M${xe - 9} ${Y0 + 14} L${xe + 9} ${Y0 + 14} L${xe} ${Y0 + 3} Z`} fill={RED} />
            <text x={lx} y={yTop - 14} fontSize={fs(17)} fontWeight={800} fill={RED} textAnchor="middle">Empty in month {emptyAt.toFixed(1)}</text>
          </motion.g>
        )
      })()}

      {/* the answer in words */}
      <text x={W / 2} y={H - 16} fontSize={fs(narrow ? 15 : 19)} fontWeight={800} fill={emptyAt === null ? FOREST : RED} textAnchor="middle">
        {narrow && verdict.length > 52 ? (v => v[0].toUpperCase() + v.slice(1))(verdict.replace(/^Does not make it: /, '')) : verdict}
      </text>
    </svg>
  )
}
