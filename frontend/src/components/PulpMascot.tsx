import { useEffect, useRef, useState, type CSSProperties } from 'react'
import './pulp-mascot.css'

export type PipMood = 'idle' | 'thinking' | 'listening' | 'celebrate' | 'concerned'
export type PulpMood = PipMood

/* Pulp, drawn flat: one tangerine shape, a soft segment highlight, a small stem and leaf, and simple dot eyes.
   Moods change the face (celebrate: a short hop with citrus sparks and a smile; concerned: brows down, a small frown,
   one slow droop). Reduced motion keeps the expression and drops the movement. */
export function Tangerine({ className = '', mood = 'idle', label = 'Pulp' }: { className?: string; mood?: PipMood; label?: string }) {
  const mouth = mood === 'celebrate' ? 'M78 104q12 13 24 0' : mood === 'concerned' ? 'M80 110q10-7 20 0' : 'M81 105q9 7 18 0'
  return (
    <svg className={`tangerine-mascot ${className} mood-${mood}`} viewBox="0 0 180 172" role="img" aria-label={label}>
      <ellipse className="pip-shadow" cx="90" cy="156" rx="42" ry="5" fill="#cfc6b2" opacity=".35" />
      {mood === 'celebrate' && (
        <g className="pip-sparks" aria-hidden="true">
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <path key={a} className="pip-spark" style={{ ['--a' as string]: `${a}deg` }} d="M90 22q5 6 0 12q-5-6 0-12Z" fill={a % 120 === 0 ? '#F28C28' : '#F7B267'} />
          ))}
        </g>
      )}
      <g className="pip-body">
        <path d="M90 46c-30-2-58 18-60 50-2 30 24 54 60 54s62-24 60-54c-2-32-30-52-60-50Z" fill="#F28C28" />
        <path d="M90 46c-30-2-58 18-60 50-1 14 4 26 13 35-4-30 12-62 47-85Z" fill="#F7A650" opacity=".55" />
        <path d="M58 70q10-12 24-14" stroke="#FFE2BF" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".75" />
        <path d="M90 47v-11" stroke="#5E4A33" strokeWidth="4.5" strokeLinecap="round" />
        <path className="pip-leaf" d="M92 38c6-15 22-18 32-13-4 13-19 19-32 13Z" fill="#5E7A4A" />
        {mood === 'concerned' && <g stroke="#4A3426" strokeWidth="2.6" strokeLinecap="round"><path d="M64 82l12 4" /><path d="M116 82l-12 4" /></g>}
        <g className="pip-eyes" fill="#3F2C20">
          {mood === 'celebrate'
            ? <><path d="M65 93q5-6 10 0" stroke="#3F2C20" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M105 93q5-6 10 0" stroke="#3F2C20" strokeWidth="3" fill="none" strokeLinecap="round" /></>
            : <><circle cx="70" cy="94" r="4" /><circle cx="110" cy="94" r="4" /></>}
        </g>
        <path className="pip-mouth" d={mouth} stroke="#5A3622" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  )
}

export function PulpMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M7 21a13 13 0 0 0 26 0H7Z" fill="#ef8238" />
      <path d="M20 22v10m-1-10-7 7m9-7 7 7" stroke="#fffaf1" strokeWidth="2" />
      <path d="M19 16c1-9 9-12 15-10-1 9-8 14-15 10Z" fill="#61724c" />
      <circle cx="9" cy="13" r="2" fill="#ef8238" />
    </svg>
  )
}

/** A single drop of juice: the mark for places where Pulp interprets ("Pulp's read"). */
export function JuiceDrop({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`juice-drop ${className}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5C6 5 3.5 7.6 3.5 10.2a4.5 4.5 0 0 0 9 0C12.5 7.6 10 5 8 1.5Z" fill="#F28C28" />
      <path d="M6 10.4a2 2 0 0 0 1.6 2" stroke="#FFE2BF" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** Line-art press: records go in at the top, a drop of insight comes out below. */
export function PressIcon({ size = 34, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`press-icon ${className}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="11" y="3" width="18" height="6" rx="1.5" stroke="#183B2D" strokeWidth="1.6" />
      <path d="M14 5.5h12M14 7.5h8" stroke="#A0A598" strokeWidth="1" />
      <path d="M20 9v4" stroke="#183B2D" strokeWidth="1.6" />
      <path d="M9 13h22l-4 9H13Z" stroke="#183B2D" strokeWidth="1.6" fill="#FFF1E6" />
      <path d="M17 22v2.5h6V22" stroke="#183B2D" strokeWidth="1.6" />
      <path className="press-drop" d="M20 27c-1.4 2.2-2.6 3.6-2.6 5a2.6 2.6 0 0 0 5.2 0c0-1.4-1.2-2.8-2.6-5Z" fill="#F28C28" />
    </svg>
  )
}

/** Loading state in the brand voice: a small press with a drip, and a line such as "Squeezing your records…". */
export function SqueezeLoader({ label = 'Squeezing your records…', className = '' }: { label?: string; className?: string }) {
  return (
    <p className={`squeeze-loader ${className}`} role="status"><PressIcon size={26} className="pressing" /><span>{label}</span></p>
  )
}

const INTRO_KEY = 'pulp-intro-seen'
const INTRO_DURATION_MS = 1700
export function introSeen(): boolean { try { return sessionStorage.getItem(INTRO_KEY) === '1' } catch { return false } }
export function markIntroSeen() { try { sessionStorage.setItem(INTRO_KEY, '1') } catch { /* ignore */ } }
export function clearIntroSeen() { try { sessionStorage.removeItem(INTRO_KEY) } catch { /* ignore */ } }

export function HarvestIntro({ onDone }: { onDone: () => void }) {
  const callback = useRef(onDone)
  const skip = useRef<HTMLButtonElement>(null)
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  callback.current = onDone
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    skip.current?.focus()
    const timer = setTimeout(() => callback.current(), reduced ? 350 : INTRO_DURATION_MS)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') callback.current() }
    document.addEventListener('keydown', key)
    return () => { clearTimeout(timer); document.removeEventListener('keydown', key); previous?.focus?.() }
  }, [reduced])
  return (
    <div className={`harvest-intro ${reduced ? 'reduced' : ''}`} role="dialog" aria-modal="true" aria-label="PULP opening animation"
      style={{ '--harvest-duration': `${INTRO_DURATION_MS}ms` } as CSSProperties}>
      <span className="intro-corner"><PulpMark size={23} /> A little care goes a long way.</span>
      <div className="harvest-center">
        <svg className="harvest-film" viewBox="0 0 600 390" role="img" aria-label="A tangerine is gently squeezed and pours juice and pulp into a glass.">
          <defs><clipPath id="glass-inside"><path d="M260 226h80l-9 100q-31 10-62 0Z" /></clipPath><linearGradient id="juice-color" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffc464" /><stop offset="1" stopColor="#f29035" /></linearGradient></defs>
          <g className="orchard-scene">
            <ellipse cx="199" cy="343" rx="137" ry="9" fill="#dedcca" opacity=".35" />
            <path d="M180 330q19-91 9-171m3 82q51-76 150-118m-151 77q-57-14-80-59" fill="none" stroke="#9b7650" strokeWidth="13" strokeLinecap="round" />
            <path d="M85 162C28 140 52 76 99 74c-10-50 70-76 106-35 44-37 114-1 102 46 63 6 71 70 26 93-35 18-57 9-83 8-63 41-123 22-165-24Z" fill="#dee5c9" />
            <path d="M95 125q85-74 205-4" fill="none" stroke="#b8c69b" strokeWidth="2" />
            <path d="M196 87q-5 48-1 81m-78-63 31 17m104-40-17 28m49 28 23 19" fill="none" stroke="#b8c69b" strokeWidth="2" strokeLinecap="round" />
            <g fill="#f6a04f"><circle cx="117" cy="105" r="13" /><circle cx="218" cy="65" r="11" /><circle cx="261" cy="152" r="13" /></g>
            <path d="M301 120q22 12 49-4" fill="none" stroke="#9b7650" strokeWidth="4" strokeLinecap="round" />
            <path d="M332 106q13-24 29-14-4 15-29 14" fill="#6d8652" />
          </g>
          <g className="picking-hand"><path d="m470 60-59 13q-15 2-24 13l-24 27q-8 12 1 17 5 4 13-5l12-13-8 21q-3 10 6 12 6 1 11-10l13-23q6-9 17-9l48-1" fill="#f2dfc8" stroke="#bf9e7b" strokeWidth="2.5" strokeLinejoin="round" /><path d="m464 57 11 48 45-4-11-54Z" fill="#e5e5d8" stroke="#b8bcaa" strokeWidth="2" /></g>
          <g className="picked-fruit"><path d="M351 109q-5-13-1-20" stroke="#735a3a" strokeWidth="4" fill="none" /><ellipse cx="350" cy="137" rx="34" ry="30" fill="#f89a42" /><path d="M329 124q7-11 18-11" stroke="#ffd599" strokeWidth="4" fill="none" strokeLinecap="round" /><path d="M350 106q7-18 24-12-5 17-24 12" fill="#69834b" /></g>
          <g className="squeeze-hands"><path className="left-squeeze" d="m188 139 38 2q9 0 15 10l14 23q5 9-1 13-7 4-13-5l-10-12 6 25q3 11-5 13-7 2-11-11l-7-23-34-7Z" fill="#f2dfc8" stroke="#bf9e7b" strokeWidth="2" /><path className="right-squeeze" d="m412 139-38 2q-9 0-15 10l-14 23q-5 9 1 13 7 4 13-5l10-12-6 25q-3 11 5 13 7 2 11-11l7-23 34-7Z" fill="#f2dfc8" stroke="#bf9e7b" strokeWidth="2" /></g>
          <g className="juice-stream"><path d="M289 188q-5 27-2 75m23-75q7 35 4 74m-14-69v71" stroke="#f5a544" strokeWidth="5" strokeLinecap="round" fill="none" /><g fill="#ee8c31"><ellipse className="falling-pulp one" cx="293" cy="222" rx="4" ry="6" /><ellipse className="falling-pulp two" cx="306" cy="237" rx="3" ry="5" /><circle className="falling-pulp three" cx="300" cy="253" r="3" /></g></g>
          <g className="juice-glass"><ellipse cx="300" cy="340" rx="59" ry="6" fill="#dcd7c7" opacity=".35" /><path d="M254 220h92l-10 111q-36 12-72 0Z" fill="#fffdf7" stroke="#a3ad98" strokeWidth="2.5" /><g clipPath="url(#glass-inside)"><g className="glass-fill"><rect x="258" y="244" width="86" height="94" fill="url(#juice-color)" /><ellipse cx="300" cy="245" rx="45" ry="5" fill="#ffce79" /><g fill="#e98b31" opacity=".75"><ellipse cx="280" cy="295" rx="4" ry="2" /><ellipse cx="311" cy="309" rx="5" ry="2" /><ellipse cx="302" cy="272" rx="3" ry="2" /><ellipse cx="287" cy="320" rx="4" ry="2" /></g></g></g><path d="m267 236 6 68" stroke="#fff" strokeWidth="3" opacity=".7" strokeLinecap="round" /></g>
        </svg>
        <div className="intro-wordmark"><PulpMark size={58} /><h1>PULP<span>.</span></h1><p>Prepare for what comes next.</p></div>
        <div className="harvest-captions" aria-hidden="true"><span>A little care.</span><span>A fresh perspective.</span></div>
      </div>
      <div className="intro-bottom"><span>PLANNING UNDER LIFE’S PRESSURES</span><button ref={skip} onClick={onDone}>Skip intro <span aria-hidden="true">↗</span></button></div>
    </div>
  )
}
