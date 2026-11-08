/* The home: a calm conversation with Pulp. The person's messages on the right, Pulp's on the left with a small
   mascot. A backend Director turns each turn into a storyboard; its beats arrive one at a time as Pulp messages,
   each with a small inline figure under the caption. Nothing animates or speaks until the person acts. */
import { ArrowRight, ArrowUp, ArrowUpRight, BookOpen, Check, ChevronDown, Compass, Dice5, LoaderCircle, Menu, MessageCircle, Mic, RotateCcw, Shuffle, SlidersHorizontal, Sparkles, Square, Users, Volume2, VolumeX, Wallet, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PulpMark, Tangerine, clearIntroSeen } from '../components/PulpMascot'
import Backstage, { splitKeys, type FeedItem } from '../components/stage/Backstage'
import { highlightNumbers } from '../components/stage/shared'
import ThreadFigure from '../components/stage/ThreadFigure'
import { useSpeech } from '../hooks/useSpeech'
import { API_BASE, api, type Beat, type Persona, type Proposal, type SampleAccount, type StageAgentEvent, type StageHandoffEvent, type StageMemoryEvent, type Storyboard } from '../services/api'
import { speakStyled } from '../services/ttsVoice'
import { useApp } from '../stores/useApp'
import '../stage.css'

const PAGES: [string, string, typeof Wallet][] = [['/shock', 'Financial snapshot & shock lab', Wallet], ['/explore', 'Explore futures', SlidersHorizontal], ['/goals', 'My goals & plan review', MessageCircle], ['/roadmap', 'Financial roadmap', Compass], ['/insights', 'Research & insights', BookOpen]]
const TOOL_WORDS: Record<string, string> = { calculate_shock: 'running the shock', deal_or_set_shock: 'setting up the shock', get_profile: 'reading your numbers', get_financial_profile: 'reading your numbers', score_strategy: 'scoring an idea', run_council: 'asking the council', compare_strategies: 'comparing plans', get_insights: 'reading your profile', get_cohort: 'looking at people like you', show_math: 'writing out the math', simulate: 'simulating months' }
const fieldNames: Record<string, string> = { goals: 'Goal', concerns: 'Concern', constraints: 'Planning detail', preferences: 'Preference', upcoming_events: 'Life event' }
const GREETING = 'Hi, I’m Pulp. Ask me anything about your money, or draw a twist card and we’ll see how you hold up.'
const SUGGESTIONS: [string, string, typeof Sparkles][] = [['What should I know about my money?', '__intro__', Sparkles], ['Draw a twist card', 'twist:cards', Dice5], ['Shuffle the deck', 'twist:random', Shuffle]]
const MAX_BEAT_MS = 12000
const MIN_BEAT_MS = 1400

type Msg =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'pulp'; text: string; beat?: Beat }
  | { id: string; kind: 'proposal'; proposal: Proposal }
  | { id: string; kind: 'glance' }
type QueueItem = { kind: 'beat'; beat: Beat } | { kind: 'proposal'; proposal: Proposal } | { kind: 'text'; text: string }

const readFlag = (key: string) => { try { return localStorage.getItem(key) === '1' } catch { return false } }
const turnLabel = (m: string) => m === '__intro__' ? 'What should I know about my money?' : m === 'twist:cards' ? 'Twist cards' : m === 'twist:random' ? 'Shuffle the deck' : m.startsWith('twist:') ? `Twist: ${m.slice(6).replaceAll('_', ' ')}` : m.length > 70 ? m.slice(0, 69) + '…' : m
const userText = (m: string) => m === '__intro__' ? 'What should I know about my money?' : m === 'twist:cards' ? 'Show me the twist cards.' : m === 'twist:random' ? 'Shuffle the deck and deal me one.' : m.startsWith('twist:') ? `Deal the “${m.slice(6).replaceAll('_', ' ')}” card.` : m
let seq = 0
const nid = (p: string) => `${p}-${++seq}`

export default function Stage({ onReplayIntro }: { onReplayIntro: () => void }) {
  const { accountId, profile, loadAccount, loadingProfile, profileError, setGemini } = useApp()
  const nav = useNavigate()
  const speech = useSpeech()
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
  const [backstage, setBackstage] = useState(() => readFlag('pulp.backstage'))
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
  useEffect(() => { try { localStorage.setItem('pulp.backstage', backstage ? '1' : '0') } catch { /* ignore */ } }, [backstage])
  useEffect(() => {
    api.samples().then((s) => setSamples(s.accounts)).catch(() => undefined)
    api.health().then((h) => setGemini(h.ai_provider !== 'offline', h.ai_label)).catch(() => setGemini(false))
    api.personas().then((r) => setPersonas(r.personas)).catch(() => undefined)
    const saved = (() => { try { return localStorage.getItem('pulp.account') } catch { return null } })()
    if (!useApp.getState().accountId && saved && Number.isInteger(Number(saved))) void loadAccount(Number(saved))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (accountId) setInputId(String(accountId)) }, [accountId])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [thread, status])

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
    const text = item.kind === 'text' ? item.text : item.beat.caption
    setThread((t) => [...t, { id: nid('m'), kind: 'pulp', text, beat: item.kind === 'beat' ? item.beat : undefined }])
    const dur = item.kind === 'beat' ? Math.min(MAX_BEAT_MS, Math.max(MIN_BEAT_MS, (item.beat.duration_s || 5) * 700)) : MIN_BEAT_MS
    if (!muteRef.current && interacted.current && 'speechSynthesis' in window) {
      let spoken = false, timed = false
      const both = () => { if (spoken && timed) next() }
      pumpTimer.current = window.setTimeout(() => { timed = true; both() }, MIN_BEAT_MS)
      const guard = window.setTimeout(() => { spoken = true; timed = true; next() }, MAX_BEAT_MS)
      void speakStyled(text, { onend: () => { clearTimeout(guard); spoken = true; both() }, onerror: () => { clearTimeout(guard); spoken = true; both() } }).catch(() => { clearTimeout(guard); spoken = true; both() })
    } else {
      pumpTimer.current = window.setTimeout(next, dur)
    }
  }, [])
  const enqueue = useCallback((items: QueueItem[]) => { queue.current.push(...items); pump() }, [pump])

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
    let pendingQuestion: string | null = null
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
        if (d.next_question?.text) pendingQuestion = d.next_question.text
        light(['companion'])
      } catch { /* ignore */ }
    })
    es.addEventListener('storyboard', (e) => {
      if (!mine()) return
      try {
        const d = JSON.parse((e as MessageEvent).data) as Storyboard
        const items: QueueItem[] = (d.beats ?? []).map((b) => ({ kind: 'beat', beat: { ...b, id: nid(b.id) } }))
        if (pendingQuestion && !items.some((i) => i.kind === 'beat' && i.beat.caption.trim().endsWith('?'))) items.push({ kind: 'text', text: pendingQuestion })
        enqueue(items)
        setStatus(null)
      } catch { /* ignore */ }
    })
    es.addEventListener('done', () => { if (!mine()) return; es.close(); setBusy(false); setStatus(null) })
    es.addEventListener('error', (e) => {
      if (!mine()) return
      const data = (e as MessageEvent).data
      if (data) { try { setNotice(JSON.parse(data).message ?? 'Something went wrong.') } catch { setNotice('Something went wrong.') } }
      else if (es.readyState === EventSource.CLOSED) setNotice('The connection dropped. Try again.')
      es.close(); setBusy(false); setStatus(null)
    })
  }, [id, light, pushFeed, enqueue, stopPump])

  /* New account: a fresh thread with one greeting and the collapsed glance row. Nothing speaks. */
  useEffect(() => {
    source.current?.close(); source.current = null
    stopPump(); queue.current = []
    interacted.current = false
    setBusy(false); setStatus(null); setNotice(null); setFeed([]); setActive(new Set()); setGlanceOpen(false)
    setThread(id ? [{ id: nid('g'), kind: 'pulp', text: GREETING }, { id: nid('gl'), kind: 'glance' }] : [])
    return () => { source.current?.close(); source.current = null; stopPump() }
  }, [id, stopPump])

  const send = (text: string) => { const t = text.trim(); if (!t || !id) return; setDraft(''); run(t) }
  const confirm = async (p: Proposal, accept: boolean) => {
    if (!id) return
    setConfirming(p.id)
    try {
      await api.confirm(id, p.id, accept)
      setThread((t) => t.map((m) => m.kind === 'proposal' && m.proposal.id === p.id ? { id: m.id, kind: 'pulp', text: accept ? 'Noted. I’ll plan around that.' : 'Left it out.' } : m))
    } catch { setNotice('Could not save that.') } finally { setConfirming(null) }
  }
  const load = (raw: string) => { const n = Number(raw); if (Number.isInteger(n) && n > 0) { void loadAccount(n); setSelector(false) } }
  const replayIntro = () => { clearIntroSeen(); onReplayIntro() }
  const replay = (text: string) => { if (!muteRef.current && 'speechSynthesis' in window) { window.speechSynthesis.cancel(); void speakStyled(text) } }

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
          <button className={`stage-backstage-toggle ${backstage ? 'on' : ''}`} aria-pressed={backstage} onClick={() => setBackstage((v) => !v)} title="See the agents and what they pass along"><Users size={15} />Agents{active.size > 0 && <i className="stage-live-dot" />}</button>
          <button className="agent-icon-button" aria-label={mute ? 'Unmute Pulp' : 'Mute Pulp'} title={mute ? 'Unmute Pulp' : 'Mute Pulp'} onClick={() => setMute((m) => !m)}>{mute ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          <button className="account-trigger" aria-expanded={selector} onClick={() => setSelector((v) => !v)}><span className="demo-dot" />Demo account <b>{profile ? '#' + id : '…'}</b><ChevronDown size={13} /></button>
          <button className="agent-icon-button intro-replay" title="Replay the PULP introduction" aria-label="Replay introduction" onClick={replayIntro}><RotateCcw size={16} /></button>
        </div>
      </header>
      {menu && (<>
        <button className="menu-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />
        <nav className="agent-menu" aria-label="Explore PULP">
          <div><span>THE BIGGER PICTURE</span><button aria-label="Close menu" onClick={() => setMenu(false)}><X size={16} /></button></div>
          {PAGES.map(([path, label, Icon]) => <button key={path} onClick={() => nav(path)}><Icon size={17} />{label}<ArrowUpRight size={14} /></button>)}
          <button onClick={() => nav('/classic')}><MessageCircle size={17} />Classic chat view<ArrowUpRight size={14} /></button>
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

      <div className="stage-body">
        <main className="thread-main">
          {!profile ? (
            <section className="stage-empty">
              <h1>Which account are we looking at?</h1>
              <p>Pick a demo account from the top right. Then tell Pulp what life’s throwing your way.</p>
            </section>
          ) : (
            <div className="thread" aria-live="polite">
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
                return (
                  <div key={m.id} className={`msg pulp ${m.beat && m.beat.visual !== 'none' ? 'has-figure' : ''}`}>
                    <span className="msg-avatar" aria-hidden="true"><Tangerine mood="idle" /></span>
                    <div className="msg-body">
                      <p>{highlightNumbers(m.text)}</p>
                      {m.beat && <ThreadFigure beat={m.beat} onReplay={() => replay(m.text)} onAction={send} />}
                    </div>
                  </div>
                )
              })}
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
        <form className={`stage-input ${speech.listening ? 'listening' : ''}`} onSubmit={(e) => { e.preventDefault(); send(draft) }}>
          <input value={speech.listening && speech.interim ? speech.interim : draft} onChange={(e) => setDraft(e.target.value)} placeholder={profile ? 'Tell me what life’s throwing your way…' : 'Load an account first…'} disabled={!profile || busy} aria-label="Message" maxLength={2000} />
          <button type="button" className="stage-chip" onClick={() => send('twist:cards')} disabled={!profile || busy} title="Pick a twist card"><Dice5 size={15} />Twist card</button>
          <button type="button" className="stage-chip" onClick={() => send('twist:random')} disabled={!profile || busy} title="Deal a random twist"><Shuffle size={15} />Shuffle</button>
          {speech.supported && <button type="button" className={`stage-mic ${speech.listening ? 'on' : ''}`} onClick={() => speech.listening ? speech.stop() : speech.start((t) => send(t))} disabled={!profile || busy} aria-label={speech.listening ? 'Stop listening' : 'Speak'}>{speech.listening ? <Square size={16} /> : <Mic size={17} />}</button>}
          <button className="stage-send" aria-label="Send" disabled={!draft.trim() || !profile || busy}><ArrowUp size={18} /></button>
        </form>
        {speech.error && <p className="thread-notice">{speech.error}</p>}
        <footer className="stage-footer"><span>Prepare for what comes next.</span><span>Observed, anonymized records · amounts in CAD · every number comes from the engine</span></footer>
      </div>
    </div>
  )
}

function money(n: number) { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n) }
