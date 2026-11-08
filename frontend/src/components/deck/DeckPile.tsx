/* The personal deck as a physical pile: its real size, a riffle shuffle, and the top card leaving for the table.
   Phases: idle -> shuffle (split, interleave, square up) -> deal (top card slides out toward the dealt slot). */
import { Layers, Shuffle } from 'lucide-react'
import { TwistCardBack } from '../stage/TwistCard'

export type PilePhase = 'idle' | 'shuffle' | 'deal'

export default function DeckPile({ count, owner, phase, disabled, onShuffle, onBrowse, browsing }: {
  count: number; owner: string | null; phase: PilePhase; disabled: boolean; onShuffle: () => void; onBrowse: () => void; browsing: boolean
}) {
  const layers = Math.max(3, Math.min(8, count))
  return (
    <div className="deck-pile-wrap">
      <button type="button" className={`deck-pile phase-${phase}`} onClick={onShuffle} disabled={disabled}
        aria-label={count ? `Your deck of ${count} cards. Shuffle and deal one` : 'Your deck. Shuffle and deal one'}>
        <span className="deck-stack" aria-hidden="true">
          {Array.from({ length: layers }, (_, i) => (
            <span key={i} className={`deck-layer ${i % 2 ? 'odd' : 'even'} ${i === layers - 1 ? 'top' : ''}`}
              style={{ '--i': i, '--n': layers } as React.CSSProperties}>
              <TwistCardBack className="twist-back" label={i === layers - 1 ? (phase === 'idle' ? 'Shuffle' : phase === 'shuffle' ? 'Shuffling…' : 'Dealing…') : undefined} />
            </span>
          ))}
        </span>
      </button>
      <p className="deck-caption">
        <b>{count || '…'} cards</b>{owner ? <> made for {owner}</> : <> made for this life</>}
      </p>
      <div className="deck-actions">
        <button type="button" className="deck-btn primary" onClick={onShuffle} disabled={disabled}><Shuffle size={14} aria-hidden="true" /> Shuffle and deal</button>
        <button type="button" className="deck-btn" onClick={onBrowse} aria-expanded={browsing}><Layers size={14} aria-hidden="true" /> {browsing ? 'Close the deck' : 'Look through the deck'}</button>
      </div>
    </div>
  )
}
