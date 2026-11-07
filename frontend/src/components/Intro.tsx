import { useEffect, useState } from 'react'

/* Intro: a tangerine is picked from the tree, squeezed, juice and pulp fill a cup, then the logo and slogan. */
const KEY = 'pulp.intro.seen'

export function introSeen(): boolean { try { return sessionStorage.getItem(KEY) === '1' } catch { return false } }
export function markIntroSeen() { try { sessionStorage.setItem(KEY, '1') } catch { /* ignore */ } }

export default function Intro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => { markIntroSeen(); onDone() }, reduce ? 1200 : 6400)
    const ticks = [1200, 2400, 3900, 5200].map((ms, i) => setTimeout(() => setPhase(i + 1), reduce ? 0 : ms))
    return () => { clearTimeout(t); ticks.forEach(clearTimeout) }
  }, [onDone])
  return (
    <div className="intro" role="dialog" aria-label="PULP intro">
      <div className="intro-stage" aria-hidden>
        <svg viewBox="0 0 400 300" width="100%" height="100%">
          {/* ground */}
          <ellipse cx="200" cy="268" rx="190" ry="14" fill="#E8EDDE" />
          {/* tree */}
          <g className="tree">
            <rect x="60" y="150" width="18" height="100" rx="6" fill="#6B4A1E" />
            <circle cx="70" cy="120" r="54" fill="#2F7A5B" />
            <circle cx="40" cy="140" r="34" fill="#35865F" />
            <circle cx="104" cy="138" r="36" fill="#2A6E51" />
            <circle cx="46" cy="104" r="9" fill="#F97316" /><circle cx="94" cy="98" r="9" fill="#F97316" /><circle cx="108" cy="150" r="9" fill="#F97316" />
          </g>
          {/* hand */}
          <g className="hand">
            <path d="M0 0 C 10 -8, 26 -8, 34 2 L 34 24 C 26 34, 10 34, 2 24 Z" fill="#F2C9A3" transform="translate(120 70)" />
          </g>
          {/* the tangerine */}
          <g className="tangerine">
            <circle r="16" fill="#F97316" />
            <circle r="16" fill="url(#shine)" />
            <path d="M-2 -16 C 4 -26, 16 -24, 20 -18 C 12 -14, 4 -14, -2 -16 Z" fill="#2F7A5B" />
          </g>
          {/* juice drops */}
          <g className="drops">
            <circle className="drop d1" cx="200" cy="150" r="4" fill="#F97316" />
            <circle className="drop d2" cx="194" cy="150" r="3" fill="#FFA14A" />
            <circle className="drop d3" cx="206" cy="150" r="3.5" fill="#F97316" />
            <circle className="drop d4" cx="199" cy="150" r="2.5" fill="#FFB27A" />
          </g>
          {/* cup */}
          <g className="cup">
            <clipPath id="cupClip"><path d="M168 170 L 232 170 L 224 250 L 176 250 Z" /></clipPath>
            <g clipPath="url(#cupClip)"><rect className="juice" x="160" y="250" width="80" height="90" fill="#F97316" /></g>
            <g className="pulp" clipPath="url(#cupClip)" fill="#FFD2A8">
              <circle cx="186" cy="236" r="2.5" /><circle cx="210" cy="228" r="2" /><circle cx="198" cy="244" r="2.2" /><circle cx="216" cy="242" r="1.8" /><circle cx="190" cy="220" r="1.6" />
            </g>
            <path d="M168 170 L 232 170 L 224 250 L 176 250 Z" fill="none" stroke="#252920" strokeWidth="3" strokeLinejoin="round" />
            <path d="M164 170 L 236 170" stroke="#252920" strokeWidth="3" strokeLinecap="round" />
            <path d="M232 185 C 252 185, 252 220, 228 222" fill="none" stroke="#252920" strokeWidth="3" strokeLinecap="round" />
          </g>
          <defs>
            <radialGradient id="shine" cx="35%" cy="30%" r="60%"><stop offset="0%" stopColor="#fff" stopOpacity="0.45" /><stop offset="100%" stopColor="#fff" stopOpacity="0" /></radialGradient>
          </defs>
        </svg>
      </div>
      <div className={`intro-brand${phase >= 4 ? ' show' : ''}`}>
        <div className="intro-logo">PULP<span>.</span></div>
        <div className="intro-slogan">Planning Under Life's Pressures</div>
        <div className="intro-sub">Prepare for what comes next.</div>
      </div>
      <div className="intro-caption" aria-live="polite">
        {['Picking a tangerine…', 'Picking a tangerine…', 'Squeezing…', 'Juice and pulp into the cup…', ''][phase]}
      </div>
      <button className="intro-skip" onClick={() => { markIntroSeen(); onDone() }}>Skip</button>
    </div>
  )
}
