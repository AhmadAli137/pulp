/* The narrated stage: Pip, one visual at a time, a spoken caption, a scrubbable timeline, and the input bar.
   A backend Director turns every turn into a storyboard of beats; this page only plays them. */
import { ArrowRight, ArrowUp, ArrowUpRight, BookOpen, Check, ChevronDown, Compass, Dice5, LoaderCircle, Menu, MessageCircle, Mic, RotateCcw, Shuffle, SlidersHorizontal, Square, Wallet, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PulpMark, Tangerine, clearIntroSeen } from '../components/PulpMascot'
import BeatPlayer from '../components/stage/BeatPlayer'
import { expressionFor } from '../components/stage/Visual'
import { useSpeech } from '../hooks/useSpeech'
import { API_BASE, api, type Beat, type Proposal, type SampleAccount, type StageAgentEvent, type StageMemoryEvent, type Storyboard } from '../services/api'
import { useApp } from '../stores/useApp'
import '../stage.css'

const PAGES: [string, string, typeof Wallet][] = [['/shock', 'Financial snapshot & shock lab', Wallet], ['/explore', 'Explore futures', SlidersHorizontal], ['/goals', 'My goals & plan review', MessageCircle], ['/roadmap', 'Financial roadmap', Compass], ['/insights', 'Research & insights', BookOpen]]
const TOOL_WORDS: Record<string, string> = { calculate_shock: 'running the shock', get_financial_profile: 'reading your numbers', score_strategy: 'scoring a lever', compare_strategies: 'comparing plans', get_insights: 'reading your profile', get_cohort: 'looking at similar people', simulate: 'simulating months' }
const fieldNames: Record<string, string> = { goals: 'Goal', concerns: 'Concern', constraints: 'Planning detail', preferences: 'Preference', upcoming_events: 'Life event' }

type TimelineEntry = { index: number; label: string; visual: Beat['visual'] }

export default function Stage({ onReplayIntro }: { onReplayIntro: () => void }) {
  const { accountId, profile, loadAccount, loadingProfile, profileError, setGemini } = useApp()
  const nav = useNavigate()
  const speech = useSpeech()
  const [inputId, setInputId] = useState(accountId ? String(accountId) : '')
  const [samples, setSamples] = useState<SampleAccount[]>([])
  const [menu, setMenu] = useState(false)
  const [selector, setSelector] = useState(false)
  const [draft, setDraft] = useState('')
  const [beats, setBeats] = useState<Beat[]>([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [reply, setReply] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const source = useRef<EventSource | null>(null)
  const id = profile?.account_id ?? null

  useEffect(() => {
    api.samples().then((s) => setSamples(s.accounts)).catch(() => undefined)
    api.health().then((h) => setGemini(h.ai_provider !== 'offline', h.ai_label)).catch(() => setGemini(false))
    const saved = (() => { try { return localStorage.getItem('pulp.account') } catch { return null } })()
    if (!useApp.getState().accountId && saved && Number.isInteger(Number(saved))) void loadAccount(Number(saved))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (accountId) setInputId(String(accountId)) }, [accountId])

  /* The living picture, built client-side so the stage is never empty. */
  const picture = useMemo<Beat | null>(() => {
    if (!profile) return null
    const months = profile.typical_spending > 0 ? profile.buffer / profile.typical_spending : 0
    return { id: `picture-${profile.account_id}`, visual: 'picture', caption: `Here is your money as it usually moves: ${fmtMoney(profile.typical_inflow)} in, ${fmtMoney(profile.typical_spending)} out, and ${fmtMoney(profile.buffer)} in the cup.`, duration_s: 8,
      params: { inflow: profile.typical_inflow, outflow: profile.typical_spending, buffer: profile.buffer, months_of_spending: months, runway_label: profile.baseline_runway_label } }
  }, [profile])

  const run = useCallback((message: string) => {
    if (!id) return
    source.current?.close()
    setBusy(true); setStatus('Pip is thinking…'); setNotice(null); setReply(null)
    const es = new EventSource(`${API_BASE}/api/agent/stage?account_id=${id}&message=${encodeURIComponent(message)}`)
    source.current = es
    const mine = () => source.current === es
    es.addEventListener('agent', (e) => {
      if (!mine()) return
      try {
        const d = JSON.parse((e as MessageEvent).data) as StageAgentEvent
        if (d.kind === 'tool_call' && d.tool) setStatus(`Pip is ${TOOL_WORDS[d.tool] ?? `asking the engine: ${d.tool.replaceAll('_', ' ')}`}…`)
        else if (d.agent === 'engine' && d.summary) setStatus(d.summary)
        else if (d.kind === 'text' && d.agent !== 'engine') setStatus(`${d.agent === 'director' ? 'Pip' : d.agent} is writing…`)
      } catch { /* ignore */ }
    })
    es.addEventListener('memory', (e) => {
      if (!mine()) return
      try {
        const d = JSON.parse((e as MessageEvent).data) as StageMemoryEvent
        setProposal(d.proposal ?? null)
        if (d.reply) setReply(d.reply)
      } catch { /* ignore */ }
    })
    es.addEventListener('storyboard', (e) => {
      if (!mine()) return
      try {
        const d = JSON.parse((e as MessageEvent).data) as Storyboard
        if (d.beats?.length) {
          setBeats((prev) => {
            const start = prev.length
            setIndex(start)
            return [...prev, ...d.beats.map((b, i) => ({ ...b, id: `${b.id}-${start + i}` }))]
          })
          setPlaying(true)
        }
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
  }, [id])

  /* Reset and open the intro once per account per session. */
  useEffect(() => {
    source.current?.close(); source.current = null
    setBeats([]); setIndex(0); setProposal(null); setReply(null); setNotice(null); setBusy(false); setStatus(null)
    if (!id) return
    const key = `pulp-stage-intro-${id}`
    let seen = false
    try { seen = sessionStorage.getItem(key) === '1' } catch { /* ignore */ }
    if (!seen) { try { sessionStorage.setItem(key, '1') } catch { /* ignore */ } run('__intro__') }
    return () => { source.current?.close(); source.current = null }
  }, [id, run])

  const send = (text: string) => { const t = text.trim(); if (!t || !id) return; setDraft(''); run(t) }
  const confirm = async (accept: boolean) => {
    if (!id || !proposal) return
    setConfirming(true)
    try { await api.confirm(id, proposal.id, accept); setProposal(null); setNotice(accept ? 'Noted. Your plan is being updated.' : 'Left it out.') } catch { setNotice('Could not save that.') } finally { setConfirming(false) }
  }
  const load = (raw: string) => { const n = Number(raw); if (Number.isInteger(n) && n > 0) { void loadAccount(n); setSelector(false) } }
  const replayIntro = () => { clearIntroSeen(); onReplayIntro() }

  const shown: Beat[] = beats.length ? beats : picture ? [picture] : []
  const current = shown[Math.min(index, shown.length - 1)] ?? null
  const expression = expressionFor(current, busy)
  const timeline: TimelineEntry[] = beats.map((b, i) => ({ index: i, label: b.caption.length > 42 ? b.caption.slice(0, 41) + '…' : b.caption, visual: b.visual }))

  return (
    <div className={`stage-home pip-${expression}`}>
      <header className="stage-header">
        <div className="stage-brand-group">
          <button className="agent-icon-button" aria-label="Open navigation" onClick={() => setMenu((v) => !v)}><Menu size={19} /></button>
          <a className="agent-brand" href="/" onClick={(e) => { e.preventDefault(); setMenu(false) }}><PulpMark size={31} />PULP<span>.</span></a>
          <span className="agent-brand-caption">a little clarity, for whatever’s next</span>
        </div>
        <div className="stage-header-actions">
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
          <p>Everything on the stage comes from these pages' numbers. They stay here when you want the detail.</p>
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

      <main className="stage-main">
        <aside className="stage-pip" aria-hidden="true">
          <Tangerine mood={expression === 'thinking' ? 'thinking' : speech.listening ? 'listening' : 'idle'} />
          <span className={`stage-pip-badge ${expression}`}>{expression === 'thinking' ? 'thinking' : expression === 'worried' ? 'hmm' : expression === 'happy' ? 'that helps' : speech.listening ? 'listening' : 'with you'}</span>
          {reply && <span className="stage-reply">{reply.length > 160 ? reply.slice(0, 159) + '…' : reply}</span>}
        </aside>

        {!profile ? (
          <section className="stage-empty">
            <h1>Which account are we looking at?</h1>
            <p>Pick a demo account from the top right. Then tell me what life’s throwing your way, and I’ll show you.</p>
          </section>
        ) : (
          <BeatPlayer beats={shown} index={Math.min(index, shown.length - 1)} onIndex={setIndex} playing={playing} onPlaying={setPlaying} onAction={send} status={status} />
        )}

        {proposal && (
          <div className="stage-noted" role="status">
            <span className="agent-small-label">PIP NOTED</span>
            {proposal.changes.map((c, i) => <b key={i}>{fieldNames[c.field] ?? c.field}: {String(c.value.label ?? String(c.value.type ?? '').replaceAll('_', ' '))}</b>)}
            <button onClick={() => confirm(true)} disabled={confirming}><Check size={14} />Confirm</button>
            <button className="ghost" onClick={() => confirm(false)} disabled={confirming}>Not quite</button>
          </div>
        )}
        {notice && <p className="stage-notice" role="status">{notice}</p>}

        {timeline.length > 1 && (
          <nav className="stage-timeline" aria-label="Story so far">
            {timeline.map((t) => <button key={t.index} className={t.index === index ? 'on' : t.index < index ? 'past' : ''} title={t.label} onClick={() => { setIndex(t.index); setPlaying(true) }}><i /><span>{t.visual}</span></button>)}
          </nav>
        )}

        <form className={`stage-input ${speech.listening ? 'listening' : ''}`} onSubmit={(e) => { e.preventDefault(); send(draft) }}>
          <input value={speech.listening && speech.interim ? speech.interim : draft} onChange={(e) => setDraft(e.target.value)} placeholder={profile ? 'Tell me what life’s throwing your way…' : 'Load an account first…'} disabled={!profile || busy} aria-label="Message" maxLength={2000} />
          <button type="button" className="stage-chip" onClick={() => send('twist:cards')} disabled={!profile || busy} title="Pick a twist card"><Dice5 size={15} />Twist card</button>
          <button type="button" className="stage-chip" onClick={() => send('twist:random')} disabled={!profile || busy} title="Deal a random twist"><Shuffle size={15} />Shuffle the deck</button>
          {speech.supported && <button type="button" className={`stage-mic ${speech.listening ? 'on' : ''}`} onClick={() => speech.listening ? speech.stop() : speech.start((t) => send(t))} disabled={!profile || busy} aria-label={speech.listening ? 'Stop listening' : 'Speak'}>{speech.listening ? <Square size={16} /> : <Mic size={17} />}</button>}
          <button className="stage-send" aria-label="Send" disabled={!draft.trim() || !profile || busy}><ArrowUp size={18} /></button>
        </form>
        {speech.error && <p className="stage-notice">{speech.error}</p>}
      </main>
      <footer className="stage-footer"><span>Prepare for what comes next.</span><span>Observed, anonymized records · amounts in CAD · every number on stage comes from the engine</span></footer>
    </div>
  )
}

function fmtMoney(n: number) { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n) }
