/* Pulp as a side companion: a mascot button that opens a panel with the conversation, the live voice agent and
   the agents' backstage. Lifted from the old conversation-first home (pages/Stage.tsx); the account, navigation
   and page chrome belong to Layout now. Every number Pulp shows still comes from the engine. */
import { ArrowUp, Check, Compass, Dice5, Mic, Shuffle, Sparkles, Square, Users, Volume2, VolumeX, Wallet, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tangerine } from '../PulpMascot'
import Backstage, { splitKeys, type FeedItem } from '../stage/Backstage'
import PulpText from '../stage/PulpText'
import ThreadFigure from '../stage/ThreadFigure'
import AnimatedWalkthrough from '../stage/AnimatedWalkthrough'
import { startVoice, type VoiceSession } from '../../services/voice'
import { API_BASE, api, type Beat, type DeckCard, type Persona, type Proposal, type StageAgentEvent, type StageHandoffEvent, type StageMemoryEvent, type Storyboard } from '../../services/api'
import { useApp } from '../../stores/useApp'
import '../../stage.css'
import './pulp-panel.css'

const TOOL_WORDS: Record<string, string> = { calculate_shock: 'running the shock', deal_or_set_shock: 'setting up the shock', get_profile: 'reading your numbers', get_financial_profile: 'reading your numbers', score_strategy: 'scoring an idea', run_council: 'asking the council', compare_strategies: 'comparing plans', get_insights: 'reading your profile', get_cohort: 'looking at people like you', show_math: 'writing out the math', simulate: 'simulating months' }
const fieldNames: Record<string, string> = { goals: 'Goal', concerns: 'Concern', constraints: 'Planning detail', preferences: 'Preference', upcoming_events: 'Life event' }
const GREETING = 'Hi, I’m Pulp. Ask me about your money, talk it through out loud, or draw a twist card to see how you would hold up.'
const SUGGESTIONS: [string, string, typeof Sparkles][] = [['What should I know about my money?', '__intro__', Sparkles], ['A small everyday decision', 'decision:small', Wallet], ['A bigger life decision', 'decision:big', Compass]]

type Msg =
  | { id: string; kind: 'walkthrough'; beats: Beat[]; autoplay?: boolean }
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'pulp'; text: string; beat?: Beat }
  | { id: string; kind: 'proposal'; proposal: Proposal }
  | { id: string; kind: 'card'; card: { key: string; title: string } }

const readFlag = (key: string) => { try { return localStorage.getItem(key) === '1' } catch { return false } }
const turnLabel = (m: string) => m === 'decision:small' ? 'An everyday decision' : m === 'decision:big' ? 'A bigger life decision' : m === '__intro__' ? 'What should I know about my money?' : m === 'twist:cards' ? 'Twist cards' : m === 'twist:random' ? 'Shuffle the deck' : m.startsWith('twist:') ? `Twist: ${m.slice(6).replaceAll('_', ' ')}` : m.length > 70 ? m.slice(0, 69) + '…' : m
const userText = (m: string) => m === 'decision:small' ? 'Help me with an everyday decision.' : m === 'decision:big' ? 'Help me with a bigger life decision.' : m === '__intro__' ? 'What should I know about my money?' : m === 'twist:cards' ? 'Show me the twist cards.' : m === 'twist:random' ? 'Shuffle the deck and deal me one.' : m.startsWith('twist:') ? `Deal the “${m.slice(6).replaceAll('_', ' ')}” card.` : m
let seq = 0
const nid = (p: string) => `${p}-${++seq}`

export default function PulpPanel() {
  const { profile, pulpOpen, openPulp, closePulp } = useApp()
  const navigate = useNavigate()
  const id = profile?.account_id ?? null

  const [thread, setThread] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [mute, setMute] = useState(() => readFlag('pulp.mute'))
  const [voice, setVoice] = useState(false)
  const [voiceReady, setVoiceReady] = useState(false)
  const [live, setLive] = useState({ user: '', assistant: '' })
  const [backstage, setBackstage] = useState(false)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [active, setActive] = useState<Set<string>>(new Set())
  const voiceStop = useRef<VoiceSession | null>(null)
  const voiceRequest = useRef(0)
  const liveText = useRef({ user: '', assistant: '' })
  const interacted = useRef(false)
  const turn = useRef(0)
  const activeTimers = useRef<Map<string, number>>(new Map())
  const source = useRef<EventSource | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const deck = useRef<DeckCard[] | null>(null)

  useEffect(() => { try { localStorage.setItem('pulp.mute', mute ? '1' : '0') } catch { /* ignore */ } }, [mute])
  useEffect(() => { if (pulpOpen && !personas.length) api.personas().then((r) => setPersonas(r.personas)).catch(() => undefined) }, [pulpOpen, personas.length])
  useEffect(() => { if (pulpOpen) endRef.current?.scrollIntoView({ block: 'end' }) }, [thread, status, live, pulpOpen])

  /* ---- backstage bookkeeping */
  const light = useCallback((keys: string[]) => {
    setActive((prev) => { const n = new Set(prev); keys.forEach((k) => n.add(k)); return n })
    keys.forEach((k) => {
      const old = activeTimers.current.get(k); if (old) clearTimeout(old)
      activeTimers.current.set(k, window.setTimeout(() => setActive((prev) => { const n = new Set(prev); n.delete(k); return n }), 2600))
    })
  }, [])
  const pushFeed = useCallback((item: FeedItem) => {
    setFeed((prev) => {
      const next = [...prev, item]
      const turns = [...new Set(next.map((f) => f.turn))].sort((a, b) => b - a).slice(0, 2)
      return next.filter((f) => turns.includes(f.turn))
    })
  }, [])

  const endVoice = useCallback(() => {
    voiceRequest.current++
    voiceStop.current?.(); voiceStop.current = null
    setVoice(false); setVoiceReady(false); setLive({ user: '', assistant: '' })
  }, [])

  /* ---- one typed turn over server-sent events */
  const run = useCallback((message: string) => {
    if (!id) return
    endVoice()
    source.current?.close()
    interacted.current = true
    setBusy(true); setStatus('Pulp is thinking…'); setNotice(null)
    setThread((t) => [...t, { id: nid('u'), kind: 'user', text: userText(message) }])
    const t = ++turn.current
    pushFeed({ id: `d-${t}`, turn: t, kind: 'divider', label: turnLabel(message) })
    // A twist card is answered by the deterministic engine and the deck, never by waiting on a model.
    const deterministic = message.startsWith('twist:') ? '&use_ai=false' : ''
    const es = new EventSource(`${API_BASE}/api/agent/stage?account_id=${id}&message=${encodeURIComponent(message)}${deterministic}`)
    source.current = es
    const mine = () => source.current === es
    let n = 0
    es.addEventListener('agent', (e) => {
      if (!mine()) return
      try {
        const d = JSON.parse((e as MessageEvent).data) as StageAgentEvent
        if (d.kind === 'tool_call' && d.tool) {
          setStatus(`Pulp is ${TOOL_WORDS[d.tool] ?? `asking the engine: ${d.tool.replaceAll('_', ' ')}`}…`)
          pushFeed({ id: `a-${t}-${n++}`, turn: t, kind: 'agent', agent: d.agent, t: d.t, text: `asks the engine: ${d.tool.replaceAll('_', ' ')}` })
          light([d.agent, 'engine'])
        } else if (d.agent === 'engine' && d.summary) {
          setStatus(d.summary); light(['engine'])
          pushFeed({ id: `a-${t}-${n++}`, turn: t, kind: 'agent', agent: 'engine', t: d.t, text: d.summary })
        } else if (d.kind === 'tool_result' && d.tool) {
          pushFeed({ id: `a-${t}-${n++}`, turn: t, kind: 'agent', agent: d.agent, t: d.t, text: `reads the ${d.tool.replaceAll('_', ' ')} result` })
        } else if (d.kind === 'text' && d.agent !== 'engine') {
          setStatus(`${d.agent === 'director' ? 'Pulp' : d.agent} is writing…`)
          pushFeed({ id: `a-${t}-${n++}`, turn: t, kind: 'agent', agent: d.agent, t: d.t, text: 'writes its answer' })
          light([d.agent])
        }
      } catch { /* ignore */ }
    })
    es.addEventListener('handoff', (e) => {
      if (!mine()) return
      try {
        const d = JSON.parse((e as MessageEvent).data) as StageHandoffEvent
        pushFeed({ id: `h-${t}-${n++}`, turn: t, kind: 'handoff', from: d.from, to: d.to, title: d.title, items: d.items ?? [], t: d.t ?? 0 })
        light([...splitKeys(d.from), ...splitKeys(d.to)])
      } catch { /* ignore */ }
    })
    es.addEventListener('memory', (e) => {
      if (!mine()) return
      try {
        const d = JSON.parse((e as MessageEvent).data) as StageMemoryEvent
        if (d.proposal) setThread((th) => [...th, { id: nid('p'), kind: 'proposal', proposal: d.proposal! }])
        light(['companion'])
      } catch { /* ignore */ }
    })
    es.addEventListener('storyboard', (e) => {
      if (!mine()) return
      try {
        const d = JSON.parse((e as MessageEvent).data) as Storyboard
        const beats = (d.beats ?? []).map((b) => ({ ...b, id: nid(b.id) }))
        const next: Msg[] = []
        let scenes: Beat[] = []
        const flush = () => {
          if (scenes.length > 1) next.push({ id: nid('w'), kind: 'walkthrough', beats: scenes })
          else if (scenes.length) next.push({ id: nid('m'), kind: 'pulp', text: scenes[0].caption, beat: scenes[0] })
          scenes = []
        }
        for (const b of beats) { if (b.visual !== 'none') scenes.push(b); else { flush(); next.push({ id: nid('m'), kind: 'pulp', text: b.caption }) } }
        flush()
        const card = d.card as { key?: string; title?: string } | undefined
        if (card?.key && card.title) next.push({ id: nid('c'), kind: 'card', card: { key: card.key, title: card.title } })
        setThread((th) => [...th, ...next])
        setStatus(null)
      } catch { /* ignore */ }
    })
    es.addEventListener('done', () => { if (!mine()) return; es.close(); setBusy(false); setStatus(null); void useApp.getState().refreshSession().catch(() => undefined) })
    es.addEventListener('error', (e) => {
      if (!mine()) return
      const data = (e as MessageEvent).data
      if (data) { try { setNotice(JSON.parse(data).message ?? 'Something went wrong.') } catch { setNotice('Something went wrong.') } }
      else if (es.readyState === EventSource.CLOSED) setNotice('The connection dropped. Try again.')
      es.close(); setBusy(false); setStatus(null); setDraft(message)
    })
  }, [id, light, pushFeed, endVoice])

  /* ---- live voice (Gemini native audio through the backend relay) */
  const toggleVoice = async () => {
    if (voice) { endVoice(); return }
    if (!id) return
    endVoice()
    source.current?.close(); source.current = null
    setBusy(false); setStatus(null)
    const request = ++voiceRequest.current
    ++turn.current
    interacted.current = true
    setVoice(true); setVoiceReady(false); setMute(false); setNotice(null)
    liveText.current = { user: '', assistant: '' }
    try {
      const stop = await startVoice(id, (m) => {
        if (request !== voiceRequest.current) return
        if (m.type === 'ready') setVoiceReady(true)
        if (m.type === 'transcript') { liveText.current = { ...liveText.current, [m.role]: liveText.current[m.role] + m.text }; setLive(liveText.current) }
        if (m.type === 'turn_complete') {
          const text = liveText.current
          setThread((t) => [...t,
            ...(text.user ? [{ id: nid('u'), kind: 'user' as const, text: text.user }] : []),
            ...(text.assistant ? [{ id: nid('m'), kind: 'pulp' as const, text: text.assistant }] : [])])
          liveText.current = { user: '', assistant: '' }; setLive(liveText.current)
        }
        if (m.type === 'walkthrough') setThread((t) => [...t, { id: nid('vw'), kind: 'walkthrough', beats: m.beats, autoplay: false }])
        if (m.type === 'visual') setThread((t) => [...t, { id: nid('v'), kind: 'pulp', text: m.beat.caption, beat: m.beat }])
        if (m.type === 'context_proposal') setThread((t) => [...t, { id: nid('p'), kind: 'proposal', proposal: m.proposal }])
        if (m.type === 'pipeline_event') {
          if (m.event === 'handoff') {
            const d = m.data as unknown as StageHandoffEvent
            light([...splitKeys(d.from), ...splitKeys(d.to)])
            pushFeed({ id: nid('vh'), turn: turn.current, kind: 'handoff', from: d.from, to: d.to, title: d.title, items: d.items ?? [], t: d.t ?? 0 })
          } else {
            const who = String(m.data.agent ?? 'companion')
            light(splitKeys(who))
            pushFeed({ id: nid('ve'), turn: turn.current, kind: 'agent', agent: who, t: Number(m.data.t ?? 0), text: String(m.data.summary ?? m.data.tool ?? 'Working on your plan') })
          }
        }
        if (m.type === 'state_changed') void useApp.getState().refreshSession().catch(() => setNotice('Could not refresh your plan.'))
        if (m.type === 'status') {
          if (m.message) { ++turn.current; setActive(new Set()); pushFeed({ id: nid('vt'), turn: turn.current, kind: 'divider', label: 'Voice conversation' }) }
          setStatus(m.message || null)
        }
        if (m.type === 'error') setNotice(m.message)
        if (m.type === 'closed') { setVoice(false); setVoiceReady(false) }
      })
      if (request !== voiceRequest.current) stop(); else voiceStop.current = stop
    } catch (e) {
      if (request !== voiceRequest.current) return
      setVoice(false)
      setNotice((e as Error).name === 'NotAllowedError' ? 'Microphone access was declined. You can still type here.' : (e as Error).message)
    }
  }

  /* ---- a new account: fresh thread, previous conversation restored if there is one */
  useEffect(() => {
    endVoice()
    source.current?.close(); source.current = null
    interacted.current = false
    setBusy(false); setStatus(null); setNotice(null); setFeed([]); setActive(new Set())
    setThread(id ? [{ id: nid('g'), kind: 'pulp', text: GREETING }] : [])
    let cancelled = false
    if (id) api.context(id).then(({ context }) => {
      if (cancelled || interacted.current) return
      const history = context.conversation.slice(-16).map((m) => ({ id: nid('h'), kind: m.role === 'user' ? 'user' as const : 'pulp' as const, text: m.role === 'user' ? userText(m.text) : m.text }))
      if (history.length) setThread(history)
    }).catch(() => undefined)
    return () => { cancelled = true; endVoice(); source.current?.close(); source.current = null }
  }, [id, endVoice])

  /* ---- opening: focus the input, run a seeded message from a page, Escape closes */
  useEffect(() => {
    if (!pulpOpen) { endVoice(); return }
    const seed = useApp.getState().takePulpSeed()
    if (seed && id) run(seed)
    window.setTimeout(() => inputRef.current?.focus(), 0)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !backstage) closePulp() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [pulpOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = (text: string) => {
    const t = text.trim(); if (!t || !id) return
    setDraft('')
    if (voice && !t.startsWith('twist:')) {
      if (voiceStop.current?.sendText(t)) setThread((items) => [...items, { id: nid('u'), kind: 'user', text: userText(t) }])
      else setNotice('Voice is still connecting. Please try again in a moment.')
      return
    }
    run(t)
  }
  const confirm = async (p: Proposal, accept: boolean) => {
    if (!id) return
    setConfirming(p.id)
    try {
      const result = await api.confirm(id, p.id, accept)
      if (result.replan) useApp.getState().setLastReplan(result.replan)
      await useApp.getState().refreshSession()
      setThread((t) => t.map((m) => m.kind === 'proposal' && m.proposal.id === p.id ? { id: m.id, kind: 'pulp', text: accept ? 'Noted. I’ll plan around that.' : 'Left it out.' } : m))
    } catch { setNotice('Could not save that.') } finally { setConfirming(null) }
  }
  const showOfficial = async (key: string) => {
    try {
      deck.current ??= (await api.deck()).cards
      const card = deck.current.find((c) => c.key === key)
      if (!card) return
      useApp.getState().applyCard(card)
      navigate('/shock')
    } catch { setNotice('Could not open that shock in the calculator.') }
  }
  const replay = (text: string) => { if (voice) voiceStop.current?.sendText(`Please explain this again: ${text}`) }

  const mood = voice ? 'listening' : busy ? 'thinking' : 'idle'
  return (
    <>
      {!pulpOpen && (
        <button type="button" className="pulp-launcher" aria-label="Talk to Pulp" aria-expanded={false} aria-controls="pulp-panel" onClick={() => openPulp()}>
          <Tangerine mood={mood} />
          {active.size > 0 && <i className="pulp-launcher-dot" aria-hidden="true" />}
        </button>
      )}
      <aside id="pulp-panel" className="pulp-panel" aria-label="Pulp conversation" hidden={!pulpOpen}>
        <header className="pulp-panel-head">
          <span className="pulp-panel-avatar" aria-hidden="true"><Tangerine mood={mood} /></span>
          <div className="pulp-panel-title"><strong>Pulp</strong><span>{voice ? (voiceReady ? 'Listening' : 'Connecting…') : busy ? 'Working it out' : 'Your planning companion'}</span></div>
          <button type="button" className={`pulp-agents ${backstage ? 'on' : ''}`} aria-pressed={backstage} onClick={() => setBackstage((v) => !v)} title="See what the agents are doing">
            <Users size={14} aria-hidden="true" />Agents{active.size > 0 && <i className="stage-live-dot" aria-hidden="true" />}
          </button>
          <button type="button" className="pulp-icon" aria-label={mute ? 'Unmute Pulp' : 'Mute Pulp'} onClick={() => { voiceStop.current?.setMuted(!mute); setMute(!mute) }}>{mute ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          <button type="button" className="pulp-icon" aria-label="Close Pulp" onClick={closePulp}><X size={17} /></button>
        </header>

        <div className="pulp-panel-thread thread" aria-live="polite">
          {!profile && <p className="pulp-panel-empty">Load a demo account first. Then ask Pulp anything, or press the mic and talk it through.</p>}
          {profile && thread.map((m) => {
            if (m.kind === 'user') return <div key={m.id} className="msg user"><p>{m.text}</p></div>
            if (m.kind === 'proposal') return (
              <div key={m.id} className="msg pulp noted">
                <div className="msg-body">
                  <div className="noted-row" role="status">
                    <span>Pulp noted</span>
                    {m.proposal.changes.map((c, i) => <b key={i}>{fieldNames[c.field] ?? c.field}: {String(c.value.label ?? String(c.value.type ?? '').replaceAll('_', ' '))}</b>)}
                    <button type="button" onClick={() => confirm(m.proposal, true)} disabled={confirming === m.proposal.id}><Check size={13} />Confirm</button>
                    <button type="button" className="ghost" onClick={() => confirm(m.proposal, false)} disabled={confirming === m.proposal.id}>Not quite</button>
                  </div>
                </div>
              </div>
            )
            if (m.kind === 'card') return (
              <div key={m.id} className="msg pulp">
                <div className="msg-body"><button type="button" className="pulp-official" onClick={() => void showOfficial(m.card.key)}>See the official numbers for “{m.card.title}” in Shocks</button></div>
              </div>
            )
            if (m.kind === 'walkthrough') return <div key={m.id} className="msg pulp has-figure"><div className="msg-body"><AnimatedWalkthrough beats={m.beats} onAction={send} autoplay={m.autoplay} /></div></div>
            return (
              <div key={m.id} className={`msg pulp ${m.beat && m.beat.visual !== 'none' ? 'has-figure' : ''}`}>
                <div className="msg-body">
                  <PulpText text={m.text} />
                  {m.beat && <ThreadFigure beat={m.beat} onReplay={() => replay(m.text)} onAction={send} />}
                </div>
              </div>
            )
          })}
          {voice && (live.user || live.assistant) && <div className="msg-body pulp-live">{live.user && <p>You: {live.user}</p>}{live.assistant && <PulpText text={live.assistant} />}</div>}
          {status && <p className="thread-status" role="status"><span className="stage-status-dot" />{status}</p>}
          {notice && <p className="thread-notice" role="status">{notice}</p>}
          <div ref={endRef} />
        </div>

        <div className="pulp-panel-dock">
          {profile && !busy && (
            <div className="stage-suggest compact" aria-label="Suggestions">
              {SUGGESTIONS.map(([label, msg, Icon]) => <button key={msg} type="button" onClick={() => send(msg)}><Icon size={13} aria-hidden="true" />{label}</button>)}
            </div>
          )}
          <form className={`stage-input ${voice ? 'listening' : ''}`} onSubmit={(e) => { e.preventDefault(); send(draft) }}>
            <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={profile ? 'Tell Pulp what’s on your mind…' : 'Load an account first…'} disabled={!profile || busy} aria-label="Message Pulp" maxLength={2000} />
            <button type="button" className="stage-chip" onClick={() => send('twist:cards')} disabled={!profile || busy} title="Pick a twist card"><Dice5 size={15} aria-hidden="true" /><span>Cards</span></button>
            <button type="button" className="stage-chip" onClick={() => send('twist:random')} disabled={!profile || busy} title="Deal a random twist"><Shuffle size={15} aria-hidden="true" /><span>Shuffle</span></button>
            <button type="button" className={`stage-mic ${voice ? 'on' : ''}`} onClick={() => void toggleVoice()} disabled={!profile} aria-label={voice ? 'Stop voice conversation' : 'Start voice conversation'}>{voice ? <Square size={15} /> : <Mic size={16} />}<span>{voice ? (voiceReady ? 'Listening · Stop' : 'Connecting…') : 'Talk'}</span></button>
            <button className="stage-send" aria-label="Send to Pulp" disabled={!draft.trim() || !profile || busy}><ArrowUp size={17} /></button>
          </form>
          <p className="pulp-panel-foot">Every number comes from the engine. Nothing is saved until you confirm it.</p>
        </div>
      </aside>
      <Backstage open={pulpOpen && backstage} onClose={() => setBackstage(false)} personas={personas} feed={feed} active={active} />
    </>
  )
}
