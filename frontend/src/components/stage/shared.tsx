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
export const INK = '#FBF6EE'          // primary type on the dark stage
export const MUTED = '#A9B8AD'        // secondary type
export const LINE = 'rgba(251,246,238,0.16)'
export const MINT = '#A7F3D0'
export const ROSE = '#FB7185'
/* Older names kept so the visuals read the same; mapped onto the dark palette. */
export const GRAY = MUTED
export const DANGER = ROSE
export const EMERALD = MINT

export const money = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)
export const pct = (x: number) => `${Math.round(x * 100)}%`
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
export const spring = { type: 'spring', stiffness: 170, damping: 22 } as const

export function useMotionScale(): number {
  const reduced = useReducedMotion()
  return reduced ? 0 : 1
}

/* Gradients and glow filters every visual can use: url(#juice), url(#juice-v), url(#mint-v), filter="url(#glow)". */
export function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg className="stage-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="juice" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor={JUICE_LIGHT} /><stop offset="0.55" stopColor={ORANGE} /><stop offset="1" stopColor={JUICE_DARK} /></linearGradient>
        <linearGradient id="juice-v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={JUICE_LIGHT} /><stop offset="1" stopColor={JUICE_DARK} /></linearGradient>
        <linearGradient id="mint-v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#D1FAE5" /><stop offset="1" stopColor="#6EE7B7" /></linearGradient>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <filter id="glow-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
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
      <path d={`M${x} ${y} L${x + w} ${y} L${x + w - inset} ${y + h} L${x + inset} ${y + h} Z`} fill="rgba(255,255,255,0.06)" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <g clipPath={`url(#${id})`}>
        <rect className="stage-liquid" x={x - 10} y={liquidTop} width={w + 20} height={h} fill={fill} style={{ transition: `y 1.6s cubic-bezier(.2,.8,.2,1) ${delay}s`, transitionProperty: 'y' }} />
        <g className="stage-slosh" style={{ transformOrigin: `${x + w / 2}px ${liquidTop}px` }}>
          <path className="stage-wave" d={`M${x - 40} ${liquidTop} q 25 -9 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 V ${liquidTop + 40} H ${x - 40} Z`} fill={fill} style={{ transition: `d 1.6s ${delay}s` }} />
        </g>
        {[0, 1, 2, 3].map((i) => <circle key={i} className="stage-pulp" cx={x + inset + 30 + i * (lw / 4)} cy={liquidTop + 30 + (i % 2) * 40} r={6} fill="#FFE1C7" opacity={lv > 0.05 ? 0.8 : 0} />)}
      </g>
      <path d={`M${x} ${y} L${x + w} ${y}`} stroke={INK} strokeWidth={6} strokeLinecap="round" opacity={0.9} />
      {label && <text x={x + w / 2} y={y - 20} textAnchor="middle" fontSize={24} fontWeight={800} fill={INK} fontFamily="Manrope, DM Sans, sans-serif">{label}</text>}
      {sub && <text x={x + w / 2} y={y + h + 36} textAnchor="middle" fontSize={16} fill={MUTED}>{sub}</text>}
    </g>
  )
}

/* A flowing stream: a thick dashed path whose dashes move, with a soft glow underneath. Width scales with the amount. */
export function Stream({ d, width, color = ORANGE, speed = 1, opacity = 0.95, glow = true }: { d: string; width: number; color?: string; speed?: number; opacity?: number; glow?: boolean }) {
  return (
    <g>
      {glow && <path d={d} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={width + 16} strokeLinecap="round" filter="url(#glow-soft)" />}
      <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={width + 6} strokeLinecap="round" />
      <path className="stage-stream" d={d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={width} strokeLinecap="round" strokeDasharray="30 18" style={{ animationDuration: `${1.5 / speed}s` }} />
    </g>
  )
}

export function Label({ x, y, children, size = 16, color = MUTED, anchor = 'start', weight = 500, family }: { x: number; y: number; children: React.ReactNode; size?: number; color?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; family?: string }) {
  return <text x={x} y={y} fontSize={size} fill={color} textAnchor={anchor} fontWeight={weight} fontFamily={family}>{children}</text>
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
