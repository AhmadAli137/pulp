/* Twist cards as an agent demo. All four cards start face down. Flipping one asks the Shock Dealer (an agent) who
   brings the news and, for the fourth card, which shock fits this life; every reveal shows a different character.
   Slots 1-3 are the judges' official scenarios; slot 4 deals a different scenario each time. Revealing a card only
   sets the calculator's inputs: every amount, runway and plan still comes from /api/shocks/calculate.
   The model can take several seconds, so the next deal for every face-down slot is prefetched; if it is not ready
   within ~600 ms the dealer is asked for an instant local draw instead.
   The fourth card comes from the person's own deck (the Shock Generator's cards for this life): the pile beside it shows
   the deck's real size, shuffles (split, interleave, square up) and deals the dealer's pick face up; "Look through the
   deck" fans every card out so any of them can be played by hand. */
import { MessageCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type DeckCard, type PersonalShock, type ShockDeal } from '../services/api'
import { useApp } from '../stores/useApp'
import CharacterFigure, { CHARACTER_IDS } from './characters/CharacterFigure'
import DeckFan from './deck/DeckFan'
import DeckPile, { type PilePhase } from './deck/DeckPile'
import { CATEGORY, Likelihood, messengerFor, nameOf } from './deck/deckMeta'
import { useProfileDoc } from './profile/useProfileDoc'
import { TwistCardBack } from './stage/TwistCard'
import './deck/deck.css'
import './twist-deck.css'

const TABLE = [
  { key: 'layoff', title: 'Laid off', text: 'EI pays 55% of your usual income for 6 months.' },
  { key: 'furnace', title: 'The furnace dies', text: 'The repair costs a full month of your typical spending.' },
  { key: 'combined', title: 'Layoff and bills', text: 'EI at 55% and household bills up 15% in the same month.' },
] as const
const OFFICIAL: Record<string, Omit<DeckCard, 'key' | 'title' | 'text'>> = {
  layoff: { r: 0.55, h: 0, duration: 6, one_off: 0, one_off_months: null },
  furnace: { r: 1, h: 0, duration: 6, one_off: 0, one_off_months: 1 },
  combined: { r: 0.55, h: 0.15, duration: 6, one_off: 0, one_off_months: null },
}
const CATEGORY_LABEL: Record<string, string> = { income: 'Income', housing: 'Housing', health: 'Health', family: 'Family', transport: 'Transport', costs: 'Costs', opportunity: 'Opportunity', disaster: 'Natural disaster', economy: 'Economy', political: 'World events' }

interface Prefetch { key: string; promise: Promise<ShockDeal>; value?: ShockDeal }

/** A local draw used only if the dealer endpoint cannot be reached at all. */
function localDeal(slot: number, exclude: string | null, deck: DeckCard[] = []): ShockDeal {
  const ids = CHARACTER_IDS.filter((c) => c !== exclude)
  const id = ids[Math.floor(Math.random() * ids.length)] ?? 'manager'
  const name = `The ${id.replace(/_/g, ' ').replace(/\b\w/, (c) => c.toUpperCase())}`
  const official = TABLE[slot - 1]
  const card: ShockDeal['card'] = official
    ? { key: official.key, title: official.title, text: official.text, ...OFFICIAL[official.key] }
    : deck[Math.floor(Math.random() * Math.max(1, deck.length))] ?? { key: 'layoff', title: TABLE[0].title, text: TABLE[0].text, ...OFFICIAL.layoff }
  return { slot, character: { id, name, role: '' }, card, reason: `${name} brings this card.`, source: 'offline', ms: 0 }
}

export default function TwistDeck({ editing, onPick }: { editing: boolean; onPick: () => void }) {
  const { activePreset, applyPreset, applyCard, shockLoading, accountId } = useApp()
  const [open, setOpen] = useState<boolean[]>([false, false, false, false])
  const [shown, setShown] = useState<(ShockDeal | null)[]>([null, null, null, null])
  const [latest, setLatest] = useState<number | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const lastCharacter = useRef<string | null>(null)
  const lastScenario = useRef<string | null>(null)
  const prefetched = useRef<(Prefetch | null)[]>([null, null, null, null])
  const deck = useRef<DeckCard[]>([])
  const [deckCards, setDeckCards] = useState<PersonalShock[]>([])
  const [phase, setPhase] = useState<PilePhase>('idle')
  const [browsing, setBrowsing] = useState(false)
  const { doc } = useProfileDoc(accountId ?? null)
  const owner = doc?.account_id === accountId ? doc?.persona?.display_name?.split(' ')[0] ?? null : null

  // A prefetched deal stays usable across other reveals unless its character is the one just shown (checked on use),
  // so the key holds only what makes a deal unusable outright: the account and, for slot 4, the last scenario.
  const exclusionsKey = (slot: number) => `${accountId}|${slot === 4 ? lastScenario.current : ''}`
  const request = useCallback((slot: number, useAi: boolean) => api.shockDealer({
    account_id: accountId, slot, exclude_character: lastCharacter.current, exclude_scenario: slot === 4 ? lastScenario.current : null, use_ai: useAi, pool: 'personal',
  }), [accountId])
  const prefetch = useCallback((faceDown: boolean[]) => {
    faceDown.forEach((down, i) => {
      const slot = i + 1
      if (!down) return
      const key = exclusionsKey(slot)
      const have = prefetched.current[i]
      if (have?.key === key && (!have.value || have.value.character.id !== lastCharacter.current)) return
      // Only the deck's card (slot 4) needs the model, to choose the scenario; the official cards only need a messenger, and
      // four slow model calls at once can starve the browser's connections so the instant fallback draw queues behind them.
      const entry: Prefetch = { key, promise: request(slot, slot === 4) }
      entry.promise.then((v) => { entry.value = v }).catch(() => { /* a local draw covers it on click */ })
      prefetched.current[i] = entry
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, accountId])

  // On mount (and when the account changes): everything face down, prefetch a deal for each slot.
  const preparedFor = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    if (preparedFor.current === accountId) return // once per account, even when effects run twice in development
    preparedFor.current = accountId
    lastCharacter.current = null; lastScenario.current = null
    prefetched.current = [null, null, null, null]
    setOpen([false, false, false, false]); setShown([null, null, null, null]); setLatest(null)
    prefetch([true, true, true, true])
    setDeckCards([]); setBrowsing(false); setPhase('idle')
    api.personalDeck(accountId ?? 0).then((r) => { deck.current = r.cards.map((c) => ({ ...c, one_off_months: null })); setDeckCards(r.cards) }).catch(() => { /* optional */ })
  }, [accountId, prefetch])

  const deal = async (slot: number): Promise<ShockDeal> => {
    const pf = prefetched.current[slot - 1]
    const valid = (d?: ShockDeal) => !!d && d.character.id !== lastCharacter.current && (slot !== 4 || d.card.key !== lastScenario.current)
    if (pf && pf.key === exclusionsKey(slot)) {
      if (valid(pf.value)) return pf.value!
      const raced = await Promise.race([pf.promise.catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), 600))])
      if (valid(raced)) return raced!
    }
    try {
      const d = await request(slot, false)
      if (valid(d)) return d
    } catch { /* fall through to a local draw */ }
    return localDeal(slot, lastCharacter.current, deck.current)
  }

  const reveal = (i: number, d: ShockDeal) => {
    const slot = i + 1
    lastCharacter.current = d.character.id
    if (slot === 4) lastScenario.current = d.card.key
    const nextOpen = open.map((v, k) => (k === i ? true : v))
    setShown((s) => s.map((v, k) => (k === i ? d : v)))
    setOpen(nextOpen); setLatest(i); setBusy(null)
    if (slot <= 3) applyPreset(TABLE[i].key)
    else applyCard({ ...d.card, one_off_months: d.card.one_off_months ?? null })
    prefetched.current = prefetched.current.map((p, k) => (k === i ? null : p))
    prefetch(nextOpen.map((v) => !v))
  }

  const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  /** Shuffle the personal deck (split, interleave, square up), then deal the Shock Dealer's pick into the fourth slot. */
  const shuffleAndDeal = async () => {
    if (busy != null) return
    onPick(); setBusy(3); setBrowsing(false)
    setOpen((o) => o.map((v, k) => (k === 3 ? false : v)))
    setPhase('shuffle')
    const [d] = await Promise.all([deal(4), wait(reduced() ? 160 : 800)])
    setPhase('deal')
    await wait(reduced() ? 0 : 260)
    reveal(3, d)
    setPhase('idle')
  }
  /** Play a card picked by hand from the fanned deck. Its messenger is the scenario's natural one. */
  const playCard = (c: PersonalShock) => {
    if (busy != null) return
    onPick()
    const id = messengerFor(c.key, c.category, lastCharacter.current)
    reveal(3, { slot: 4, character: { id, name: nameOf(id), role: '' }, card: { ...c, one_off_months: null },
      reason: 'You picked this card from your deck.', source: 'you', ms: 0 })
    setBrowsing(false)
  }

  const flip = async (i: number) => {
    const slot = i + 1
    if (i === 3 && !open[i]) { await shuffleAndDeal(); return }
    if (open[i]) {
      // covering a card does not change the applied shock
      setOpen((o) => o.map((v, k) => (k === i ? false : v)))
      prefetch(open.map((v, k) => (k === i ? true : !v)))
      return
    }
    onPick(); setBusy(i)
    const d = await deal(slot)
    reveal(i, d)
  }

  const isOn = (i: number) => {
    if (editing || !open[i]) return false
    if (i < 3) return activePreset === TABLE[i].key
    return activePreset === null && latest === 3
  }
  const info = latest != null && open[latest] ? shown[latest] : null

  return (
    <div className="twist-deck">
      <div className="twist-deck-row" role="group" aria-label="Twist cards">
        {[0, 1, 2, 3].map((i) => {
          const d = shown[i]
          const up = open[i] && !!d
          const title = i < 3 ? TABLE[i].title : d?.card.title ?? ''
          const text = i < 3 ? TABLE[i].text : d?.card.text ?? ''
          const on = isOn(i)
          return (
            <div key={i} className="twist-slot">
              <button type="button" className={`twist-deck-card ${on ? 'on' : ''} ${up ? 'up' : 'down'} ${busy === i ? 'shuffling' : ''}`}
                aria-pressed={up ? on : undefined} disabled={busy != null || (shockLoading && on)}
                aria-label={up ? `${title}: ${text}` : `Face-down card ${i + 1}. Turn it over`}
                onClick={() => void flip(i)}>
                {up && d ? (
                  <div className="twist-card twist-dealt" key={`${d.character.id}-${d.card.key}`}>
                    <div className="twist-card-inner">
                      <header className="twist-card-band"><span>{i < 3 ? 'TWIST CARD' : 'DEALT'}</span><strong>{title}</strong></header>
                      <div className="twist-card-art twist-character"><CharacterFigure id={d.character.id} size={84} /></div>
                      <p className="twist-card-text">{text}</p>
                      {i === 3 && d.card.category && CATEGORY[d.card.category] && (() => {
                        const meta = CATEGORY[d.card.category!]
                        return <span className="deck-face-meta"><meta.Icon size={12} aria-hidden={true} />{meta.label}<Likelihood level={d.card.likelihood} /></span>
                      })()}
                      <footer className="twist-card-foot"><i /><span>{d.character.name}</span><i /></footer>
                    </div>
                  </div>
                ) : <TwistCardBack className="twist-back" label={busy === i ? (i === 3 ? 'Shuffling…' : 'The dealer is choosing…') : i === 3 ? 'Deal from your deck' : 'Turn over'} />}
              </button>
              {up && d && <span className="twist-slot-who">{d.character.name}</span>}
            </div>
          )
        })}
        <DeckPile count={deckCards.length} owner={owner} phase={phase} disabled={busy != null} onShuffle={() => void shuffleAndDeal()}
          onBrowse={() => setBrowsing((b) => !b)} browsing={browsing} />
      </div>
      {browsing && deckCards.length > 0 && <DeckFan cards={deckCards} current={open[3] ? shown[3]?.card.key ?? null : null} onPlay={playCard} />}
      {info && (
        <div className="twist-why" role="status">
          {info.source === 'you'
            ? <span className="twist-dealer-chip local">Chosen by you</span>
            : <span className={`twist-dealer-chip ${info.source === 'local' || info.source === 'offline' ? 'local' : 'ai'}`}>
                Shock Dealer · {info.source === 'local' || info.source === 'offline' ? 'local draw' : 'Gemini'}
              </span>}
          <span className="twist-why-text">{info.reason}</span>
          {info.card.category && <span className="twist-why-cat">{CATEGORY_LABEL[info.card.category] ?? info.card.category}</span>}
          {info.card.likelihood && <span className={`twist-why-chance ${info.card.likelihood}`}>{info.card.likelihood} likelihood</span>}
          {info.card.why_you && <span className="twist-why-you"><b>Why you:</b> {info.card.why_you}</span>}
          <button type="button" className="bank-button twist-ask" onClick={() => useApp.getState().openPulp(`twist:${info.card.key}@${info.character.id}`)}>
            <MessageCircle size={14} aria-hidden="true" /> Ask Pulp about this card
          </button>
        </div>
      )}
      <div className="twist-deck-foot">
        <span className="small muted">Turn over one of the brief’s three cards, or shuffle your own deck{deckCards.length ? ` of ${deckCards.length} shocks made for this life` : ''}. Turn a card back to cover it.</span>
        <button type="button" className="twist-deck-none" onClick={() => { onPick(); applyPreset('baseline') }}>No shock</button>
      </div>
    </div>
  )
}
