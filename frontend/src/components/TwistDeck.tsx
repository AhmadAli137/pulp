/* The judges' twist cards as real cards, plus a shuffle that deals any realistic card from the deck into the
   official calculator. Picking a card only sets the inputs; every number still comes from /api/shocks/calculate. */
import { Shuffle } from 'lucide-react'
import { useState } from 'react'
import { api, type DeckCard } from '../services/api'
import { useApp } from '../stores/useApp'
import { TwistCardBack, TwistCardFace } from './stage/TwistCard'
import './twist-deck.css'

const TABLE = [
  { key: 'layoff', title: 'Laid off', text: 'EI pays 55% of your usual income for 6 months.' },
  { key: 'furnace', title: 'The furnace dies', text: 'The repair costs a full month of your typical spending.' },
  { key: 'combined', title: 'Layoff and bills', text: 'EI at 55% and household bills up 15% in the same month.' },
] as const

let deckCache: DeckCard[] | null = null

export default function TwistDeck({ editing, onPick }: { editing: boolean; onPick: () => void }) {
  const { activePreset, applyPreset, applyCard, shockLoading } = useApp()
  const [dealt, setDealt] = useState<DeckCard | null>(null)
  const [shuffling, setShuffling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = (key: string) => { onPick(); setDealt(null); applyPreset(key) }
  const shuffle = async () => {
    onPick(); setError(null); setShuffling(true)
    try {
      deckCache ??= (await api.deck()).cards
      const pool = deckCache.filter((c) => !TABLE.some((t) => t.key === c.key) && c.key !== dealt?.key)
      const card = pool[Math.floor(Math.random() * pool.length)] ?? deckCache[0]
      await new Promise((r) => setTimeout(r, 450))
      setDealt(card)
      applyCard(card)
    } catch { setError('Could not reach the deck. Try a card on the table.') } finally { setShuffling(false) }
  }
  const dealtActive = !!dealt && !editing && activePreset === null

  return (
    <div className="twist-deck">
      <div className="twist-deck-row" role="group" aria-label="Twist cards">
        {TABLE.map((c) => {
          const on = !editing && activePreset === c.key && !dealtActive
          return (
            <button key={c.key} type="button" className={`twist-deck-card ${on ? 'on' : ''}`} aria-pressed={on} aria-label={`${c.title}: ${c.text}`} onClick={() => pick(c.key)} disabled={shockLoading && on}>
              <TwistCardFace title={c.title} text={c.text} cardKey={c.key} kicker="TWIST CARD" />
            </button>
          )
        })}
        <button type="button" className={`twist-deck-card dealt-slot ${dealtActive ? 'on' : ''} ${shuffling ? 'shuffling' : ''}`} aria-pressed={dealtActive}
          aria-label={dealt ? `Dealt: ${dealt.title}. ${dealt.text} Shuffle again` : 'Shuffle the deck and deal a random twist'} onClick={() => void shuffle()} disabled={shuffling}>
          {dealt && !shuffling
            ? <TwistCardFace key={dealt.key} className="twist-dealt" title={dealt.title} text={dealt.text} cardKey={dealt.key} kicker="DEALT" />
            : <TwistCardBack className="twist-back" label={shuffling ? 'Shuffling…' : 'Shuffle the deck'} />}
        </button>
      </div>
      <div className="twist-deck-foot">
        <button type="button" className="bank-button" onClick={() => void shuffle()} disabled={shuffling}><Shuffle size={15} aria-hidden="true" /> {dealt ? 'Deal another' : 'Shuffle'}</button>
        <button type="button" className="twist-deck-none" onClick={() => pick('baseline')}>No shock</button>
        {error && <span className="small muted" role="status">{error}</span>}
      </div>
    </div>
  )
}
