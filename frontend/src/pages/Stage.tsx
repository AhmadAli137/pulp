/* Conversation-first home: native live audio, concise text replies, and optional inline figures.
   The microphone starts only after the person chooses Talk to Pulp.
   NOT ROUTED: App.tsx no longer mounts this page and nothing imports it. Kept for reference only; its old menu does not
   reflect the four-tab navigation in components/workspace.tsx. */
import { ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronDown, Compass, Dice5, LoaderCircle, Menu, Mic, RotateCcw, Shuffle, Sparkles, Square, Users, Volume2, VolumeX, Wallet, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PulpMark, Tangerine, clearIntroSeen } from '../components/PulpMascot'
import Backstage, { splitKeys, type FeedItem } from '../components/stage/Backstage'
import PulpText from '../components/stage/PulpText'
import ThreadFigure from '../components/stage/ThreadFigure'
import AnimatedWalkthrough from '../components/stage/AnimatedWalkthrough'
import { startVoice, type VoiceSession } from '../services/voice'
import { API_BASE, api, type Beat, type Persona, type Proposal, type SampleAccount, type StageAgentEvent, type StageHandoffEvent, type StageMemoryEvent, type Storyboard } from '../services/api'
import { useApp } from '../stores/useApp'
import CurrentPlan from '../components/CurrentPlan'
import ResilienceEntry from '../components/ResilienceEntry'
import { ACCOUNT_PAGES, HOW_IT_WORKS, PRIMARY_WORKSPACE, WorkspaceNav } from '../components/workspace'
import '../stage.css'


const TOOL_WORDS: Record<string, string> = { calculate_shock: 'running the shock', deal_or_set_shock: 'setting up the shock', get_profile: 'reading your numbers', get_financial_profile: 'reading your numbers', score_strategy: 'scoring an idea', run_council: 'asking the council', compare_strategies: 'comparing plans', get_insights: 'reading your profile', get_cohort: 'looking at people like you', show_math: 'writing out the math', simulate: 'simulating months' }
const fieldNames: Record<string, string> = { goals: 'Goal', concerns: 'Concern', constraints: 'Planning detail', preferences: 'Preference', upcoming_events: 'Life event' }
const GREETING = 'What would you like to feel more prepared for?'
const SUGGESTIONS: [string, string, typeof Sparkles][] = [['What should I know about my money?', '__intro__', Sparkles], ['Try a life scenario', 'twist:cards', Dice5], ['A small everyday decision', 'decision:small', Wallet], ['A bigger life decision', 'decision:big', Compass]]

type Msg =
  | { id: string; kind: 'walkthrough'; beats: Beat[]; autoplay?: boolean }
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'pulp'; text: string; beat?: Beat }
  | { id: string; kind: 'proposal'; proposal: Proposal }
  | { id: string; kind: 'glance' }
type QueueItem = { kind: 'walkthrough'; beats: Beat[] } | { kind: 'beat'; beat: Beat } | { kind: 'proposal'; proposal: Proposal } | { kind: 'text'; text: string }

const readFlag = (key: string) => { try { return localStorage.getItem(key) === '1' } catch { return false } }
const turnLabel = (m: string) => m === 'decision:small' ? 'Help me with an everyday decision.' : m === 'decision:big' ? 'Help me with a bigger life decision.' : m === '__intro__' ? 'What should I know about my money?' : m === 'twist:cards' ? 'Twist cards' : m === 'twist:random' ? 'Shuffle the deck' : m.startsWith('twist:') ? `Twist: ${m.slice(6).replaceAll('_', ' ')}` : m.length > 70 ? m.slice(0, 69) + '…' : m
const userText = (m: string) => m === 'decision:small' ? 'Help me with an everyday decision.' : m === 'decision:big' ? 'Help me with a bigger life decision.' : m === '__intro__' ? 'What should I know about my money?' : m === 'twist:cards' ? 'Show me the twist cards.' : m === 'twist:random' ? 'Shuffle the deck and deal me one.' : m.startsWith('twist:') ? `Deal the “${m.slice(6).replaceAll('_', ' ')}” card.` : m
let seq = 0
const nid = (p: string) => `${p}-${++seq}`

export default function Stage({ onReplayIntro }: { onReplayIntro: () => void }) {
  const { accountId, profile, loadAccount, loadingProfile, profileError, setGemini } = useApp()
  const nav = useNavigate()
  const [voice, setVoice] = useState(false)
  const [voiceReady, setVoiceReady] = useState(false)
  const [live, setLive] = useState({ user: '', assistant: '' })
  const voiceStop = useRef<VoiceSession | null>(null)
  const voiceRequest = useRef(0)
  const liveText = useRef({ user: '', assistant: '' })
  const [inputId, setInputId] = useState(accountId ? String(accountId) : '')
  const [samples, setSamples] = useState<SampleAccount[]>([])
  const [menu, setMenu] = useState(false)
  const [selector, setSelector] = useState(false)
  const [draft, setDraft] = useState('')
  const [thread, setThread] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [glanceOpen, setGlanceOpen] = useState(false)
  const [mute, setMute] = useState(() => readFlag('pulp.mute'))
  const [searchParams] = useSearchParams()
  useEffect(() => { const prompt = searchParams.get('prompt'); if (prompt) setDraft(prompt) }, [searchParams])
  const [backstage, setBackstage] = useState(false)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [active, setActive] = useState<Set<string>>(new Set())
  const interacted = useRef(false)
  const turn = useRef(0)
  const activeTimers = useRef<Map<string, number>>(new Map())
  const source = useRef<EventSource | null>(null)
  const queue = useRef<QueueItem[]>([])
  const pumping = useRef(false)
  const pumpTimer = useRef<number | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const muteRef = useRef(mute)
  const id = profile?.account_id ?? null

  useEffect(() => { muteRef.current = mute; try { localStorage.setItem('pulp.mute', mute ? '1' : '0') } catch { /* ignore */ } if (mute && 'speechSynthesis' in window) window.speechSynthesis.cancel() }, [mute])
  useEffect(() => {
    api.samples().then((s) => setSamples(s.accounts)).catch(() => undefined)
    api.health().then((h) => setGemini(h.ai_provider !== 'offline', h.ai_label)).catch(() => setGemini(false))
    api.personas().then((r) => setPersonas(r.personas)).catch(() => undefined)
    const saved = (() => { try { return localStorage.getItem('pulp.account') } catch { return null } })()
    if (!useApp.getState().accountId && saved && Number.isInteger(Number(saved))) void loadAccount(Number(saved))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (accountId) setInputId(String(accountId)) }, [accountId])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [thread, status, live])

  /* ---- the beat queue: one Pulp message at a time, spoken, then the next */
  const stopPump = useCallback(() => { if (pumpTimer.current) { clearTimeout(pumpTimer.current); pumpTimer.current = null } pumping.current = false; if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])
  const pump = useCallback(() => {
    if (pumping.current) return
    const item = queue.current.shift()
    if (!item) return
    pumping.current = true
    let done = false
    const next = () => { if (done) return; done = true; pumping.current = false; if (pumpTimer.current) { clearTimeout(pumpTimer.current); pumpTimer.current = null } pump() }
    if (item.kind === 'proposal') { setThread((t) => [...t, { id: nid('p'), kind: 'proposal', proposal: item.proposal }]); pumpTimer.current = window.setTimeout(next, 300); return }
    if (item.kind === 'walkthrough') { setThread(t => [...t, { id: nid('sequence'), kind: 'walkthrough', beats: item.beats }]); pumpTimer.current = window.setTimeout(next, 0); return }
    const text = item.kind === 'text' ? item.text : item.beat.caption
    setThread((t) => [...t, { id: nid('m'), kind: 'pulp', text, beat: item.kind === 'beat' ? item.beat : undefined }])
    pumpTimer.current = window.setTimeout(next, 0)
  }, [])
  const enqueue = useCallback((items: QueueItem[]) => { queue.current.push(...items); pump() }, [pump])

  const endVoice = useCallback(() => {
    voiceRequest.current++
    voiceStop.current?.(); voiceStop.current = null
    setVoice(false); setVoiceReady(false); setLive({ user: '', assistant: '' })
  }, [])

  const toggleVoice = async () => {
    if (voice) { endVoice(); return }
    if (!id) return
    endVoice()
    source.current?.close(); source.current = null
    stopPump(); queue.current = []; setBusy(false); setStatus(null)
    const request = ++voiceRequest.current
    ++turn.current
    interacted.current = true
    setVoice(true); setVoiceReady(false); setMute(false); setNotice(null)
    liveText.current = { user: '', assistant: '' }
    try {
      const stop = await startVoice(id, (m) => {
        if (request !== voiceRequest.current) return
        if (m.type === 'ready') setVoiceReady(true)
        if (m.type === 'transcript') {
          liveText.current = { ...liveText.current, [m.role]: liveText.current[m.role] + m.text }
          setLive(liveText.current)
        }
        if (m.type === 'turn_complete') {
          const text = liveText.current
          setThread((t) => [...t,
            ...(text.user ? [{ id: nid('u'), kind: 'user' as const, text: text.user }] : []),
            ...(text.assistant ? [{ id: nid('m'), kind: 'pulp' as const, text: text.assistant }] : [])])
          liveText.current = { user: '', assistant: '' }; setLive(liveText.current)
        }
        if (m.type === 'walkthrough') setThread(t => [...t, { id: nid('voice-sequence'), kind: 'walkthrough', beats: m.beats, autoplay: false }])
        if (m.type === 'visual') setThread((t) => [...t, { id: nid('v'), kind: 'pulp', text: m.beat.caption, beat: m.beat }])
        if (m.type === 'context_proposal') enqueue([{ kind: 'proposal', proposal: m.proposal }])
        if (m.type === 'pipeline_event') {
          if (m.event === 'handoff') {
            const d = m.data as unknown as StageHandoffEvent
            light([...splitKeys(d.from), ...splitKeys(d.to)])
            pushFeed({ id: nid('voice-handoff'), turn: turn.current, kind: 'handoff', from: d.from, to: d.to, title: d.title, items: d.items ?? [], t: d.t ?? 0 })
          } else {
            const who = String(m.data.agent ?? 'companion')
            light(splitKeys(who))
            pushFeed({ id: nid('voice-event'), turn: turn.current, kind: 'agent', agent: who, t: Number(m.data.t ?? 0), text: String(m.data.summary ?? m.data.tool ?? 'Working on your plan') })
          }
        }
        if (m.type === 'state_changed') void useApp.getState().refreshSession().catch(() => setNotice('Could not refresh your plan.'))
        if (m.type === 'status') {
          if (m.message) { ++turn.current; setActive(new Set()); pushFeed({ id: nid('voice-turn'), turn: turn.current, kind: 'divider', label: 'Voice conversation' }) }
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

  /* ---- one turn */
  const run = useCallback((message: string) => {
    if (!id) return
    endVoice()
    source.current?.close()
    stopPump(); queue.current = []
    interacted.current = true
    setBusy(true); setStatus('Pulp is thinking…'); setNotice(null)
    setThread((t) => [...t, { id: nid('u'), kind: 'user', text: userText(message) }])
    const t = ++turn.current
    pushFeed({ id: `d-${t}`, turn: t, kind: 'divider', label: turnLabel(message) })
    const es = new EventSource(`${API_BASE}/api/agent/stage?account_id=${id}&message=${encodeURIComponent(message)}`)
    source.current = es
    const mine = () => source.current === es
    let n = 0
    es.addEventListener('agent', (e) => {
      if (!mine()) return
      try {
        const d = JSON.parse((e as MessageEvent).data) as StageAgentEvent
        const who = d.agent === 'director' ? 'Pulp' : d.agent
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
          setStatus(`${who} is writing…`)
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
        if (d.proposal) enqueue([{ kind: 'proposal', proposal: d.proposal }])
        light(['companion'])
      } catch { /* ignore */ }
    })
    es.addEventListener('storyboard', (e) => {
      if (!mine()) return
      try {
        const d = JSON.parse((e as MessageEvent).data) as Storyboard
        const items: QueueItem[] = (d.beats ?? []).map((b) => ({ kind: 'beat', beat: { ...b, id: nid(b.id) } }))
        const grouped: QueueItem[] = []
        let scenes: Beat[] = []
        const flush = () => { if (scenes.length > 1) grouped.push({ kind: 'walkthrough', beats: scenes }); else if (scenes.length) grouped.push({ kind: 'beat', beat: scenes[0] }); scenes = [] }
        for (const item of items) { if (item.kind === 'beat' && item.beat.visual !== 'none') scenes.push(item.beat); else { flush(); grouped.push(item) } }
        flush()
        enqueue(grouped)
        setStatus(null)
      } catch { /* ignore */ }
    })
    es.addEventListener('done', () => { if (!mine()) return; es.close(); setBusy(false); setStatus(null); void useApp.getState().refreshSession() })
    es.addEventListener('error', (e) => {
      if (!mine()) return
      const data = (e as MessageEvent).data
      if (data) { try { setNotice(JSON.parse(data).message ?? 'Something went wrong.') } catch { setNotice('Something went wrong.') } }
      else if (es.readyState === EventSource.CLOSED) setNotice('The connection dropped. Try again.')
      es.close(); setBusy(false); setStatus(null); setDraft(message)
    })
  }, [id, light, pushFeed, enqueue, stopPump, endVoice])

  /* New account: a fresh thread with one greeting and the collapsed glance row. Nothing speaks. */
  useEffect(() => {
    endVoice()
    source.current?.close(); source.current = null
    stopPump(); queue.current = []
    interacted.current = false
    setBusy(false); setStatus(null); setNotice(null); setFeed([]); setActive(new Set()); setGlanceOpen(false)
    setThread(id ? [{ id: nid('g'), kind: 'pulp', text: GREETING }, { id: nid('gl'), kind: 'glance' }] : [])
    let cancelled = false
    if (id) api.context(id).then(({ context }) => {
      if (cancelled || interacted.current) return
      const history = context.conversation.slice(-16).map((m) => ({ id: nid('h'), kind: m.role === 'user' ? 'user' as const : 'pulp' as const, text: m.role === 'user' ? userText(m.text) : m.text }))
      if (history.length) setThread(history)
    }).catch(() => undefined)
    return () => { cancelled = true; endVoice(); source.current?.close(); source.current = null; stopPump() }
  }, [id, stopPump, endVoice])

  const send = (text: string) => { const t = text.trim(); if (!t || !id) return; setDraft(''); if (voice) { if (voiceStop.current?.sendText(t)) setThread((items) => [...items, { id: nid('u'), kind: 'user', text: userText(t) }]); else setNotice('Voice is still connecting. Please try again in a moment.'); return } run(t) }
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
  const load = (raw: string) => { const n = Number(raw); if (Number.isInteger(n) && n > 0) { void loadAccount(n); setSelector(false) } }
  const replayIntro = () => { clearIntroSeen(); onReplayIntro() }
  const replay = (text: string) => { if (voice) voiceStop.current?.sendText(`Please explain this again: ${text}`); else setNotice('Start Talk to Pulp to discuss this in the same voice.') }

  const glanceBeat: Beat | null = profile ? { id: 'glance', visual: 'picture', caption: '', duration_s: 0,
    params: { inflow: profile.typical_inflow, outflow: profile.typical_spending, buffer: profile.buffer, months_of_spending: profile.typical_spending > 0 ? profile.buffer / profile.typical_spending : 0, runway_label: profile.baseline_runway_label } } : null

  return (
    <div className={`stage-home ${backstage ? 'with-backstage' : ''}`}>
      <header className="stage-header">
        <div className="stage-brand-group">
          <button className="agent-icon-button" aria-label="Open navigation" onClick={() => setMenu((v) => !v)}><Menu size={19} /></button>
          <a className="agent-brand" href="/" onClick={(e) => { e.preventDefault(); setMenu(false) }}><PulpMark size={31} />PULP<span>.</span></a>
          <span className="agent-brand-caption">a little clarity, for whatever’s next</span>
        </div>
        <div className="stage-header-actions">
          <button className={`stage-backstage-toggle ${backstage ? 'on' : ''}`} aria-pressed={backstage} aria-expanded={backstage} aria-controls="agent-flow" aria-label="Show agent flow" onClick={() => setBackstage((v) => !v)} title="Follow the live agent flow"><Users size={15} />Agents{active.size > 0 && <i className="stage-live-dot" />}</button>
          <button className="agent-icon-button" aria-label={mute ? 'Unmute Pulp' : 'Mute Pulp'} title={mute ? 'Unmute Pulp' : 'Mute Pulp'} onClick={() => { voiceStop.current?.setMuted(!mute); setMute(!mute) }}>{mute ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          <button className="account-trigger" aria-expanded={selector} onClick={() => setSelector((v) => !v)}><span className="demo-dot" />Demo account <b>{profile ? '#' + id : '…'}</b><ChevronDown size={13} /></button>
          <button className="agent-icon-button intro-replay" title="Replay the PULP introduction" aria-label="Replay introduction" onClick={replayIntro}><RotateCcw size={16} /></button>
        </div>
      </header>
      {menu && (<>
        <button className="menu-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />
        <nav className="agent-menu" aria-label="Explore PULP">
          <div><span>THE BIGGER PICTURE</span><button aria-label="Close menu" onClick={() => setMenu(false)}><X size={16} /></button></div>
          {PRIMARY_WORKSPACE.filter(p => p.to !== '/').map(p => <button key={p.to} onClick={() => nav(p.to)}><p.icon size={17} />{p.label}<ArrowUpRight size={14} /></button>)}
          <details className="supporting-nav"><summary>Reviews, evidence & settings</summary>{[...ACCOUNT_PAGES, ...HOW_IT_WORKS].map(p => <button key={p.to} onClick={() => nav(p.to)}>{p.label}<ArrowUpRight size={14}/></button>)}</details>
          <p>Everything Pulp shows comes from these pages' numbers. They stay here when you want the detail.</p>
        </nav>
      </>)}
      {selector && (
        <section className="agent-account-popover" aria-label="Choose an account">
          <span className="agent-small-label">EXPLORE AN ANONYMIZED ACCOUNT</span>
          <form onSubmit={(e) => { e.preventDefault(); load(inputId) }}>
            <label htmlFor="stage-account-input">Account ID</label>
            <div><input id="stage-account-input" value={inputId} onChange={(e) => setInputId(e.target.value)} inputMode="numeric" /><button disabled={loadingProfile}>{loadingProfile ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={17} />}<span className="sr-only">Load account</span></button></div>
          </form>
          <select aria-label="Sample accounts" value="" onChange={(e) => load(e.target.value)}><option value="">Or try a sample account</option>{samples.map((a) => <option key={a.account_id} value={a.account_id}>#{a.account_id} · {a.tag}</option>)}</select>
          <p>Real anonymized records. The selected account does not identify you.</p>
          <button type="button" className="popover-done" onClick={() => setSelector(false)}>Done</button>
        </section>
      )}
      {profileError && <div className="agent-alert" role="alert">{profileError}</div>}

      <WorkspaceNav />
      <ResilienceEntry />
      <div className="conversation-context"><CurrentPlan /></div>
      <div className="stage-body">
        <main className="thread-main">
          {!profile ? (
            <section className="stage-empty">
              <h1>Which account are we looking at?</h1>
              <p>Pick a demo account from the top right. Then tell Pulp what life’s throwing your way.</p>
            </section>
          ) : (
            <div className="thread" aria-live="polite">
              {thread.length <= 2 && <section className="conversation-welcome">
                <span className="editorial-label">Personal perspective / Practical possibilities</span>
                <h1>Prepare for the unexpected.<br /><em>Protect what matters.</em></h1>
                <p>Talk through a setback or a goal. Pulp connects your records to a preparation plan, a backup plan, and the choices only you can make.</p>
                <div className="welcome-art" aria-hidden="true"><i /><i /><i /></div>
              </section>}
              {thread.map((m) => {
                if (m.kind === 'user') return <div key={m.id} className="msg user"><p>{m.text}</p></div>
                if (m.kind === 'glance') return (
                  <div key={m.id} className="msg pulp glance">
                    <span className="msg-avatar" aria-hidden="true"><Tangerine mood="idle" /></span>
                    <div className="msg-body">
                      <button type="button" className={`glance-row ${glanceOpen ? 'open' : ''}`} onClick={() => setGlanceOpen((v) => !v)} aria-expanded={glanceOpen}>
                        <span className="glance-label">Your money at a glance</span>
                        <span><b>{money(profile.typical_inflow)}</b> in</span><i>·</i>
                        <span><b>{money(profile.typical_spending)}</b> out</span><i>·</i>
                        <span><b>{money(profile.buffer)}</b> cushion</span>
                        <ChevronDown size={14} className={`glance-chev ${glanceOpen ? 'open' : ''}`} />
                      </button>
                      {glanceOpen && glanceBeat && <ThreadFigure beat={glanceBeat} />}
                    </div>
                  </div>
                )
                if (m.kind === 'proposal') return (
                  <div key={m.id} className="msg pulp noted">
                    <span className="msg-avatar" aria-hidden="true"><Tangerine mood="idle" /></span>
                    <div className="msg-body">
                      <div className="noted-row" role="status">
                        <span>Pulp noted</span>
                        {m.proposal.changes.map((c, i) => <b key={i}>{fieldNames[c.field] ?? c.field}: {String(c.value.label ?? String(c.value.type ?? '').replaceAll('_', ' '))}</b>)}
                        <button onClick={() => confirm(m.proposal, true)} disabled={confirming === m.proposal.id}><Check size={13} />Confirm</button>
                        <button className="ghost" onClick={() => confirm(m.proposal, false)} disabled={confirming === m.proposal.id}>Not quite</button>
                      </div>
                    </div>
                  </div>
                )
                if (m.kind === 'walkthrough') return <div key={m.id} className="msg pulp has-figure"><span className="msg-avatar" aria-hidden="true"><Tangerine mood="idle" /></span><div className="msg-body"><AnimatedWalkthrough beats={m.beats} onAction={send} autoplay={m.autoplay} /></div></div>
                return (
                  <div key={m.id} className={`msg pulp ${m.beat && m.beat.visual !== 'none' ? 'has-figure' : ''}`}>
                    <span className="msg-avatar" aria-hidden="true"><Tangerine mood="idle" /></span>
                    <div className="msg-body">
                      <PulpText text={m.text} />
                      {m.beat && <ThreadFigure beat={m.beat} onReplay={() => replay(m.text)} onAction={send} />}
                    </div>
                  </div>
                )
              })}
              {voice && (live.user || live.assistant) && <div className="msg-body" aria-live="polite">{live.user && <p>You: {live.user}</p>}{live.assistant && <PulpText text={live.assistant} />}</div>}
              {status && <p className="thread-status" role="status"><span className="stage-status-dot" />{status}</p>}
              {notice && <p className="thread-notice" role="status">{notice}</p>}
              <div ref={endRef} />
            </div>
          )}
        </main>
        <Backstage open={backstage} onClose={() => setBackstage(false)} personas={personas} feed={feed} active={active} />
      </div>

      <div className="thread-dock">
        {profile && !busy && (
          <div className="stage-suggest compact" aria-label="Suggestions">
            {SUGGESTIONS.map(([label, msg, Icon]) => <button key={msg} type="button" onClick={() => send(msg)}><Icon size={13} />{label}</button>)}
          </div>
        )}
        <form className={`stage-input ${voice ? 'listening' : ''}`} onSubmit={(e) => { e.preventDefault(); send(draft) }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={profile ? 'Tell me what life’s throwing your way…' : 'Load an account first…'} disabled={!profile || busy} aria-label="Message" maxLength={2000} />
          <button type="button" className="stage-chip" onClick={() => send('twist:cards')} disabled={!profile || busy} title="Pick a twist card"><Dice5 size={15} />Twist card</button>
          <button type="button" className="stage-chip" onClick={() => send('twist:random')} disabled={!profile || busy} title="Deal a random twist"><Shuffle size={15} />Shuffle</button>
          <button type="button" className={`stage-mic ${voice ? 'on' : ''}`} onClick={() => void toggleVoice()} disabled={!profile} aria-label={voice ? 'Stop voice conversation' : 'Start voice conversation'}>{voice ? <Square size={16} /> : <Mic size={17} />}<span>{voice ? (voiceReady ? 'Listening ? Stop' : 'Connecting?') : 'Talk to Pulp'}</span></button>
          <button className="stage-send" aria-label="Send" disabled={!draft.trim() || !profile || busy}><ArrowUp size={18} /></button>
        </form>

        <footer className="stage-footer"><span>Prepare for what comes next.</span><span>Observed, anonymized records · amounts in CAD · every number comes from the engine</span></footer>
      </div>
    </div>
  )
}

function money(n: number) { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n) }
