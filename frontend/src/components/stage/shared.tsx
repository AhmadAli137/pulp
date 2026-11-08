import { useReducedMotion } from 'framer-motion'

/* Shared helpers for the stage visuals. Every visual is an SVG in a 1000 x 560 box that scales with the canvas. */
export const W = 1000
export const H = 560
export const ORANGE = '#F97316'
export const ORANGE_SOFT = '#FFE1C7'
export const FOREST = '#183B2D'
export const MINT = '#E8EDDE'
export const GRAY = '#7C8177'
export const LINE = '#E9ECE4'
export const DANGER = '#C2410C'
export const EMERALD = '#2F7A5B'

export const money = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)
export const pct = (x: number) => `${Math.round(x * 100)}%`
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

export function useMotionScale(): number {
  const reduced = useReducedMotion()
  return reduced ? 0 : 1
}

export function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg className="stage-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {children}
    </svg>
  )
}

/* A tangerine-juice cup: trapezoid with a liquid level that eases to `level` (0..1). */
export function Cup({ x, y, w = 220, h = 260, level, label, sub, delay = 0 }: { x: number; y: number; w?: number; h?: number; level: number; label?: string; sub?: string; delay?: number }) {
  const lv = clamp(level, 0, 1)
  const inset = w * 0.12
  const liquidTop = y + h - lv * (h - 12)
  const lw = w - 2 * inset * (1 - lv) * 0.6
  return (
    <g className="stage-cup">
      <defs>
        <clipPath id={`cup-clip-${x}-${y}`}>
          <path d={`M${x} ${y} L${x + w} ${y} L${x + w - inset} ${y + h} L${x + inset} ${y + h} Z`} />
        </clipPath>
      </defs>
      <path d={`M${x} ${y} L${x + w} ${y} L${x + w - inset} ${y + h} L${x + inset} ${y + h} Z`} fill="#FFF8F1" stroke={FOREST} strokeWidth={5} strokeLinejoin="round" />
      <g clipPath={`url(#cup-clip-${x}-${y})`}>
        <rect className="stage-liquid" x={x - 10} y={liquidTop} width={w + 20} height={h} fill={ORANGE} style={{ transition: `y 1.6s cubic-bezier(.2,.8,.2,1) ${delay}s`, transitionProperty: 'y' }} />
        <path className="stage-wave" d={`M${x - 10} ${liquidTop} q 25 -8 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0`} fill={ORANGE} style={{ transition: `d 1.6s ${delay}s` }} />
        {[0, 1, 2, 3].map((i) => <circle key={i} className="stage-pulp" cx={x + inset + 30 + i * (lw / 4)} cy={liquidTop + 30 + (i % 2) * 40} r={5} fill="#FFD4AE" opacity={lv > 0.05 ? 0.9 : 0} />)}
      </g>
      {label && <text x={x + w / 2} y={y - 18} textAnchor="middle" fontSize={22} fontWeight={700} fill={FOREST} fontFamily="Manrope, DM Sans, sans-serif">{label}</text>}
      {sub && <text x={x + w / 2} y={y + h + 34} textAnchor="middle" fontSize={16} fill={GRAY}>{sub}</text>}
    </g>
  )
}

/* A flowing stream: a thick dashed path whose dashes move. Width scales with the amount. */
export function Stream({ d, width, color = ORANGE, speed = 1, opacity = 0.9 }: { d: string; width: number; color?: string; speed?: number; opacity?: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={width + 10} strokeLinecap="round" />
      <path className="stage-stream" d={d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={width} strokeLinecap="round" strokeDasharray="28 18" style={{ animationDuration: `${1.6 / speed}s` }} />
    </g>
  )
}

export function Label({ x, y, children, size = 16, color = GRAY, anchor = 'start', weight = 500 }: { x: number; y: number; children: React.ReactNode; size?: number; color?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number }) {
  return <text x={x} y={y} fontSize={size} fill={color} textAnchor={anchor} fontWeight={weight}>{children}</text>
}

/* Count-up number that eases from `from` to `to` using CSS-free JS tweening on mount. */
import { useEffect, useState } from 'react'
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
