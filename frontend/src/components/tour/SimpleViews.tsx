/* Simple-view pictures for the "Watch PULP work" tour: juice cups, a press that squeezes plans, a card shuffle, a
   profile card that flips. Every value is passed in from the same data the detailed steps read, so both views agree. */
import { useEffect, useState, type ReactNode } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Briefcase, Home, MessageCircle, RotateCcw, Users } from 'lucide-react'
import { JuiceCups, type Cup } from '../insights/JuiceCups'
import { Tangerine, type PipMood } from '../PulpMascot'

export function CountUp({ to, label, sub }: { to: number; label: string; sub?: string }) {
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? to : 0)
  useEffect(() => {
    if (reduce) { setN(to); return }
    const c = animate(0, to, { duration: 1.1, ease: 'easeOut', onUpdate: (v) => setN(Math.round(v)) })
    return () => c.stop()
  }, [to, reduce])
  return (
    <div className="ts-count">
      <strong>{n.toLocaleString('en-CA')}</strong>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  )
}

/** One line in Pulp's voice, with the mascot. */
export function PulpSays({ children, mood = 'idle' }: { children: ReactNode; mood?: PipMood }) {
  return (
    <div className="ts-says">
      <span className="ts-says-pulp" aria-hidden="true"><Tangerine mood={mood} /></span>
      <p>{children}</p>
    </div>
  )
}

export function Cups({ title, cups, unit = '%', tone }: { title: string; cups: Cup[]; unit?: string; tone?: 'juice' | 'warn' | 'muted' }) {
  return <div className="ts-cups"><JuiceCups title={title} cups={cups} unit={unit} tone={tone} /></div>
}

/** Bank tables sorted into a few plain roles. */
export function RoleSort({ tables, rows, roles }: { tables: number; rows: number; roles: string[] }) {
  const reduce = useReducedMotion()
  return (
    <div className="ts-sort">
      <div className="ts-sort-stack" aria-hidden="true">
        {Array.from({ length: Math.min(tables, 9) }, (_, i) => (
          <motion.i key={i} initial={reduce ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} />
        ))}
      </div>
      <CountUp to={rows} label={`rows in ${tables} tables`} />
      <span className="ts-arrow" aria-hidden="true"><ArrowRight size={22} /></span>
      <ul className="ts-roles">
        {roles.map((r, i) => (
          <motion.li key={r} initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 + i * 0.12 }}>{r}</motion.li>
        ))}
      </ul>
    </div>
  )
}

/** The person, as a card. */
export function PersonCard({ name, age, work, home, household, quote }: { name: string; age: number | null; work: string; home: string; household: string; quote?: string }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('')
  return (
    <div className="ts-person">
      <div className="ts-person-top">
        <span className="ts-avatar" aria-hidden="true">{initials}</span>
        <div>
          <strong>{name}{age ? `, ${age}` : ''}</strong>
          <span className="ts-fictional">Fictional, built from the records</span>
        </div>
      </div>
      <ul className="ts-person-facts">
        <li><Briefcase size={15} aria-hidden="true" />{work}</li>
        <li><Home size={15} aria-hidden="true" />{home}</li>
        <li><Users size={15} aria-hidden="true" />{household}</li>
      </ul>
      {quote && <blockquote>“{quote}”</blockquote>}
    </div>
  )
}

/** What was said, and the profile card turning from before to after. */
export function ChangeFlip({ said, before, after, label, version }: { said: string | null; before: string; after: string; label: string; version: number }) {
  const reduce = useReducedMotion()
  const [flipped, setFlipped] = useState(!!reduce)
  useEffect(() => { if (reduce) return; setFlipped(false); const t = setTimeout(() => setFlipped(true), 900); return () => clearTimeout(t) }, [label, reduce])
  return (
    <div className="ts-flip-wrap">
      {said && <motion.div className="ts-bubble" initial={reduce ? false : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}><MessageCircle size={14} aria-hidden="true" />{said}</motion.div>}
      <div className="ts-flip" aria-live="polite">
        <span className="ts-flip-tag">{flipped ? `Version ${version}` : `Version ${Math.max(1, version - 1)}`}</span>
        <motion.div className={`ts-flip-card${flipped ? ' after' : ''}`} key={flipped ? 'a' : 'b'}
          initial={reduce ? false : { rotateX: -90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ duration: 0.35 }}>
          <span>{flipped ? 'Now' : 'Before'}</span>
          <p>{flipped ? after : before}</p>
        </motion.div>
      </div>
    </div>
  )
}

/** Many plans in, a few out: a press with shrinking juice. */
export function Squeeze({ stages }: { stages: { label: string; count: number }[] }) {
  const reduce = useReducedMotion()
  const max = Math.max(...stages.map((s) => s.count), 1)
  return (
    <ol className="ts-squeeze">
      {stages.map((s, i) => (
        <li key={s.label}>
          <span className="ts-squeeze-label">{s.label}</span>
          <span className="ts-squeeze-bar">
            <motion.i initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.max(4, Math.sqrt(s.count / max) * 100)}%` }} transition={{ delay: 0.2 + i * 0.35, duration: 0.6, ease: 'easeOut' }} />
          </span>
          <strong>{s.count.toLocaleString('en-CA')}</strong>
        </li>
      ))}
    </ol>
  )
}

/** Cards that look fine, each stamped with when they run short. */
export function Stamped({ items }: { items: { name: string; stamp: string }[] }) {
  const reduce = useReducedMotion()
  return (
    <ul className="ts-stamped">
      {items.map((it, i) => (
        <li key={i}>
          <p>{it.name}</p>
          <motion.span initial={reduce ? false : { scale: 1.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} transition={{ delay: 0.5 + i * 0.3, type: 'spring', stiffness: 260, damping: 14 }}>{it.stamp}</motion.span>
        </li>
      ))}
    </ul>
  )
}

/** A big undo, the way it works in the chat. */
export function UndoPicture({ changes, undone }: { changes: number; undone: number }) {
  return (
    <div className="ts-undo">
      <div className="ts-bubble mine">no</div>
      <div className="ts-undo-card"><RotateCcw size={28} aria-hidden="true" /><strong>Last change taken back</strong></div>
      <p><b>{changes}</b> changes so far · <b>{undone}</b> undone · every one logged</p>
    </div>
  )
}
