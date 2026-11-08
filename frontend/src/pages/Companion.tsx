import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ChatResponse, type Proposal } from '../services/api'
import { useApp } from '../stores/useApp'
import { useSpeech } from '../hooks/useSpeech'
import { Card, Chip, Empty, ErrorBox, Spinner, fmt } from '../components/ui'

interface Msg { role: 'user' | 'bot'; text: string; mode?: string; tools?: ChatResponse['tool_results'] }

const STARTERS = [
  'I want to move out next year, but I\'m worried about losing my job.',
  'I want to buy a home in five years.',
  'Actually, I want to start a business next year, and my income may become irregular.',
  'If something came up I could free up about $300 a month.',
  'I\'d rather keep a bigger safety buffer than reach the goal faster.',
]

export default function Companion() {
  const { accountId, profile, context, refreshContext, setLastReplan, geminiConfigured, aiLabel } = useApp()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, setPending] = useState<Proposal[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [voiceOut, setVoiceOut] = useState(true)
  const [nextQ, setNextQ] = useState<string | null>(null)
  const sp = useSpeech()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!accountId) return
    api.context(accountId).then((c) => {
      setPending(c.summary.pending_proposals)
      setNextQ(c.next_question?.text ?? null)
      const hist = c.context.conversation.slice(-12).map((m) => ({ role: m.role === 'user' ? 'user' as const : 'bot' as const, text: m.text, mode: m.mode }))
      setMsgs(hist.length ? hist : [{ role: 'bot', text: `Hi. I'm PULP's companion for account ${accountId}. I can see the account's numbers; I can't see what you're living for. ${c.next_question?.text ?? 'What are you hoping to accomplish over the next couple of years?'}` }])
    }).catch(() => undefined)
  }, [accountId])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  if (!profile || !accountId) return <Empty>Select an account first.</Empty>

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setInput(''); setErr(null); setBusy(true)
    setMsgs((m) => [...m, { role: 'user', text: t }])
    try {
      const r = await api.chat(accountId, t)
      setMsgs((m) => [...m, { role: 'bot', text: r.reply, mode: r.mode, tools: r.tool_results }])
      setNotice(r.notice)
      setNextQ(r.next_question?.text ?? null)
      if (r.proposal) setPending((p) => [...p, r.proposal as Proposal])
      if (voiceOut) sp.speak(r.reply)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const decide = async (p: Proposal, accept: boolean) => {
    setBusy(true); setErr(null)
    try {
      const r = await api.confirm(accountId, p.id, accept)
      setPending((ps) => ps.filter((x) => x.id !== p.id))
      await refreshContext()
      if (accept && r.replan) {
        setLastReplan(r.replan)
        const d = r.replan.diff
        const note = d.has_previous
          ? (d.materially_changed ? `Plan updated. ${d.reasons.join(' ')} See My Goals for the before-and-after.` : `Saved. ${d.reasons[0]} See My Goals.`)
          : `Saved and first plan created: ${r.replan.snapshot.recommended_label}, goal ${r.replan.comparison.goal.label} (${fmt.money(r.replan.comparison.goal.target_amount)} in ${r.replan.comparison.goal.target_months} months).`
        setMsgs((m) => [...m, { role: 'bot', text: note, mode: 'replan' }])
        if (voiceOut) sp.speak(note)
      } else if (!accept) {
        setMsgs((m) => [...m, { role: 'bot', text: 'Discarded. Nothing was saved to your profile.', mode: 'system' }])
      }
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const describe = (c: Proposal['changes'][number]) => {
    const v = c.value
    const bits = Object.entries(v).filter(([k]) => !['type', 'label'].includes(k)).map(([k, x]) => `${k.replace(/_/g, ' ')} ${typeof x === 'number' && k.includes('amount') ? fmt.money(x) : String(x)}`)
    return `${c.operation} ${c.field.replace(/_/g, ' ')}: ${String(v.label ?? v.type ?? v.choice ?? '')}${bits.length ? ` (${bits.join(', ')})` : ''}`
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
      <Card title="Conversation" right={<Chip tone={geminiConfigured ? '' : 'gray'}>{aiLabel}</Chip>}>
        {notice && <p className="callout" style={{ marginBottom: 10 }}>{notice}</p>}
        <div className="chat" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.text}
              {(m.mode || m.tools?.length) && <div className="m">{m.mode ? m.mode.replace(/_/g, ' ') : ''}{m.tools?.length ? ` · tools: ${m.tools.map((t) => t.tool).join(', ')}` : ''}</div>}
            </div>
          ))}
          {busy && <div className="bubble bot"><Spinner /></div>}
          {sp.interim && <div className="bubble user" style={{ opacity: 0.6 }}>{sp.interim}…</div>}
          <div ref={endRef} />
        </div>
        <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); void send(input) }}>
          <button type="button" className={`mic${sp.listening ? ' on' : ''}`} onClick={() => (sp.listening ? sp.stop() : sp.start((t) => { setInput(t); void send(t) }))} aria-label={sp.listening ? 'Stop recording' : 'Start recording'} disabled={!sp.supported} title={sp.supported ? 'Hold a conversation by voice' : 'Voice not supported in this browser'}>
            {sp.listening ? '■' : '🎤'}
          </button>
          <input style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }} value={input} onChange={(e) => setInput(e.target.value)} placeholder={nextQ ?? 'Tell PULP about a goal or a worry…'} aria-label="Message" />
          <button className="btn primary" type="submit" disabled={busy || !input.trim()}>Send</button>
        </form>
        <div className="row between" style={{ marginTop: 8 }}>
          <label className="small muted row"><input type="checkbox" checked={voiceOut} onChange={(e) => { setVoiceOut(e.target.checked); if (!e.target.checked) sp.stopSpeaking() }} disabled={!sp.ttsSupported} /> Read replies aloud{sp.speaking && ' · speaking'}</label>
          <span className="tiny muted">{sp.supported ? 'Browser speech recognition' : 'Voice unavailable; text works'} · {sp.listening ? 'listening…' : 'idle'}</span>
        </div>
        <ErrorBox msg={sp.error ?? err} />
        <div className="preset-row" style={{ marginTop: 12 }}>
          {STARTERS.map((s) => <button key={s} className="preset" onClick={() => void send(s)} disabled={busy}>{s}</button>)}
        </div>
      </Card>

      <div className="stack">
        <Card title="Proposed memory updates" right={<Chip tone="gold">{pending.length} pending</Chip>}>
          {pending.length === 0 ? <p className="small muted">When you share something meaningful, the companion drafts an update here. Nothing is saved until you confirm.</p> : pending.map((p) => (
            <div key={p.id} className="proposal" style={{ marginBottom: 10 }}>
              <div className="small strong">From {p.source.replace(/_/g, ' ')} · {p.rationale}</div>
              <ul>{p.changes.map((c, i) => <li key={i}>{describe(c)}</li>)}</ul>
              <div className="row">
                <button className="btn primary sm" onClick={() => decide(p, true)} disabled={busy}>Confirm and replan</button>
                <button className="btn sm" onClick={() => decide(p, false)} disabled={busy}>Discard</button>
              </div>
            </div>
          ))}
        </Card>
        <Card title="Current goal context" right={<Link to="/twin" className="small">edit</Link>}>
          {context && (context.goals.length + context.concerns.length + context.constraints.length + context.preferences.length) > 0 ? (
            <div className="stack small">
              {context.goals.map((g, i) => <div key={i}><Chip>goal</Chip> {String(g.label ?? g.type)}{g.target_months ? ` · ${g.target_months} mo` : ''}{g.target_amount ? ` · ${fmt.money(Number(g.target_amount))}` : ''}</div>)}
              {context.concerns.map((g, i) => <div key={i}><Chip tone="danger">concern</Chip> {String(g.label ?? g.type)}</div>)}
              {context.constraints.map((g, i) => <div key={i}><Chip tone="gray">constraint</Chip> {String(g.type).replace(/_/g, ' ')}{g.amount ? ` ${fmt.money(Number(g.amount))}` : ''}{g.fraction ? ` ${fmt.pct(Number(g.fraction))}` : ''}</div>)}
              {context.preferences.map((g, i) => <div key={i}><Chip tone="gold">preference</Chip> {String(g.type).replace(/_/g, ' ')}: {String(g.choice ?? g.label ?? '')}</div>)}
              <div className="tiny muted">context v{context.context_version} · asked: {context.asked_questions.join(', ') || 'none yet'}</div>
            </div>
          ) : <p className="small muted">Nothing confirmed yet.</p>}
        </Card>
        <Card title="How this works" soft>
          <p className="small">The companion learns life context the bank data cannot see, proposes structured updates, and only after you confirm does PULP update your twin, rerun the simulator, compare strategies and explain what changed. Every number comes from the calculator, never from the model. You may be speaking as a hypothetical person; the anonymized record is not assumed to be yours.</p>
          <p className="tiny muted" style={{ marginTop: 8 }}>Question choice is a heuristic: relevance to the plan minus burden minus a repetition penalty. Not a trained model.</p>
        </Card>
      </div>
    </div>
  )
}
