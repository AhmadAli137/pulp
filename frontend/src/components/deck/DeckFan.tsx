/* Look through the deck: every card the Shock Generator made for this person, face up, fanned in a gentle arc
   (a scrolling row on phones), filterable by group. Picking one plays it straight onto the table. */
import { useMemo, useState } from 'react'
import type { PersonalShock } from '../../services/api'
import { CATEGORY, GROUPS, Likelihood, groupOf, type DeckGroup } from './deckMeta'

export default function DeckFan({ cards, current, onPlay }: { cards: PersonalShock[]; current: string | null; onPlay: (c: PersonalShock) => void }) {
  const [group, setGroup] = useState<DeckGroup | 'all'>('all')
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const x of cards) c[groupOf(x.category)] = (c[groupOf(x.category)] ?? 0) + 1
    return c
  }, [cards])
  const shown = group === 'all' ? cards : cards.filter((c) => groupOf(c.category) === group)
  const mid = (shown.length - 1) / 2
  return (
    <section className="deck-fan" aria-label="Your whole deck">
      <div className="deck-fan-head">
        <div className="deck-fan-filters" role="radiogroup" aria-label="Show cards">
          <button type="button" role="radio" aria-checked={group === 'all'} className={group === 'all' ? 'on' : ''} onClick={() => setGroup('all')}>All <b>{cards.length}</b></button>
          {GROUPS.filter((g) => counts[g.key]).map((g) => (
            <button key={g.key} type="button" role="radio" aria-checked={group === g.key} className={`${group === g.key ? 'on' : ''} g-${g.key}`} onClick={() => setGroup(g.key)}>
              {g.label} <b>{counts[g.key]}</b>
            </button>
          ))}
        </div>
        <span className="small muted">Pick any card to play it. Likelihood is how well it fits this life.</span>
      </div>
      <ul className="deck-fan-row">
        {shown.map((c, i) => {
          const meta = CATEGORY[c.category] ?? CATEGORY.costs
          const off = i - mid
          return (
            <li key={c.key} style={{ '--rot': `${Math.max(-8, Math.min(8, off * 1.3))}deg`, '--lift': `${Math.min(18, off * off * 0.6)}px` } as React.CSSProperties}>
              <button type="button" className={`deck-mini g-${groupOf(c.category)} ${current === c.key ? 'on' : ''}`} onClick={() => onPlay(c)}
                aria-label={`Play ${c.title}: ${c.text}`}>
                <span className="deck-mini-top"><meta.Icon size={13} aria-hidden={true} /> {meta.label}<Likelihood level={c.likelihood} /></span>
                <strong>{c.title}</strong>
                <span className="deck-mini-text">{c.text}</span>
                <span className="deck-mini-why">{c.why_you}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
