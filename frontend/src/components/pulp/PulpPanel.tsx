/* Pulp as a side companion: a mascot button that opens a panel with the conversation and the live voice agent.
   With Agents on, the panel widens and the agent workflow runs live in a column to the left of the chat.
   Every number Pulp shows still comes from the engine; agents update the profile directly, logged and undoable. */
import { ArrowUp, Maximize2, Mic, RotateCcw, Shuffle, Square, Users, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Tangerine } from '../PulpMascot'
import PulpText from '../stage/PulpText'
import Visual from '../stage/Visual'
import ThreadFigure from '../stage/ThreadFigure'
import LifePlansView from '../plans/LifePlansView'
import AgentSymbol from '../agents/AgentSymbol'
import WorkflowColumn from '../agents/WorkflowColumn'
import VisualPane, { type PopoutItem } from '../agents/VisualPopout'
import { EXPLAIN_NAMES } from '../ExplainButton'
import { startVoice, type VoiceSession } from '../../services/voice'
import { API_BASE, api, type Beat, type DeckCard, type LifePlanResult, type Persona, type ProfileChange, type Proposal, type StageAgentEvent, type StageHandoffEvent, type StageMemoryEvent, type StageProfileEvent, type Storyboard, type TraceEvent } from '../../services/api'
import { useApp } from '../../stores/useApp'
import { short, toolWords, useActiveAgents, useAgentFeed } from '../../stores/agentFeed'
import '../../stage.css'
import './pulp-panel.css'

const fieldNames: Record<string, string> = { goals: 'Goal', concerns: 'Concern', constraints: 'Planning detail', preferences: 'Preference', upcoming_events: 'Life event' }
const GREETING = 'Hi, I’m Pulp. Ask me about your money, talk it through out loud, or draw a twist card to see how you would hold up.'

type Msg =
  | { id: string; kind: 'walkthrough'; beats: Beat[]; autoplay?: boolean }
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'pulp'; text: string; beat?: Beat }
  /** A texting-style reply: a short grounded answer with a compact visual on its left; more scenes open in the pane. */
  | { id: string; kind: 'reply'; text: string; beats: Beat[] }
  | { id: string; kind: 'proposal'; proposal: Proposal }
  | { id: string; kind: 'card'; card: { key: string; title: string } }
  | { id: string; kind: 'profile'; changes: ProfileChange[]; spoken: string }
  | { id: string; kind: 'plans'; result: LifePlanResult }

const readFlag = (key: string, fallback = false) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v === '1' } catch { return fallback } }
const writeFlag = (key: string, v: boolean) => { try { localStorage.setItem(key, v ? '1' : '0') } catch { /* ignore */ } }
/** A twist command: `twist:random`, `twist:<key>` or `twist:<key>@<character_id>` (from "Ask Pulp about this card"). */
const twistKey = (m: string) => m.startsWith('twist:') ? m.slice(6).split('@')[0] : null
const cardWords = (key: string) => key.replace(/^p_/, '').replaceAll('_', ' ')
/** `explain:<topic>?…` from an Explain button: shown in the thread as "Explain: <section>". */
const explainLabel = (m: string) => { const i = m.indexOf('explain:'); if (i < 0) return null; const topic = m.slice(i + 8).split(/[?\s]/)[0]; return `Explain: ${EXPLAIN_NAMES[topic] ?? topic.replaceAll('_', ' ')}` }
const turnLabel = (m: string) => explainLabel(m) ?? turnLabel0(m)
const turnLabel0 = (m: string) => m === 'decision:small' ? 'An everyday decision' : m === 'decision:big' ? 'A bigger life decision' : m === '__intro__' ? 'What should I know about my money?' : m === 'twist:cards' ? 'Twist cards' : m === 'twist:random' ? 'Shuffle a twist' : twistKey(m) ? `Twist: ${cardWords(twistKey(m)!)}` : m.length > 70 ? m.slice(0, 69) + '…' : m
const userText = (m: string) => explainLabel(m) ?? userText0(m)
const userText0 = (m: string) => m === 'decision:small' ? 'Help me with an everyday decision.' : m === 'decision:big' ? 'Help me with a bigger life decision.' : m === '__intro__' ? 'What should I know about my money?' : m === 'twist:cards' ? 'Show me the twist cards.' : m === 'twist:random' ? 'Shuffle a twist' : twistKey(m) ? 'Tell me about this card' : m
let seq = 0
const nid = (p: string) => `${p}-${++seq}`

/* The whole thread, visuals included, is kept per account in this browser so scrolling back (or reloading) still shows
   every figure. Plan results are trimmed (no candidate list or trace) to stay small. Cleared on sign-out. */
const THREAD_KEY = (id: number) => `pulp.thread.${id}`
const THREAD_MAX = 60
function slimMsg(m: Msg): Msg {
  if (m.kind !== 'plans') return m
  const r = m.result
  return { ...m, result: { ...r, trace: [], search: r.search ? { ...r.search, candidates: [] } : r.search } }
}
function saveThread(id: number, thread: Msg[]) {
  try {
    let items = thread.slice(-THREAD_MAX).map(slimMsg)
    let json = JSON.stringify(items)
    while (json.length > 1_500_000 && items.length > 10) { items = items.slice(Math.ceil(items.length / 4)); json = JSON.stringify(items) }
    localStorage.setItem(THREAD_KEY(id), json)
  } catch { /* storage full or blocked: the live thread still works */ }
}
function loadThread(id: number): Msg[] | null {
  try {
    const raw = localStorage.getItem(THREAD_KEY(id))
    const items = raw ? (JSON.parse(raw) as Msg[]) : null
    if (!items?.length) return null
    return items.map((m) => ({ ...m, id: nid('s'), ...(m.kind === 'walkthrough' ? { autoplay: false } : {}) }))
  } catch { return null }
}
export function clearSavedThreads() {
  try { Object.keys(localStorage).filter((k) => k.startsWith('pulp.thread.')).forEach((k) => localStorage.removeItem(k)) } catch { /* ignore */ }
}
const feed = () => useAgentFeed.getState()

export default function PulpPanel() {
  const { profile, pulpOpen, openPulp, closePulp } = useApp()
  const navigate = useNavigate()
  const id = profile?.account_id ?? null

  const [thread, setThread] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mute, setMute] = useState(() => readFlag('pulp.mute'))
  const [voice, setVoice] = useState(false)
  const [voiceReady, setVoiceReady] = useState(false)
  const [live, setLive] = useState({ user: '', assistant: '' })
  const [agentsOn, setAgentsOn] = useState(() => readFlag('pulp.agents'))
  const [popoutOn, setPopoutOn] = useState(() => readFlag('pulp.popout', true))
  const [popout, setPopout] = useState<PopoutItem | null>(null)
  const [sideView, setSideView] = useState<'visual' | 'agents'>('agents')
  const [undoing, setUndoing] = useState<string | null>(null)
  const [undone, setUndone] = useState<Set<string>>(new Set())
  const [personas, setPersonas] = useState<Persona[]>([])
  const active = useActiveAgents()
  const voiceStop = useRef<VoiceSession | null>(null)
  const voiceRequest = useRef(0)
  const liveText = useRef({ user: '', assistant: '' })
  const interacted = useRef(false)
  const voiceTurn = useRef<number | null>(null)
  const source = useRef<EventSource | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const deck = useRef<DeckCard[] | null>(null)
  const popoutRef = useRef<PopoutItem | null>(null)
  const popoutOnRef = useRef(popoutOn)
  const agentsOnRef = useRef(agentsOn)
  agentsOnRef.current = agentsOn
  popoutRef.current = popout
  popoutOnRef.current = popoutOn

  useEffect(() => writeFlag('pulp.mute', mute), [mute])
  useEffect(() => writeFlag('pulp.agents', agentsOn), [agentsOn])
  useEffect(() => writeFlag('pulp.popout', popoutOn), [popoutOn])
  useEffect(() => { if (pulpOpen && !personas.length) api.personas().then((r) => setPersonas(r.personas)).catch(() => undefined) }, [pulpOpen, personas.length])
  useEffect(() => { if (pulpOpen) endRef.current?.scrollIntoView({ block: 'end' }) }, [thread, status, live, pulpOpen])

  /** Open new visuals larger, in the centre of the screen; the thumbnail stays in the chat. */
  const offerPopout = useCallback((beats: Beat[]) => {
    const shown = beats.filter((b) => b.visual !== 'none')
    if (!shown.length || !popoutOnRef.current || !useApp.getState().pulpOpen) return
    setPopout({ beats: shown, index: 0 })
    // With Agents open, keep the workflow in view; the visual waits one tab away.
    if (!agentsOnRef.current) setSideView('visual')
  }, [])

  /* Events that add something to the thread, whichever channel they arrive on (typed SSE or voice). */
  const onProfile = useCallback((d: StageProfileEvent) => {
    if (!d?.changes?.length) return
    // An undo (saying "no" right after an update) points at the change it reverses; strike that one through.
    const reversed = d.changes.map((c) => (c as ProfileChange & { undoes?: string }).undoes).filter((x): x is string => !!x)
    if (reversed.length) setUndone((s) => { const n = new Set(s); reversed.forEach((x) => n.add(x)); return n })
    setThread((t) => [...t, { id: nid('pf'), kind: 'profile', changes: d.changes, spoken: d.spoken }])
    void useApp.getState().refreshContext()
  }, [])
  const onPlans = useCallback((d: LifePlanResult) => {
    if (!d?.plans?.length) return
    setThread((t) => [...t, { id: nid('lp'), kind: 'plans', result: d }])
  }, [])

  const endVoice = useCallback(() => {
    voiceRequest.current++
    voiceStop.current?.(); voiceStop.current = null
    voiceTurn.current = null
    setVoice(false); setVoiceReady(false); setLive({ user: '', assistant: '' })
  }, [])

  /* ---- one typed turn over server-sent events */
  const run = useCallback((message: string) => {
    if (!id) return
    endVoice()
    source.current?.close()
    interacted.current = true
    setBusy(true); setStatus('Squeezing…'); setNotice(null)
    const bubble = nid('u')
    setThread((t) => [...t, { id: bubble, kind: 'user', text: userText(message) }])
    const rename = (title: string) => setThread((t) => t.map((m) => m.id === bubble && m.kind === 'user' ? { ...m, text: `Tell me about ${title}` } : m))
    const asked = twistKey(message)
    const namedCard = !!asked && asked !== 'random' && asked !== 'cards'
    if (namedCard) void findCardTitle(id, asked!).then((title) => { if (title) rename(title) })
    const turn = feed().startTurn(turnLabel(message), 'text')
    feed().push({ t: 0, agent: 'you', kind: 'handoff', to: message.startsWith('twist:') ? 'director' : 'companion', title: message.startsWith('twist:') ? 'A twist card' : 'Your message', items: [userText(message)] }, turn)
    // Twists go through the Shock Dealer, Director and council like any turn; the server falls back to a grounded
    // offline answer by itself when no model is available.
    const es = new EventSource(`${API_BASE}/api/agent/stage?account_id=${id}&message=${encodeURIComponent(message)}`)
    source.current = es
    const mine = () => source.current === es
    // A memory proposal (older backend) is shown only when no direct profile update arrived for the same turn.
    let gotProfile = false
    let proposal: Proposal | null = null
    // Plans arrive before the storyboard; show them after Pulp's reply so the answer reads first.
    let plans: LifePlanResult | null = null
    const flushPlans = () => { if (plans) { const d = plans; plans = null; onPlans(d) } }
    const on = <T,>(name: string, handle: (d: T) => void) => es.addEventListener(name, (e) => {
      if (!mine()) return
      try { handle(JSON.parse((e as MessageEvent).data) as T) } catch { /* a malformed event never breaks the turn */ }
    })
    on<StageAgentEvent>('agent', (d) => {
      feed().pushAgent(d, turn)
      if (d.kind === 'tool_call' && d.tool) setStatus(`Pulp is ${toolWords(d.tool).toLowerCase()}…`)
      else if (d.agent === 'engine' && d.summary) setStatus(d.summary)
      else if (d.kind === 'text' && d.agent !== 'engine') setStatus(`${d.agent === 'director' ? 'Pulp' : d.agent} is writing…`)
    })
    on<StageHandoffEvent>('handoff', (d) => feed().pushHandoff(d, turn))
    on<TraceEvent>('trace', (d) => feed().pushTrace(d, turn))
    on<StageProfileEvent>('profile', (d) => { gotProfile = true; feed().pushProfile(d, turn); onProfile(d) })
    on<LifePlanResult>('lifeplans', (d) => { feed().pushPlans(d, turn); plans = d })
    on<StageMemoryEvent>('memory', (d) => { if (d.proposal?.changes?.length) proposal = d.proposal })
    on<Storyboard>('storyboard', (d) => {
      const beats = (d.beats ?? []).map((b) => ({ ...b, id: nid(b.id) }))
      const card = d.card as { key?: string; title?: string } | undefined
      if (namedCard && card?.title) rename(card.title)
      const reply = (d as Storyboard & { reply?: string | null }).reply
      if (reply) {
        // Texting style: one short grounded reply with a compact visual; the other scenes live in the visual pane.
        const visuals = beats.filter((b) => b.visual !== 'none')
        setThread((th) => [...th, { id: nid('r'), kind: 'reply', text: reply, beats: visuals },
          ...(card?.key && card.title ? [{ id: nid('c'), kind: 'card' as const, card: { key: card.key, title: card.title } }] : [])])
        setStatus(null)
        offerPopout(visuals)
        flushPlans()
        return
      }
      const next: Msg[] = []
      let scenes: Beat[] = []
      const flush = () => {
        if (scenes.length > 1) next.push({ id: nid('w'), kind: 'walkthrough', beats: scenes })
        else if (scenes.length) next.push({ id: nid('m'), kind: 'pulp', text: scenes[0].caption, beat: scenes[0] })
        scenes = []
      }
      for (const b of beats) { if (b.visual !== 'none') scenes.push(b); else { flush(); next.push({ id: nid('m'), kind: 'pulp', text: b.caption }) } }
      flush()
      if (card?.key && card.title) next.push({ id: nid('c'), kind: 'card', card: { key: card.key, title: card.title } })
      setThread((th) => [...th, ...next])
      flushPlans()
      setStatus(null)
      offerPopout(beats)
    })
    es.addEventListener('done', () => {
      if (!mine()) return
      flushPlans()
      if (proposal && !gotProfile) { const p = proposal; setThread((th) => [...th, { id: nid('p'), kind: 'proposal', proposal: p }]) }
      es.close(); setBusy(false); setStatus(null); void useApp.getState().refreshSession().catch(() => undefined) })
    es.addEventListener('error', (e) => {
      if (!mine()) return
      const data = (e as MessageEvent).data
      if (data) { try { setNotice(JSON.parse(data).message ?? 'Something went wrong.') } catch { setNotice('Something went wrong.') } }
      else if (es.readyState === EventSource.CLOSED) setNotice('The connection dropped. Try again.')
      es.close(); setBusy(false); setStatus(null); setDraft(message)
    })
  }, [id, endVoice, onProfile, onPlans, offerPopout])

  /* ---- live voice (Gemini native audio through the backend relay) */
  const toggleVoice = async () => {
    if (voice) { endVoice(); return }
    if (!id) return
    endVoice()
    source.current?.close(); source.current = null
    setBusy(false); setStatus(null)
    const request = ++voiceRequest.current
    voiceTurn.current = feed().startTurn('Voice conversation', 'voice')
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
        if (m.type === 'walkthrough') { setThread((t) => [...t, { id: nid('vw'), kind: 'walkthrough', beats: m.beats, autoplay: false }]); offerPopout(m.beats) }
        if (m.type === 'visual') { setThread((t) => [...t, { id: nid('v'), kind: 'pulp', text: m.beat.caption, beat: m.beat }]); offerPopout([m.beat]) }
        if (m.type === 'context_proposal') setThread((t) => [...t, { id: nid('p'), kind: 'proposal', proposal: m.proposal }])
        if (m.type === 'pipeline_event') {
          // The voice relay forwards the same event names as the typed stream, including profile and lifeplans.
          const event = String((m as { event: string }).event)
          const data = m.data as unknown
          feed().pushNamed(event, data, voiceTurn.current ?? undefined)
          if (event === 'profile') onProfile(data as StageProfileEvent)
          if (event === 'lifeplans') onPlans(data as LifePlanResult)
        }
        if (m.type === 'state_changed') void useApp.getState().refreshSession().catch(() => setNotice('Could not refresh your plan.'))
        if (m.type === 'status') {
          if (m.message) voiceTurn.current = feed().startTurn('Voice conversation', 'voice')
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
    setBusy(false); setStatus(null); setNotice(null); setPopout(null); setUndone(new Set())
    feed().reset()
    const saved = id ? loadThread(id) : null
    setThread(saved ?? (id ? [{ id: nid('g'), kind: 'pulp', text: GREETING }] : []))
    let cancelled = false
    if (id && !saved) api.context(id).then(({ context }) => {
      if (cancelled || interacted.current) return
      const history = context.conversation.slice(-16).map((m) => ({ id: nid('h'), kind: m.role === 'user' ? 'user' as const : 'pulp' as const, text: m.role === 'user' ? userText(m.text) : m.text }))
      if (history.length) setThread(history)
    }).catch(() => undefined)
    return () => { cancelled = true; endVoice(); source.current?.close(); source.current = null }
  }, [id, endVoice])

  /* ---- keep the thread, visuals included, so history survives scrolling, closing and reloading */
  useEffect(() => {
    if (!id || !thread.length) return
    const t = window.setTimeout(() => saveThread(id, thread), 400)
    return () => window.clearTimeout(t)
  }, [id, thread])

  /* ---- opening: focus the input, run a seeded message from a page, Escape closes (a pop-out first) */
  useEffect(() => {
    if (!pulpOpen) { endVoice(); setPopout(null); return }
    const seed = useApp.getState().takePulpSeed()
    if (seed && id) dispatchSeed(seed)
    window.setTimeout(() => inputRef.current?.focus(), 0)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !popoutRef.current && !e.defaultPrevented) closePulp() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [pulpOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  /* A page asked Pulp something (an Explain button, "Ask Pulp about this card"). While a voice conversation is live,
     explain requests go through it so Pulp says the answer; otherwise they take the typed path. */
  const dispatchSeed = (seed: string) => {
    if (seed.includes('explain:') && voice && voiceStop.current) {
      if (voiceStop.current.sendText(`Please explain this part of the app simply: ${seed}`)) {
        setThread((items) => [...items, { id: nid('u'), kind: 'user', text: userText(seed) }])
        return
      }
    }
    run(seed)
  }
  const pendingSeed = useApp((s) => s.pulpSeed)
  useEffect(() => {
    if (!pulpOpen || !pendingSeed || !id) return
    const seed = useApp.getState().takePulpSeed()
    if (seed) dispatchSeed(seed)
  }, [pendingSeed]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const undo = async (c: ProfileChange) => {
    if (!id) return
    setUndoing(c.id)
    try {
      await api.undoChange(id, c.id)
      setUndone((s) => new Set(s).add(c.id))
      feed().push({ t: 0, agent: 'you', kind: 'handoff', to: 'profile', title: 'Undo a change', items: [`${c.label}: back to ${short(c.before)}`] })
      await useApp.getState().refreshContext()
    } catch { setNotice('Could not undo that change. Try again from your profile.') } finally { setUndoing(null) }
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

  const closeVisual = () => { setPopout(null); setSideView('agents') }
  // The left column: the visual when one is open and chosen, else the agent workflow when Agents is on.
  const side: 'visual' | 'agents' | null = popout ? sideView : agentsOn ? 'agents' : null
  const mood = voice ? 'listening' : busy ? 'thinking' : 'idle'
  return (
    <>
      {!pulpOpen && (
        <button type="button" className="pulp-launcher" aria-label="Talk to Pulp" aria-expanded={false} aria-controls="pulp-panel" onClick={() => openPulp()}>
          <Tangerine mood={mood} />
          {active.size > 0 && <i className="pulp-launcher-dot" aria-hidden="true" />}
        </button>
      )}
      <aside id="pulp-panel" className={`pulp-panel ${side ? `with-side side-${side}` : ''}`} aria-label="Pulp conversation" hidden={!pulpOpen}>
        {side && (
          <div className="pulp-side">
            {popout && (
              <div className="pulp-side-tabs" role="tablist" aria-label="Left column">
                <button type="button" role="tab" aria-selected={side === 'visual'} onClick={() => setSideView('visual')}>Visual</button>
                <button type="button" role="tab" aria-selected={side === 'agents'} onClick={() => setSideView('agents')}>Agents</button>
              </div>
            )}
            {side === 'visual' && popout
              ? <VisualPane item={popout} onClose={closeVisual} onMove={(index) => setPopout((p) => p && { ...p, index: Math.max(0, Math.min(p.beats.length - 1, index)) })} onAction={send} />
              : <WorkflowColumn personas={personas} />}
          </div>
        )}
        <div className="pulp-panel-main">
          <header className="pulp-panel-head">
            <span className="pulp-panel-avatar" aria-hidden="true"><Tangerine mood={mood} /></span>
            <div className="pulp-panel-title"><strong>Pulp</strong><span>{voice ? (voiceReady ? 'Listening' : 'Connecting…') : busy ? 'Squeezing…' : 'Your planning companion'}</span></div>
            <button type="button" className={`pulp-agents ${agentsOn ? 'on' : ''}`} aria-pressed={agentsOn} onClick={() => setAgentsOn((v) => !v)} title="Show the agent workflow beside the chat">
              <Users size={14} aria-hidden="true" />Agents{active.size > 0 && <i className="stage-live-dot" aria-hidden="true" />}
            </button>
            <button type="button" className={`pulp-icon ${popoutOn ? 'on' : ''}`} aria-pressed={popoutOn} aria-label="Pop out visuals" title={popoutOn ? 'Visuals open larger (on)' : 'Visuals stay in the chat (off)'} onClick={() => setPopoutOn((v) => !v)}><Maximize2 size={15} /></button>
            <button type="button" className="pulp-icon" aria-label={mute ? 'Unmute Pulp' : 'Mute Pulp'} onClick={() => { voiceStop.current?.setMuted(!mute); setMute(!mute) }}>{mute ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
            <button type="button" className="pulp-icon" aria-label="Close Pulp" onClick={closePulp}><X size={17} /></button>
          </header>

          <div className="pulp-panel-thread thread" aria-live="polite">
            {!profile && <p className="pulp-panel-empty">Load a demo account first. Then ask Pulp anything, or press the mic and talk it through.</p>}
            {profile && thread.map((m) => {
              if (m.kind === 'user') return <div key={m.id} className="msg user"><p>{m.text}</p></div>
              if (m.kind === 'proposal') return (
                <div key={m.id} className="msg pulp noted">
                  <div className="msg-body"><div className="noted-row" role="status"><span>Pulp noted</span>{m.proposal.changes.map((c, i) => <b key={i}>{fieldNames[c.field] ?? c.field}: {String(c.value.label ?? String(c.value.type ?? '').replaceAll('_', ' '))}</b>)}</div></div>
                </div>
              )
              if (m.kind === 'profile') return (
                <div key={m.id} className="msg pulp">
                  <section className="pulp-profile-card" aria-label="Pulp updated your profile">
                    <header><strong>{m.changes.every((c) => c.kind === 'undo') ? 'Pulp took that back' : 'Pulp updated your profile'}</strong><Link to="/profile" onClick={() => { if (window.innerWidth <= 720) closePulp() }}>See your profile</Link></header>
                    {m.spoken && <p className="pulp-profile-spoken">{m.spoken}</p>}
                    <ul>
                      {m.changes.map((c) => {
                        const gone = undone.has(c.id) || c.undone
                        return (
                          <li key={c.id} className={gone ? 'undone' : ''}>
                            <AgentSymbol agent={c.agent} size={22} personas={personas} title={`Changed by ${c.agent.replaceAll('_', ' ')}`} />
                            <span className="pulp-change"><b>{c.label || fieldNames[c.field] || c.field}</b><span>{short(c.before)} <i aria-hidden="true">→</i><span className="sr-only">to</span> {short(c.after)}</span>{c.reason && <small>{c.reason}</small>}</span>
                            {c.kind === 'undo' ? <em>Taken back</em> : gone ? <em>Undone</em> : <button type="button" onClick={() => void undo(c)} disabled={undoing === c.id} aria-label={`Undo: ${c.label || c.field}`}><RotateCcw size={12} />Undo</button>}
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                </div>
              )
              if (m.kind === 'plans') return (
                <div key={m.id} className="msg pulp has-figure">
                  <div className="msg-body pulp-plans-card">
                    <LifePlansView result={m.result} compact />
                  </div>
                </div>
              )
              if (m.kind === 'reply') return (
                <div key={m.id} className="msg pulp pulp-reply">
                  {m.beats[0] && (
                    <div className="pulp-mini">
                      <div className="pulp-mini-canvas" aria-hidden="true" inert><Visual beat={m.beats[0]} /></div>
                      <button type="button" className="pulp-mini-open" onClick={() => { setPopout({ beats: m.beats, index: 0 }); setSideView('visual') }} aria-label={m.beats.length > 1 ? `Open the ${m.beats.length} scenes larger` : 'Open the visual larger'}>{m.beats.length > 1 && <span>{m.beats.length} scenes</span>}</button>
                    </div>
                  )}
                  <div className="msg-body"><PulpText text={m.text} /></div>
                </div>
              )
              if (m.kind === 'card') return (
                <div key={m.id} className="msg pulp">
                  <div className="msg-body"><button type="button" className="pulp-official" onClick={() => void showOfficial(m.card.key)}>See the official numbers for “{m.card.title}” in Shocks</button></div>
                </div>
              )
              // Several scenes: a compact thumbnail and the first line, like a texted picture; the scenes open in the left column.
              if (m.kind === 'walkthrough') return (
                <div key={m.id} className="msg pulp pulp-reply">
                  {m.beats[0] && (
                    <div className="pulp-mini">
                      <div className="pulp-mini-canvas" aria-hidden="true" inert><Visual beat={m.beats[0]} /></div>
                      <button type="button" className="pulp-mini-open" onClick={() => { setPopout({ beats: m.beats, index: 0 }); setSideView('visual') }} aria-label={`Open the ${m.beats.length} scenes larger`}><span>{m.beats.length} scenes</span></button>
                    </div>
                  )}
                  <div className="msg-body"><PulpText text={m.beats[0]?.caption ?? ''} /></div>
                </div>
              )
              return (
                <div key={m.id} className={`msg pulp ${m.beat && m.beat.visual !== 'none' ? 'has-figure' : ''}`}>
                  <div className="msg-body">
                    <PulpText text={m.text} />
                    {m.beat && <ThreadFigure beat={m.beat} onReplay={() => replay(m.text)} onAction={send} />}
                  </div>
                </div>
              )
            })}
            {voice && (
              <div className="pulp-live" aria-live="polite">
                {live.user && <p className="pulp-live-you">{live.user}</p>}
                <p className="pulp-live-line"><span className={`pulp-live-wave ${live.assistant ? 'speaking' : ''}`} aria-hidden="true"><i /><i /><i /></span>{live.assistant ? <span>{live.assistant}</span> : <span className="pulp-live-hint">{voiceReady ? (live.user ? 'Pulp is thinking…' : 'Listening… go ahead and talk') : 'Connecting…'}</span>}</p>
              </div>
            )}
            {status && <p className="thread-status" role="status">{busy && /^Squeez/.test(status) ? <span className="pulp-drip" aria-hidden="true"><i /></span> : <span className="stage-status-dot" />}{status}</p>}
            {notice && <p className="thread-notice" role="status">{notice}</p>}
            <div ref={endRef} />
          </div>

          <div className="pulp-panel-dock">
            <form className={`stage-input ${voice ? 'listening' : ''}`} onSubmit={(e) => { e.preventDefault(); send(draft) }}>
              <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={profile ? 'Tell Pulp what’s on your mind…' : 'Load an account first…'} disabled={!profile || busy} aria-label="Message Pulp" maxLength={2000} />
              <button type="button" className="stage-chip" onClick={() => send('twist:random')} disabled={!profile || busy} title="Deal a random twist"><Shuffle size={15} aria-hidden="true" /><span>Shuffle</span></button>
              {/* Talk: with a typed draft it sends the draft like Send; with nothing typed it starts (or stops) voice. */}
              <button type="button" className={`stage-mic pulp-talk ${voice ? 'on' : ''}`} onClick={() => { if (!voice && draft.trim()) send(draft); else void toggleVoice() }} disabled={!profile || (busy && !voice && !!draft.trim())} aria-label={voice ? 'Stop voice conversation' : draft.trim() ? 'Talk: send what you typed' : 'Start voice conversation'} title={voice ? (voiceReady ? 'Listening, press to stop' : 'Connecting…') : draft.trim() ? 'Send what you typed' : 'Talk out loud'}>{voice ? <Square size={15} /> : <Mic size={17} />}</button>
              <button className="stage-send" aria-label="Send to Pulp" disabled={!draft.trim() || !profile || busy}><ArrowUp size={17} /></button>
            </form>
            <p className="pulp-panel-foot">Every number comes from the engine. Profile changes are logged and can be undone.</p>
          </div>
        </div>
      </aside>
    </>
  )
}

/** The title of a card from this account's personal deck (or the generic deck), for the user's bubble. */
async function findCardTitle(id: number, key: string): Promise<string | null> {
  try { const own = await api.personalDeck(id); const hit = own.cards.find((c) => c.key === key); if (hit) return hit.title } catch { /* fall through */ }
  try { const all = await api.deck(); return all.cards.find((c) => c.key === key)?.title ?? null } catch { return null }
}
