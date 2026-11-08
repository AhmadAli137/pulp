import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type ChatResponse, type Proposal, type SampleAccount, type ShockReport } from '../services/api'
import { parseTwist } from '../services/twist'
import { useApp } from '../stores/useApp'
import { useSpeech } from '../hooks/useSpeech'
import Mascot, { type Mood } from '../components/Mascot'
import { fmt } from '../components/ui'

interface Turn { role: 'user' | 'bot'; text: string; mode?: string; shock?: ShockReport; proposal?: Proposal | null; tools?: ChatResponse['tool_results'] }

const TWISTS = ['Laid off, EI pays 55% for 6 months. Do they make it?', 'The furnace dies: repair costs a full month of typical spending', 'Job loss at 55% and household bills up 15% in the same month']
const LIFE = ['I want to move out next year, but I\'m worried about losing my job', 'I want to buy a home in five years', 'Actually, I want to start a business next year, and my income may become irregular']

function ShockCard({ r, onOpen }: { r: ShockReport; onOpen: () => void }) {
  const v = r.verdict
  const tone = v.exact_at_horizon ? 'exact' : v.survives ? 'ok' : 'bad'
  return (
    <div className="shockcard">
      <div className={`top ${tone}`}>
        <b>{v.exact_at_horizon ? `Exactly ${v.horizon_months} months` : v.survives ? `Makes it through ${v.horizon_months} months` : `Does not make it through ${v.horizon_months} months`}</b>
        <span><span className="tiny muted">official runway </span><span className="rw">{r.shocked.runway_label}</span></span>
      </div>
      <div className="body">
        <div><span className="muted">Income after</span><b>{fmt.money(r.shocked.income_after)}</b><span className="muted">was {fmt.money(r.baseline.income_after)}</span></div>
        <div><span className="muted">Spending after</span><b>{fmt.money(r.shocked.spending_after)}</b><span className="muted">gap {fmt.money(r.shocked.monthly_gap)}/mo</span></div>
        <div><span className="muted">Buffer after one-time cost</span><b>{fmt.money(r.shocked.buffer_left)}</b><span className="muted">{r.upfront_cost > 0 ? `paid ${fmt.money(r.upfront_cost)}` : 'nothing paid upfront'}</span></div>
      </div>
      <div className="plans">
        <span><strong>Why:</strong> {r.explanation.summary}.</span>
        <span><strong>Before the shock:</strong> {r.goal_plan.note}</span>
        <span><strong>If it happens:</strong> {r.backup_plan.note}</span>
      </div>
      <div className="foot">
        <span className="muted">Sponsor formula, unrounded values. Cash flows held constant through the horizon.</span>
        <button className="btn ghost sm" onClick={onOpen}>Open in Shock Lab →</button>
      </div>
    </div>
  )
}

export default function Home() {
  const { accountId, profile, loadAccount, loadingProfile, context, refreshContext, setInputs, runShock, setLastReplan, aiLabel } = useApp()
  const [thread, setThread] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [samples, setSamples] = useState<SampleAccount[]>([])
  const [mood, setMood] = useState<Mood>('happy')
  const [voiceOut, setVoiceOut] = useState(false)
  const sp = useSpeech()
  const nav = useNavigate()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { api.samples().then((s) => setSamples(s.accounts)).catch(() => undefined) }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [thread, busy])

  const say = (t: Turn) => { setThread((x) => [...x, t]); if (t.role === 'bot' && voiceOut) sp.speak(t.text) }

  const send = async (raw: string) => {
    const text = raw.trim()
    if (!text || busy) return
    setInput('')
    say({ role: 'user', text })
    setBusy(true); setMood('thinking')
    try {
      const idMatch = text.match(/^\s*(?:account\s*)?#?(\d{3,})\s*$/i)
      if (idMatch) {
        await loadAccount(Number(idMatch[1]))
        const err = useApp.getState().profileError
        if (err) { say({ role: 'bot', text: `${err} Try one of the sample accounts below, or any account_id from accounts.csv.` }); setMood('worried') }
        else { const p = useApp.getState().profile!; say({ role: 'bot', text: `Account ${p.account_id} loaded: typical inflow ${fmt.money(p.typical_inflow)}, spending ${fmt.money(p.typical_spending)}, buffer ${fmt.money(p.buffer)}, baseline runway ${p.baseline_runway_label}. Give me a twist, or tell me what you're working toward.` }); setMood('cheer') }
        return
      }
      if (!accountId || !profile) {
        say({ role: 'bot', text: 'First tell me which account we are looking at: type an account number, or pick a sample below.' }); setMood('thinking')
        return
      }
      const twist = parseTwist(text)
      if (twist) {
        const body = twist.oneOffInMonthsOfSpending != null
          ? { account_id: accountId, ...twist.inputs, one_off_cost: 0, one_off_in_months_of_spending: twist.oneOffInMonthsOfSpending }
          : { account_id: accountId, ...twist.inputs }
        const r = await api.shock(body)
        setInputs({ ...twist.inputs, one_off_cost: r.applied_inputs.one_off_cost })
        void runShock()
        say({ role: 'bot', text: `I read that as: ${twist.description.join(', ')}. ${r.verdict.verdict}`, shock: r })
        setMood(r.verdict.survives ? 'cheer' : 'worried')
        return
      }
      const r = await api.chat(accountId, text)
      say({ role: 'bot', text: r.reply, mode: r.mode, proposal: r.proposal, tools: r.tool_results })
      await refreshContext()
      setMood(r.proposal ? 'cheer' : 'happy')
    } catch (e) {
      say({ role: 'bot', text: `Something went wrong: ${(e as Error).message}` }); setMood('worried')
    } finally { setBusy(false) }
  }

  const decide = async (p: Proposal, accept: boolean) => {
    if (!accountId) return
    setBusy(true); setMood('thinking')
    try {
      const r = await api.confirm(accountId, p.id, accept)
      setThread((x) => x.map((t) => (t.proposal?.id === p.id ? { ...t, proposal: { ...p, status: accept ? 'confirmed' : 'rejected' } } : t)))
      await refreshContext()
      if (accept && r.replan) {
        setLastReplan(r.replan)
        const d = r.replan.diff
        const txt = d.has_previous
          ? (d.materially_changed ? `Plan updated. ${d.reasons.join(' ')}` : `Saved. ${d.reasons[0]}`)
          : `Saved. First plan: ${r.replan.snapshot.recommended_label}, toward ${r.replan.comparison.goal.label} (${fmt.money(r.replan.comparison.goal.target_amount)} in ${r.replan.comparison.goal.target_months} months).`
        say({ role: 'bot', text: txt, mode: 'replan' })
        setMood('cheer')
      } else { setMood('happy') }
    } catch (e) { say({ role: 'bot', text: (e as Error).message }) } finally { setBusy(false) }
  }

  const openLab = () => nav('/shock')
  const concerns = (context?.concerns ?? []) as { label?: string; type?: string }[]
  const goals = (context?.goals ?? []) as { label?: string; type?: string; target_months?: number }[]
  const describe = (c: Proposal['changes'][number]) => {
    const v = c.value
    const bits = Object.entries(v).filter(([k]) => !['type', 'label', 'priority'].includes(k)).map(([k, x]) => `${k.replace(/_/g, ' ')} ${typeof x === 'number' && k.includes('amount') ? fmt.money(x) : String(x)}`)
    return `${c.field.replace(/_/g, ' ')}: ${String(v.label ?? v.type ?? v.choice ?? '')}${bits.length ? ` (${bits.join(', ')})` : ''}`
  }

  return (
    <div className="home">
      <div className="home-greet">
        <Mascot size={thread.length ? 72 : 120} mood={busy ? 'thinking' : mood} className="breathe" />
        {thread.length === 0 && (
          <>
            <h1>{profile ? `Account ${profile.account_id} is loaded. What's on your mind?` : "Hi, I'm Pip. Which account are we looking at?"}</h1>
            <p>{profile ? 'Give me a twist in plain words and I will run the official numbers, or tell me what you are working toward and I will plan around it.' : 'Type an account number, or pick a sample. Then ask me a what-if or tell me a goal.'}</p>
          </>
        )}
      </div>

      {thread.length > 0 && (
        <div className="thread" aria-live="polite">
          {thread.map((t, i) => (
            <div key={i} className={`turn ${t.role}`}>
              {t.role === 'bot' && <Mascot size={34} mood={t.shock ? (t.shock.verdict.survives ? 'cheer' : 'worried') : 'happy'} />}
              <div className="b">
                {t.text}
                {t.shock && <ShockCard r={t.shock} onOpen={openLab} />}
                {t.proposal && (
                  <div className="proposal proposal-inline">
                    <div className="small strong">Save to your profile?</div>
                    <ul>{t.proposal.changes.map((c, j) => <li key={j}>{describe(c)}</li>)}</ul>
                    {t.proposal.status === 'pending' ? (
                      <div className="row">
                        <button className="btn primary sm" onClick={() => decide(t.proposal!, true)} disabled={busy}>Confirm and replan</button>
                        <button className="btn sm" onClick={() => decide(t.proposal!, false)} disabled={busy}>Discard</button>
                      </div>
                    ) : <span className="tiny muted">{t.proposal.status}</span>}
                  </div>
                )}
                {(t.mode || t.tools?.length) && <div className="m">{t.mode?.replace(/_/g, ' ')}{t.tools?.length ? ` · ${t.tools.map((x) => x.tool).join(', ')}` : ''}</div>}
              </div>
            </div>
          ))}
          {busy && <div className="turn bot"><Mascot size={34} mood="thinking" /><div className="b"><span className="pip-typing"><i /><i /><i /></span></div></div>}
          <div ref={endRef} />
        </div>
      )}

      <form className="ask" onSubmit={(e) => { e.preventDefault(); void send(input) }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={profile ? 'Ask a what-if, or tell Pip a goal…' : 'Type an account number, e.g. 47788'} aria-label="Message" disabled={loadingProfile} />
        <button type="button" className={`mic${sp.listening ? ' on' : ''}`} onClick={() => (sp.listening ? sp.stop() : sp.start((t) => { void send(t) }))} disabled={!sp.supported} aria-label={sp.listening ? 'Stop recording' : 'Start recording'} title={sp.supported ? 'Talk to Pip' : 'Voice not supported in this browser'}>{sp.listening ? '■' : '🎤'}</button>
        <button type="submit" className="send" disabled={busy || !input.trim()} aria-label="Send">➤</button>
      </form>
      {sp.interim && <div className="tiny muted" style={{ textAlign: 'center' }}>{sp.interim}…</div>}
      {sp.error && <div className="err">{sp.error}</div>}

      <div className="suggest">
        {!profile
          ? samples.slice(0, 5).map((s) => <button key={s.account_id} onClick={() => void send(String(s.account_id))}>Account {s.account_id} · {s.tag}</button>)
          : [...TWISTS, ...LIFE].map((s) => <button key={s} onClick={() => void send(s)} disabled={busy}>{s}</button>)}
      </div>

      {profile && (
        <>
          <div className="strip">
            <div className="s"><div className="l">Typical inflow</div><div className="v">{fmt.money(profile.typical_inflow)}</div></div>
            <div className="s"><div className="l">Typical spending</div><div className="v">{fmt.money(profile.typical_spending)}</div></div>
            <div className="s"><div className="l">Cash buffer</div><div className="v">{fmt.money(profile.buffer)}</div></div>
            <div className="s"><div className="l">Baseline runway</div><div className={`v ${profile.baseline_gap <= 0 ? 'ok' : 'bad'}`}>{profile.baseline_runway_label === 'no shortfall (120+)' ? 'No shortfall' : `${profile.baseline_runway_label} mo`}</div></div>
          </div>
          <div className="worries">
            <span>Right now:</span>
            {concerns.length === 0 && goals.length === 0 && <span className="muted">nothing confirmed yet. Tell Pip what you're worried about or working toward.</span>}
            {concerns.map((c, i) => <span key={`c${i}`} className="w">⚠ {c.label ?? c.type}</span>)}
            {goals.map((g, i) => <span key={`g${i}`} className="w goal">◎ {g.label ?? g.type}{g.target_months ? ` · ${g.target_months} mo` : ''}</span>)}
            <Link to="/goals" className="tiny">plans →</Link>
          </div>
        </>
      )}

      <div className="home-foot">
        <label><input type="checkbox" checked={voiceOut} onChange={(e) => { setVoiceOut(e.target.checked); if (!e.target.checked) sp.stopSpeaking() }} disabled={!sp.ttsSupported} /> read replies aloud</label>
        {' · '}{aiLabel} · every number comes from the calculator, never from the model · anonymized data, not your identity
      </div>
    </div>
  )
}
