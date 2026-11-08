/* Conversation-first landing page. Ported from the Codex build (pulp2) and wired to this app's store, router and API. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, ArrowUpRight, ChevronDown, Mic, Square, Plus, Menu, X, ArrowRight, MessageCircle, Leaf, Wallet, RotateCcw, LoaderCircle, Check, ShieldCheck, SlidersHorizontal, BookOpen, Compass } from 'lucide-react'
import { PulpMark, Tangerine, clearIntroSeen } from '../components/PulpMascot'
import { startVoice } from '../services/voice'
import { api, type ContextSummary, type Proposal, type ReplanResult, type SampleAccount } from '../services/api'
import { useApp } from '../stores/useApp'

const money = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)
const suggestions: [string, string][] = [
  ['An income change', "I'm worried about my income changing. Can we look at how prepared I am?"],
  ['An unexpected bill', "I'd like to prepare for an unexpected expense. Where should I start?"],
  ['A goal worth saving for', 'I have a goal I would like to save for. Can you help me make a plan?'],
]
const fieldNames: Record<string, string> = { goals: 'Goal', concerns: 'Concern', constraints: 'Planning detail', preferences: 'Preference', upcoming_events: 'Life event' }
const describe = (value: Record<string, unknown>) => Object.entries(value).filter(([k]) => !['priority', 'label', 'type'].includes(k))
  .map(([k, v]) => `${k.replaceAll('_', ' ')}: ${typeof v === 'number' && /amount|budget/.test(k) ? money(v) : String(v)}`).join(' · ')

interface Msg { role: 'user' | 'assistant'; text: string }

/* Renders **bold** and paragraphs from model text; everything else is shown verbatim (no HTML). */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return <p>{parts.map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>)}</p>
}
type VoiceProposal = { income_fraction?: number | null; bills_increase?: number | null; one_off_cost?: number | null; horizon_months?: number | null; explanation?: string }

const PAGES: [string, string, typeof Wallet][] = [['/shock', 'Financial snapshot & shock lab', Wallet], ['/explore', 'Explore futures', SlidersHorizontal], ['/goals', 'My goals & plan review', MessageCircle], ['/roadmap', 'Financial roadmap', Compass], ['/insights', 'Research & insights', BookOpen]]

export default function AgentHome({ onReplayIntro }: { onReplayIntro: () => void }) {
  const { accountId, profile: account, loadAccount, loadingProfile: loading, profileError: error, aiLabel, geminiConfigured, refreshContext, setLastReplan, setInputs, runShock, setGemini } = useApp()
  const nav = useNavigate()
  const [inputId, setInputId] = useState(accountId ? String(accountId) : '')
  const [samples, setSamples] = useState<SampleAccount[]>([])
  const [menu, setMenu] = useState(false)
  const [selector, setSelector] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [context, setContext] = useState<ContextSummary | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')
  const [plan, setPlan] = useState<ReplanResult | null>(null)
  const [voice, setVoice] = useState(false)
  const [listening, setListening] = useState(false)
  const [live, setLive] = useState<{ user: string; assistant: string }>({ user: '', assistant: '' })
  const [contextReady, setContextReady] = useState(false)
  const [voiceProposal, setVoiceProposal] = useState<VoiceProposal | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  const voiceStop = useRef<(() => void) | null>(null)
  const voiceRequest = useRef(0)
  const liveText = useRef({ user: '', assistant: '' })
  const messagesEnd = useRef<HTMLDivElement>(null)
  const id = account?.account_id

  useEffect(() => {
    api.samples().then((s) => setSamples(s.accounts)).catch(() => undefined)
    api.health().then((h) => setGemini(h.ai_provider !== 'offline', h.ai_label)).catch(() => setGemini(false))
    const saved = (() => { try { return localStorage.getItem('pulp.account') } catch { return null } })()
    if (!useApp.getState().accountId && saved && Number.isInteger(Number(saved))) void loadAccount(Number(saved))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    alive.current = true
    setContextReady(false)
    if (id) {
      api.context(id).then((r) => {
        if (!alive.current) return
        setContext(r.summary)
        setMessages((r.context.conversation || []).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text })))
        setProposal(r.summary.pending_proposals?.at(-1) ?? null)
      }).catch(() => { if (alive.current) setNotice('Your financial snapshot is ready. Saved context could not be loaded.') })
        .finally(() => { if (alive.current) setContextReady(true) })
    } else { setMessages([]); setContext(null); setProposal(null); setContextReady(true) }
    return () => { alive.current = false; voiceRequest.current++; voiceStop.current?.() }
  }, [id])
  useEffect(() => { if (messages.length) messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages, busy])
  useEffect(() => { if (accountId) setInputId(String(accountId)) }, [accountId])

  const choose = (text: string) => { setDraft(text); input.current?.focus() }
  const load = (raw: string) => { const n = Number(raw); if (Number.isInteger(n) && n > 0) { void loadAccount(n); setSelector(false) } }

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    if (!draft.trim() || busy || confirming || !account || !id || loading || !contextReady) return
    const text = draft.trim()
    setDraft(''); setBusy(true); setNotice('')
    setMessages((m) => [...m, { role: 'user', text }])
    try {
      const r = await api.chat(id, text)
      if (!alive.current) return
      setMessages((m) => [...m, { role: 'assistant', text: r.reply }])
      setContext(r.context)
      setProposal(r.proposal ?? r.context.pending_proposals?.at(-1) ?? null)
      if (!['gemini', 'vultr', 'vehicle_planner'].includes(r.mode)) setNotice('Using the local companion while the AI service is unavailable.')
      void refreshContext()
    } catch { if (alive.current) { setNotice('The reply didn’t come through. Please try again.'); setDraft(text) } }
    finally { if (alive.current) setBusy(false) }
  }

  async function confirm(accept: boolean) {
    if (!proposal || confirming || busy || !id) return
    setConfirming(true); setNotice('')
    try {
      const r = await api.confirm(id, proposal.id, accept)
      if (!alive.current) return
      setContext(r.summary); setPlan(r.replan); setProposal(null)
      if (r.replan) setLastReplan(r.replan)
      void refreshContext()
      setNotice(accept ? (r.replan ? 'Saved to your context. Your plan has been updated.' : 'Saved to your context.') : 'Proposal dismissed. Your context is unchanged.')
    } catch (e) { if (alive.current) setNotice((e as Error).message) }
    finally { if (alive.current) setConfirming(false) }
  }

  async function toggleVoice() {
    const request = ++voiceRequest.current
    if (voice) { voiceStop.current?.(); voiceStop.current = null; setVoice(false); setListening(false); setLive({ user: '', assistant: '' }); return }
    if (!id) return
    setNotice(''); setVoice(true); liveText.current = { user: '', assistant: '' }; setLive(liveText.current)
    try {
      const stop = await startVoice(id, (m) => {
        if (!alive.current || request !== voiceRequest.current) return
        if (m.type === 'ready') setListening(true)
        if (m.type === 'transcript') { liveText.current = { ...liveText.current, [m.role]: (liveText.current[m.role] || '') + m.text }; setLive({ ...liveText.current }) }
        if (m.type === 'turn_complete') {
          const turns = (Object.entries(liveText.current) as [Msg['role'], string][]).filter(([, text]) => text).map(([role, text]) => ({ role, text }))
          setMessages((old) => [...old, ...turns]); liveText.current = { user: '', assistant: '' }; setLive({ ...liveText.current })
        }
        if (m.type === 'proposal') { setNotice('Your spoken scenario is ready to review.'); setVoiceProposal(m.proposal as VoiceProposal) }
        if (m.type === 'error') setNotice(m.message)
        if (m.type === 'closed') { setVoice(false); setListening(false) }
      })
      if (!alive.current || request !== voiceRequest.current) stop(); else voiceStop.current = stop
    } catch (e) {
      if (alive.current && request === voiceRequest.current) { setVoice(false); setNotice((e as Error).name === 'NotAllowedError' ? 'Microphone access was declined. You can still type here.' : (e as Error).message) }
    }
  }

  const applyVoiceProposal = () => {
    if (!voiceProposal) return
    setInputs({
      income_fraction: voiceProposal.income_fraction ?? 1, bills_increase: voiceProposal.bills_increase ?? 0,
      one_off_cost: voiceProposal.one_off_cost ?? 0, horizon_months: voiceProposal.horizon_months ?? 6,
    })
    void runShock()
    nav('/shock')
  }

  const worries = (context?.concerns ?? []) as { label?: string; type?: string }[]
  const goals = (context?.goals ?? []) as { label?: string; type?: string }[]
  const hasConversation = messages.length > 0
  const replay = () => { clearIntroSeen(); onReplayIntro() }

  return (
    <div className={`agent-home ${hasConversation ? 'has-conversation' : ''}`}>
      <header className="agent-header">
        <div className="agent-brand-group">
          <button className="agent-icon-button" aria-label="Open navigation" onClick={() => setMenu((v) => !v)}><Menu size={19} /></button>
          <a className="agent-brand" href="/" onClick={(e) => { e.preventDefault(); setMenu(false) }}><PulpMark size={31} />PULP<span>.</span></a>
          <span className="agent-brand-caption">a little clarity, for whatever’s next</span>
        </div>
        <div className="agent-header-actions">
          <button className="account-trigger" aria-expanded={selector} onClick={() => setSelector((v) => !v)}><span className="demo-dot" />Demo account <b>{account ? '#' + id : '…'}</b><ChevronDown size={13} /></button>
          <button className="agent-icon-button intro-replay" title="Replay the PULP introduction" aria-label="Replay introduction" onClick={replay}><RotateCcw size={16} /></button>
        </div>
      </header>
      {menu && (<>
        <button className="menu-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />
        <nav className="agent-menu" aria-label="Explore PULP">
          <div><span>THE BIGGER PICTURE</span><button aria-label="Close menu" onClick={() => setMenu(false)}><X size={16} /></button></div>
          {PAGES.map(([path, label, Icon]) => <button key={path} onClick={() => nav(path)}><Icon size={17} />{label}<ArrowUpRight size={14} /></button>)}
          <p>Your conversation is the starting point.<br />The numbers are here when you need them.</p>
        </nav>
      </>)}
      {selector && (
        <section className="agent-account-popover" aria-label="Choose an account">
          <span className="agent-small-label">EXPLORE AN ANONYMIZED ACCOUNT</span>
          <form onSubmit={(e) => { e.preventDefault(); load(inputId) }}>
            <label htmlFor="agent-account-input">Account ID</label>
            <div><input id="agent-account-input" value={inputId} onChange={(e) => setInputId(e.target.value)} inputMode="numeric" /><button disabled={loading}>{loading ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={17} />}<span className="sr-only">Load account</span></button></div>
          </form>
          <select aria-label="Sample accounts" value="" onChange={(e) => load(e.target.value)}><option value="">Or try a sample account</option>{samples.map((a) => <option key={a.account_id} value={a.account_id}>#{a.account_id} · {a.tag}</option>)}</select>
          <p>Real anonymized records. The selected account does not identify you.</p>
          <button className="popover-done" onClick={() => setSelector(false)}>Done</button>
        </section>
      )}
      {error && <div className="agent-alert" role="alert">{error}</div>}
      <main className="agent-main">
        <section className="agent-welcome">
          <div className="mascot-greeting"><Tangerine mood={busy ? 'thinking' : listening ? 'listening' : 'idle'} /><span className="mascot-speech">{listening ? 'I’m listening.' : busy ? 'One little moment…' : 'Big things start small.'}</span></div>
          <span className="agent-overline">YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>{account ? 'What’s on your mind?' : 'Which account are we looking at?'}</h1>
          <p>{account ? <>A change, a worry, a little what-if.<br className="mobile-break" /> Let’s make some room for it.</> : <>Pick a demo account from the top right,<br className="mobile-break" /> then tell me what life’s throwing your way.</>}</p>
        </section>
        {(hasConversation || live.user || live.assistant) && (
          <section className="agent-conversation" aria-label="Conversation" aria-live="polite">
            {messages.map((m, i) => <article key={i} className={`agent-bubble ${m.role}`}><span>{m.role === 'user' ? 'You' : <><PulpMark size={19} />PULP</>}</span><Rich text={m.text} /></article>)}
            {(Object.entries(live) as [string, string][]).filter(([, text]) => text).map(([role, text]) => <article className={`agent-bubble ${role}`} key={role}><span>{role === 'user' ? 'You' : 'PULP'} · live</span><p>{text}</p></article>)}
            {busy && <div className="agent-thinking"><span /><span /><span /><small>Finding a little clarity…</small></div>}
            <div ref={messagesEnd} />
          </section>
        )}
        <form className={`agent-composer ${voice ? 'voice-active' : ''}`} onSubmit={send}>
          <label className="sr-only" htmlFor="agent-message">Message PULP</label>
          <textarea ref={input} id="agent-message" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={account ? 'Tell me what life’s throwing your way…' : 'Load an account first…'} rows={2} maxLength={2000} disabled={loading || !account}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
          <div className="composer-bottom">
            <button type="button" className="composer-context" onClick={() => nav('/shock')}><Leaf size={15} /><span>{account ? 'Your financial context is here' : loading ? 'Reading your financial context…' : 'No account loaded yet'}</span></button>
            <div>
              <button type="button" className="composer-context" disabled={!account || busy} onClick={() => choose("Council: retain 55% income; bills +15%; 6 months")}>Planning council</button>
              <button type="button" className={`composer-voice ${voice ? 'active' : ''}`} onClick={toggleVoice} disabled={loading || !account} aria-label={voice ? 'Stop voice conversation' : 'Start voice conversation'}>{voice ? <Square size={16} /> : <Mic size={18} />}<span>{voice ? (listening ? 'Listening' : 'Connecting') : 'Talk'}</span></button>
              <button className="composer-send" aria-label="Send message" disabled={!draft.trim() || busy || confirming || loading || !account || !contextReady}><ArrowUp size={19} /></button>
            </div>
          </div>
        </form>
        {notice && <p className="agent-notice" role="status">{notice}</p>}
        {voiceProposal && (
          <div className="agent-proposal">
            <span className="agent-small-label">YOUR SPOKEN SCENARIO · NOT YET APPLIED</span>
            <p>{voiceProposal.explanation || 'Review these assumptions before using them.'}</p>
            <p>{voiceProposal.income_fraction != null && `Income retained: ${Math.round(voiceProposal.income_fraction * 100)}%. `}{voiceProposal.bills_increase != null && `Bills change: ${Math.round(voiceProposal.bills_increase * 100)}%. `}{voiceProposal.one_off_cost != null && `One-time expense: ${money(voiceProposal.one_off_cost)}. `}</p>
            <button onClick={applyVoiceProposal}>Review in Shock Lab <ArrowRight size={15} /></button>
          </div>
        )}
        {proposal && (
          <div className="agent-proposal">
            <span className="agent-small-label">A LITTLE CONTEXT TO KEEP · YOUR CHOICE</span>
            {proposal.changes.map((c, i) => <div className="agent-proposed-item" key={i}><span>{fieldNames[c.field] || c.field}</span><strong>{String(c.value.label ?? String(c.value.type ?? '').replaceAll('_', ' ') ?? 'Planning update')}</strong><small>{describe(c.value)}</small></div>)}
            <div className="agent-proposal-actions"><button onClick={() => confirm(true)} disabled={confirming || busy}><Check size={15} />{confirming ? 'Updating…' : 'Confirm & update my plan'}</button><button onClick={() => confirm(false)} disabled={confirming || busy}>Not now</button></div>
          </div>
        )}
        {plan && (
          <div className="agent-plan-note"><ShieldCheck size={19} /><div><b>{plan.snapshot.recommended_label}</b><p>{plan.diff.reasons.join(' ')}</p><button onClick={() => nav('/goals')}>Explore the details <ArrowUpRight size={13} /></button></div></div>
        )}
        <section className="agent-focus" aria-label="Current priorities">
          <span className="agent-small-label">{worries.length || goals.length ? 'WHAT MATTERS TO YOU' : 'A PLACE TO START'}</span>
          <div className="focus-chips">
            {worries.length || goals.length ? (<>
              {[...worries.map((w) => ({ label: w.label || String(w.type ?? '').replaceAll('_', ' '), text: `Can we revisit my concern about ${w.label || String(w.type ?? '').replaceAll('_', ' ')}?` })),
                ...goals.slice(0, 2).map((g) => ({ label: g.label || String(g.type ?? '').replaceAll('_', ' '), text: `Can we talk about my goal to ${g.label || String(g.type ?? '').replaceAll('_', ' ')}?` }))]
                .map((c, i) => <button key={i} onClick={() => choose(c.text)}><span className="focus-dot" />{c.label}<ArrowUpRight size={12} /></button>)}
              <button className="add-focus" aria-label="Add a concern or goal" onClick={() => choose("Something else that's on my mind is ")}><Plus size={15} /></button>
            </>) : suggestions.map(([label, text]) => <button key={label} onClick={() => choose(text)}>{label}<ArrowUpRight size={12} /></button>)}
          </div>
          {!worries.length && !goals.length && <p>Choose a starting point, or go your own way.</p>}
        </section>
        <section className="agent-snapshot" aria-label="Financial snapshot">
          <div className="snapshot-heading"><span>JUST A LITTLE CONTEXT</span><button onClick={() => nav('/shock')}>See the full picture <ArrowUpRight size={12} /></button></div>
          <div className="snapshot-values">
            <div><span>Estimated buffer</span><b>{account ? money(account.buffer) : '—'}</b></div>
            <div><span>Typical monthly surplus</span><b>{account ? `${account.typical_surplus > 0 ? '+' : ''}${money(account.typical_surplus)}` : '—'}</b></div>
            <div><span>Baseline runway</span><b>{account ? (account.baseline_runway == null ? 'No shortfall' : `${account.baseline_runway_label} months`) : '—'}</b></div>
          </div>
          <p>Observed account history · CAD · {account?.last_month || 'Loading'}<span> Only confirmed concerns become planning priorities.</span></p>
        </section>
      </main>
      <footer className="agent-footer"><span><span className="footer-leaf">✳</span> Prepare for what comes next.</span><span>{geminiConfigured ? aiLabel : 'Local companion'}<i />PULP · Independent student prototype</span></footer>
    </div>
  )
}
