import { useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

/* Shared helpers for the stage visuals. Every visual is an SVG in a 1000 x 560 box that scales with the canvas.
   The stage is a deep forest; type is cream, money is juice-orange, good news is mint, running dry is rose. */
export const W = 1000
export const H = 560
export const ORANGE = '#F97316'
export const JUICE_LIGHT = '#FB923C'
export const JUICE_DARK = '#EA580C'
export const ORANGE_SOFT = '#FFD7B5'
export const FOREST = '#183B2D'
export const FOREST_DEEP = '#0F2A20'
export const INK = '#183B2D'          // primary type on the light figure
export const MUTED = '#6E7A70'        // secondary type
export const LINE = '#E3E8DF'
export const MINT = '#2F7A5B'
export const ROSE = '#C2410C'
/* Older names kept so the visuals read the same; mapped onto the dark palette. */
export const GRAY = MUTED
export const DANGER = ROSE
export const EMERALD = MINT

export const money = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)
export const pct = (x: number) => `${Math.round(x * 100)}%`
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
export const spring = { duration: 0.5, ease: 'easeOut' } as const

/* ---------------------------------------------------------------- axes shared by the chart-like visuals */
/** Round tick values covering lo..hi (about `count` steps of 1, 2, 2.5 or 5 x 10^k). */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo || 1
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}
/** "$12k", "$850", "−$1.2k": short dollar labels for axes. */
export const kMoney = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '−' : ''
  return a >= 10000 ? `${s}$${Math.round(a / 1000)}k` : a >= 1000 ? `${s}$${(a / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${s}$${Math.round(a)}`
}
/** Horizontal gridlines with dollar labels on the left, a stronger $0 line and an optional axis title. */
export function DollarAxis({ x, x2, lo, hi, Y, title }: { x: number; x2: number; lo: number; hi: number; Y: (v: number) => number; title?: string }) {
  const ticks = niceTicks(lo, hi, 4).filter((v) => Y(v) >= Y(hi) - 1 && Y(v) <= Y(lo) + 1)
  return (
    <g aria-hidden="true">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={x} x2={x2} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? '#9AA093' : LINE} strokeWidth={v === 0 ? 2 : 1.2} strokeDasharray={v === 0 ? '6 6' : undefined} />
          <text x={x - 10} y={Y(v) + 5} fontSize={14} fill={MUTED} textAnchor="end">{kMoney(v)}</text>
        </g>
      ))}
      {title && <text x={x - 10} y={Y(hi) - 14} fontSize={14} fill={MUTED} textAnchor="end" fontWeight={700}>{title}</text>}
    </g>
  )
}
/** Month ticks along the bottom with "now", "m3"... and an axis title. */
export function MonthAxis({ x0, x1, y, months, title = 'months from now', start = 0 }: { x0: number; x1: number; y: number; months: number; title?: string; start?: number }) {
  const span = Math.max(1, months)
  const every = span <= 12 ? 1 : span <= 24 ? 3 : span <= 48 ? 6 : 12
  const X = (m: number) => x0 + (m / span) * (x1 - x0)
  const ticks: number[] = []
  for (let m = 0; m <= span; m += every) ticks.push(m)
  if (ticks[ticks.length - 1] !== span) ticks.push(span)
  const name = (m: number) => (start === 0 ? (m === 0 ? 'now' : `m${m}`) : m === span ? 'now' : `−${span - m}`)
  return (
    <g aria-hidden="true">
      <line x1={x0} x2={x1} y1={y} y2={y} stroke="#9AA093" strokeWidth={1.5} />
      {ticks.map((m) => (
        <g key={m}>
          <line x1={X(m)} x2={X(m)} y1={y} y2={y + 6} stroke="#9AA093" strokeWidth={1.5} />
          <text x={X(m)} y={y + 22} fontSize={14} fill={MUTED} textAnchor="middle">{name(m)}</text>
        </g>
      ))}
      {title && <text x={x1} y={y + 42} fontSize={14} fill={MUTED} textAnchor="end">{title} →</text>}
    </g>
  )
}

export function useMotionScale(): number {
  const reduced = useReducedMotion()
  return reduced ? 0 : 1
}

/* Gradients and glow filters every visual can use: url(#juice), url(#juice-v), url(#mint-v), filter="url(#glow)". */
export function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg className="stage-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <defs>
        {/* light theme: one subtle orange gradient, mint as a flat marker, and the glow filters are identities */}
        <linearGradient id="juice" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor={JUICE_LIGHT} /><stop offset="1" stopColor={ORANGE} /></linearGradient>
        <linearGradient id="juice-v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={JUICE_LIGHT} /><stop offset="1" stopColor={ORANGE} /></linearGradient>
        <linearGradient id="mint-v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={MINT} /><stop offset="1" stopColor={MINT} /></linearGradient>
        <filter id="glow"><feMerge><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <filter id="glow-soft"><feMerge><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {children}
    </svg>
  )
}

/* A tangerine-juice cup: glass on the dark stage, a liquid level that eases to `level` (0..1) and sloshes. */
export function Cup({ x, y, w = 220, h = 260, level, label, sub, delay = 0, tone = 'juice' }: { x: number; y: number; w?: number; h?: number; level: number; label?: string; sub?: string; delay?: number; tone?: 'juice' | 'rose' }) {
  const lv = clamp(level, 0, 1)
  const inset = w * 0.12
  const liquidTop = y + h - lv * (h - 12)
  const lw = w - 2 * inset * (1 - lv) * 0.6
  const id = `cup-clip-${Math.round(x)}-${Math.round(y)}`
  const fill = tone === 'rose' ? ROSE : 'url(#juice-v)'
  return (
    <g className="stage-cup">
      <defs>
        <clipPath id={id}>
          <path d={`M${x} ${y} L${x + w} ${y} L${x + w - inset} ${y + h} L${x + inset} ${y + h} Z`} />
        </clipPath>
      </defs>
      <path d={`M${x} ${y} L${x + w} ${y} L${x + w - inset} ${y + h} L${x + inset} ${y + h} Z`} fill="#FFFDF8" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <g clipPath={`url(#${id})`}>
        <rect className="stage-liquid" x={x - 10} y={liquidTop} width={w + 20} height={h} fill={fill} style={{ transition: `y 1.1s cubic-bezier(.2,.8,.2,1) ${delay}s`, transitionProperty: 'y' }} />
        <g className="stage-slosh" style={{ transformOrigin: `${x + w / 2}px ${liquidTop}px` }}>
          <path className="stage-wave" d={`M${x - 40} ${liquidTop} q 25 -9 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 V ${liquidTop + 40} H ${x - 40} Z`} fill={fill} style={{ transition: `d 1.1s ${delay}s` }} />
        </g>
        {[0, 1, 2, 3].map((i) => <circle key={i} className="stage-pulp" cx={x + inset + 30 + i * (lw / 4)} cy={liquidTop + 30 + (i % 2) * 40} r={6} fill="#FFE1C7" opacity={lv > 0.05 ? 0.8 : 0} />)}
      </g>
      <path d={`M${x} ${y} L${x + w} ${y}`} stroke={INK} strokeWidth={4} strokeLinecap="round" />
      {label && <text x={x + w / 2} y={y - 20} textAnchor="middle" fontSize={24} fontWeight={800} fill={INK} fontFamily="Manrope, DM Sans, sans-serif">{label}</text>}
      {sub && <text x={x + w / 2} y={y + h + 36} textAnchor="middle" fontSize={16} fill={MUTED}>{sub}</text>}
    </g>
  )
}

/* A flowing stream: a thick dashed path whose dashes move, with a soft glow underneath. Width scales with the amount. */
export function Stream({ d, width, color = ORANGE, speed = 1, opacity = 0.9, glow = false }: { d: string; width: number; color?: string; speed?: number; opacity?: number; glow?: boolean }) {
  return (
    <g>
      {glow && <path d={d} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={width + 10} strokeLinecap="round" />}
      <path className="stage-stream" d={d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={width} strokeLinecap="round" strokeDasharray="30 18" style={{ animationDuration: `${1.5 / speed}s` }} />
    </g>
  )
}

export function Label({ x, y, children, size = 16, color = MUTED, anchor = 'start', weight = 500, family }: { x: number; y: number; children: React.ReactNode; size?: number; color?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; family?: string }) {
  // inline figures render at about half the viewBox scale, so small labels get a floor
  return <text x={x} y={y} fontSize={Math.max(size, 14)} fill={color} textAnchor={anchor} fontWeight={weight} fontFamily={family}>{children}</text>
}

/* Big display number in Manrope. */
export function Big({ x, y, children, size = 40, color = INK, anchor = 'start' }: { x: number; y: number; children: React.ReactNode; size?: number; color?: string; anchor?: 'start' | 'middle' | 'end' }) {
  return <text x={x} y={y} fontSize={size} fill={color} textAnchor={anchor} fontWeight={800} fontFamily="Manrope, DM Sans, sans-serif" letterSpacing={-1}>{children}</text>
}

/* Count-up number that eases from `from` to `to` on mount. */
export function useCountUp(to: number, from = 0, ms = 1200): number {
  const scale = useMotionScale()
  const [v, setV] = useState(scale ? from : to)
  useEffect(() => {
    if (!scale) { setV(to); return }
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = clamp((t - t0) / ms, 0, 1)
      const e = 1 - Math.pow(1 - k, 3)
      setV(from + (to - from) * e)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, from, ms, scale])
  return v
}

/* Wrap numbers in a caption so they can be coloured: $1,234 · 55% · 5.6 months. */
export const NUMBER_RE = /(\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s(?:months?|days?|weeks?|years?|hours?)\b|\b\d[\d,]*(?:\.\d+)?\b)/g
export function highlightNumbers(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(NUMBER_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push(text.slice(last, i))
    out.push(<span key={i} className="num">{m[0]}</span>)
    last = i + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
