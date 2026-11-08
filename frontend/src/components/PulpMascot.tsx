import { useEffect, useRef, useState, type CSSProperties } from 'react'
import './pulp-mascot.css'

export type PipMood = 'idle' | 'thinking' | 'listening'

export function Tangerine({ className = '', mood = 'idle' }: { className?: string; mood?: PipMood }) {
  return (
    <svg className={`tangerine-mascot ${className} mood-${mood}`} viewBox="0 0 180 172" role="img" aria-label="Pulp, your little tangerine companion">
      <defs>
        <radialGradient id="pip-skin" cx="32%" cy="27%" r="80%"><stop offset="0" stopColor="#ffbd5e" /><stop offset=".55" stopColor="#ff9136" /><stop offset="1" stopColor="#ed6b21" /></radialGradient>
      </defs>
      <ellipse className="pip-shadow" cx="89" cy="155" rx="43" ry="6" fill="#d3c6ae" opacity=".2" />
      <g className="pip-body">
        <path d="M65 140q-5 11-15 9m62-9q6 11 16 9" fill="none" stroke="#85492d" strokeWidth="5" strokeLinecap="round" />
        <path d="M37 96q-15 5-16 17m122-17q15 4 17-8" fill="none" stroke="#d97535" strokeWidth="5" strokeLinecap="round" />
        <path d="M88 47C31 30 14 88 39 123c18 28 79 29 101-1 28-40 0-86-52-75Z" fill="url(#pip-skin)" />
        <path d="M45 72q10-17 29-17" stroke="#ffe1aa" strokeWidth="5" opacity=".7" strokeLinecap="round" fill="none" />
        <g fill="#c95c20" opacity=".25"><circle cx="49" cy="110" r="1.3" /><circle cx="56" cy="124" r="1.2" /><circle cx="125" cy="119" r="1.4" /><circle cx="132" cy="79" r="1.3" /><circle cx="112" cy="135" r="1" /><circle cx="71" cy="135" r="1.3" /></g>
        <path d="M88 47q-4-15 2-22" stroke="#665337" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path className="pip-leaf" d="M90 36c7-25 33-23 44-16-3 21-29 27-44 16Z" fill="#526d42" />
        <path d="m94 35 26-10" stroke="#91a76c" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <g className="pip-eyes" fill="#4f3527"><ellipse cx="71" cy="94" rx="3.5" ry="5" /><ellipse cx="108" cy="94" rx="3.5" ry="5" /></g>
        <g className="pip-cheeks" fill="#e96938" opacity=".4"><ellipse cx="59" cy="105" rx="7" ry="4" /><ellipse cx="120" cy="105" rx="7" ry="4" /></g>
        <path d="M81 108q9 9 18 0" stroke="#633d26" strokeWidth="2.5" fill="none" strokeLinecap="round" />
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

const INTRO_KEY = 'pulp-intro-seen'
const INTRO_DURATION_MS = 2000
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
        <svg className="harvest-film" viewBox="0 0 600 390" role="img" aria-label="A tangerine is picked from a tree, gently squeezed, and pours juice and pulp into a glass.">
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
