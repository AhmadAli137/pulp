/* The floating Pulp button: bigger, labelled, and alive. Every so often Pulp shows an expression (a wave, a nod, a small
   hop of joy) and, a few times per visit, peeks out with a hint about the page you are on. Hints are dismissible and
   stop once you have opened Pulp; reduced motion keeps Pulp still and quiet. */
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Tangerine, type PipMood } from '../PulpMascot'

const HINTS: Record<string, string[]> = {
  '/': ['Want the short version of your month?', 'Ask me what to fix first.'],
  '/shock': ['Tell me a shock in your own words.', 'Try: “a hospital bill of $4,000”.'],
  '/plan': ['Ask me why this plan leads.', 'Want a plan that keeps more cushion?'],
  '/insights': ['Ask me what this means for you.', 'Curious who you are most like?'],
  '/profile': ['Tell me a goal and I will add it.', 'Something changed? Just say it.'],
  '/tour': ['Want to try it for real? Talk to me.'],
}
const FALLBACK = ['Ask me anything about your money.', 'You can talk to me out loud, too.']
const EXPRESSIONS: PipMood[] = ['wave', 'nod', 'celebrate', 'wave', 'nod']
const HINT_KEY = 'pulp.hints.seen'

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const hintsSeen = () => { try { return Number(sessionStorage.getItem(HINT_KEY) || 0) } catch { return 0 } }
const markHint = (n: number) => { try { sessionStorage.setItem(HINT_KEY, String(n)) } catch { /* ignore */ } }

export default function PulpLauncher({ mood, working, ready, onOpen }: { mood: PipMood; working: boolean; ready: boolean; onOpen: () => void }) {
  const { pathname } = useLocation()
  const [expression, setExpression] = useState<PipMood | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [hop, setHop] = useState(0)
  const opened = useRef(false)
  const shown = useRef(hintsSeen())

  // Occasional expressions while idle: every 11 to 19 seconds, for about 1.6 seconds
  useEffect(() => {
    if (reducedMotion() || mood !== 'idle') return
    let t = 0, back = 0, k = 0
    const next = () => {
      t = window.setTimeout(() => {
        setExpression(EXPRESSIONS[k++ % EXPRESSIONS.length]); setHop((h) => h + 1)
        back = window.setTimeout(() => { setExpression(null); next() }, 1600)
      }, 11000 + Math.random() * 8000)
    }
    next()
    return () => { clearTimeout(t); clearTimeout(back) }
  }, [mood])

  // A hint peeks out a few times per visit: first after 6 s on a page, then about every 50 s, at most 4 in all
  useEffect(() => {
    setHint(null)
    if (!ready || opened.current) return
    const lines = HINTS[pathname] ?? FALLBACK
    let i = 0, t = 0, hide = 0
    const peek = (delay: number) => {
      t = window.setTimeout(() => {
        if (opened.current || shown.current >= 4) return
        setHint(lines[i++ % lines.length]); shown.current += 1; markHint(shown.current)
        if (!reducedMotion()) setExpression('wave')
        hide = window.setTimeout(() => { setHint(null); setExpression(null); peek(50000) }, 6500)
      }, delay)
    }
    peek(6000)
    return () => { clearTimeout(t); clearTimeout(hide) }
  }, [pathname, ready])

  const open = () => { opened.current = true; setHint(null); onOpen() }
  const face = mood !== 'idle' ? mood : expression ?? 'idle'
  return (
    <div className="pulp-launcher-wrap">
      {hint && (
        <div className="pulp-peek" role="status">
          <button type="button" className="pulp-peek-text" onClick={open}>{hint}</button>
          <button type="button" className="pulp-peek-x" aria-label="Dismiss hint" onClick={() => { setHint(null); shown.current = 4; markHint(4) }}><X size={13} /></button>
        </div>
      )}
      <button type="button" className={`pulp-launcher${working ? ' is-working' : ''}`} aria-label="Talk to Pulp" aria-expanded={false} aria-controls="pulp-panel" onClick={open}>
        <span key={hop} className={`pulp-launcher-face${expression ? ' is-hop' : ''}`}><Tangerine mood={face} /></span>
        <span className="pulp-launcher-label" aria-hidden="true">Ask Pulp</span>
        {working && <i className="pulp-launcher-dot" aria-hidden="true" />}
      </button>
    </div>
  )
}
