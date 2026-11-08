import type { CardsParams } from '../../services/api'
import { cardIcon } from './TwistCard'
import { ArrowUpRight } from 'lucide-react'

export default function CardsVisual({ p, onAction }: { p: CardsParams; onAction?: (message: string) => void }) {
  return <div className="scenario-card-grid" role="group" aria-label="Twist cards">
    {p.cards.map(c => <button type="button" key={c.key} className={`scenario-choice ${c.key === 'random' ? 'surprise' : ''}`} onClick={() => onAction?.(`twist:${c.key}`)} aria-label={`${c.title}: ${c.text}`}>
      <span className="scenario-choice-icon" aria-hidden="true">{cardIcon(c.key, 32)}</span>
      <span className="scenario-choice-kicker">{c.key === 'random' ? 'A little uncertainty' : 'Life scenario'}</span>
      <strong>{c.title}</strong><span className="scenario-choice-copy">{c.text}</span>
      <span className="scenario-choice-action">Explore this <ArrowUpRight size={15} /></span>
    </button>)}
  </div>
}
