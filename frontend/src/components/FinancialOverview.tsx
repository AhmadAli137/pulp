import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useApp } from '../stores/useApp'
import './financial-overview.css'

export type Goal = { id: string; type: string; label: string; target: number | null; saved: number | null; remaining: number | null; progress: number | null; deadline: string | null; monthly_needed: number | null; saved_as_of: string | null; question: string | null }
type Entry = { label: string; amount: number }
type Position = { assets: Entry[]; liabilities: Entry[]; as_of: string; complete: boolean }
export type Choice = { label: string; how: string; effect: string; questions: string[]; monthly_contribution: number; monthly_change: number }
export type Overview = { position: (Position & { asset_total: number; liability_total: number; difference: number }) | null; goals: Goal[]; questions: string[]; choices: Choice[]; plan_stale: boolean; recorded: { through: string }; cash_flow: { inflow: number; outflow: number; room: number; parts: Entry[] }; note: string }
export type Briefing = { headline: string; from: string; through: string; delivery: string; freshness: string; data_through: string; changes: { date: string; text: string }[]; goals: Goal[]; focus: string; next_steps: string[]; choices: Choice[]; plan_stale: boolean }
const money = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)
const today = () => new Date().toLocaleDateString('en-CA')

export function GoalCards({ goals, onSave }: { goals: Goal[]; onSave?: (goal: Goal, amount: number) => Promise<void> }) {
  return <div className="financial-goals">{goals.length === 0 ? <p>No confirmed goals yet. <Link to="/goals">Set your first goal</Link>.</p> : goals.map(g => <article className="financial-goal" key={g.id}>
    <div className="goal-ring" style={{ background: g.progress === null ? '#e5e5dc' : `conic-gradient(#225649 ${g.progress * 360}deg, #e5e5dc 0)` }}><span>{g.progress === null ? '—' : `${Math.round(g.progress * 100)}%`}</span></div>
    <div><h3>{g.label}</h3><p>{g.saved === null ? 'Savings not recorded' : `${money(g.saved)} set aside`}{g.target !== null ? ` of ${money(g.target)}` : ' · Budget needed'}</p>
    {g.saved_as_of && <small>Reported {g.saved_as_of}</small>}
    {g.deadline && <p>Target date: {g.deadline} (from your original goal timeline)</p>}
    {g.monthly_needed !== null && <p><strong>{money(g.monthly_needed)}/month</strong> needed at a steady pace. This is a target, not a confirmed affordable contribution.</p>}
    {g.question && <p className="small muted">{g.question}</p>}
    {onSave && <form className="goal-saving-form" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const value = Number(new FormData(form).get('saved')); await onSave(g, value) }}><label>Already set aside for {g.label}<input name="saved" type="number" min="0" max="1000000000000" step="0.01" required defaultValue={g.saved ?? ''} placeholder="Amount in CAD" /></label><button className="btn ghost" type="submit">Save progress</button></form>}
    </div></article>)}</div>
}

export default function FinancialOverview({ goalsOnly = false }: { goalsOnly?: boolean }) {
  const { accountId, context, refreshContext } = useApp()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Position>({ assets: [], liabilities: [], as_of: today(), complete: false })
  useEffect(() => { let active = true; setData(null); setEditing(false); setError(''); if (accountId) api.overview(accountId).then(v => { if (active) setData(v) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [accountId, context?.context_version])
  const save = async (change: { field: string; operation: string; value: Record<string, unknown>; target_id?: string }) => {
    if (!accountId || busy) return
    setBusy(true); setError('')
    try { await api.edit(accountId, change, false); await refreshContext(); setData(await api.overview(accountId)); setEditing(false) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  if (!data) return error ? <p role="alert">{error}</p> : <p role="status">Loading your account details…</p>
  const p = data.position
  const maximum = p ? Math.max(p.asset_total, p.liability_total, 1) : 1
  const parts = data.cash_flow.parts
  const sum = parts.reduce((n, x) => n + x.amount, 0) || 1
  return <div className="financial-overview" aria-busy={busy}>{error && <p role="alert">{error}</p>}
    {!goalsOnly && <section className="financial-section"><div className="row between"><div><span className="editorial-label">Your balance sheet</span><h2>What you own. What you owe.</h2></div><button className="btn ghost" onClick={() => { setDraft(p ? { assets: p.assets, liabilities: p.liabilities, as_of: p.as_of, complete: p.complete } : { assets: [], liabilities: [], as_of: today(), complete: false }); setEditing(true) }}>Update balances</button></div>
    {p ? <><div className="balance-columns">{(['assets', 'liabilities'] as const).map(kind => <article key={kind}><h3>{kind === 'assets' ? 'Assets' : 'Liabilities'}</h3><strong className="balance-total">{money(kind === 'assets' ? p.asset_total : p.liability_total)}</strong><div className={`balance-bar ${kind}`} style={{ width: `${(kind === 'assets' ? p.asset_total : p.liability_total) / maximum * 100}%` }} />{p[kind].map((x, i) => <div className="balance-item" key={i}><span>{x.label}</span><strong>{money(x.amount)}</strong></div>)}{!p[kind].length && <p>No entries provided.</p>}</article>)}</div><p className="position-net">{p.complete ? 'Reported net worth' : 'Difference for listed items'} <strong>{money(p.difference)}</strong></p><p className="small muted">Reported as of {p.as_of}. {p.complete ? 'You marked this list complete.' : 'Partial picture: other assets or debts may be missing.'}</p></> : <p>Your current balances are not known yet. Add savings, investments, property and outstanding debts to see your position. Historical account records alone cannot establish net worth.</p>}
    {editing && <form className="balance-editor" onSubmit={e => { e.preventDefault(); void save({ field: 'constraints', operation: 'add', value: { type: 'financial_position', ...draft } }) }}><h3>Balances you want to track</h3><p>Enter current values and outstanding debt balances in CAD. Include each asset once; money allocated to goals is part of these assets.</p>
      {(['assets', 'liabilities'] as const).map(kind => <fieldset key={kind}><legend>{kind === 'assets' ? 'Assets' : 'Liabilities'}</legend>{draft[kind].map((x, i) => <div className="balance-input" key={i}><label>Description<input required maxLength={80} value={x.label} onChange={e => setDraft({ ...draft, [kind]: draft[kind].map((r, j) => j === i ? { ...r, label: e.target.value } : r) })} /></label><label>Amount (CAD)<input required type="number" min="0" max="1000000000000" step="0.01" value={x.amount} onChange={e => setDraft({ ...draft, [kind]: draft[kind].map((r, j) => j === i ? { ...r, amount: Number(e.target.value) } : r) })} /></label><button type="button" className="btn ghost" aria-label={`Remove ${x.label || kind}`} onClick={() => setDraft({ ...draft, [kind]: draft[kind].filter((_, j) => j !== i) })}>Remove</button></div>)}<button type="button" className="btn ghost" disabled={draft[kind].length >= 32} onClick={() => setDraft({ ...draft, [kind]: [...draft[kind], { label: '', amount: 0 }] })}>Add {kind === 'assets' ? 'asset' : 'liability'}</button></fieldset>)}
      <label>Balances as of<input type="date" required max={today()} value={draft.as_of} onChange={e => setDraft({ ...draft, as_of: e.target.value })} /></label><label className="balance-complete"><input type="checkbox" checked={draft.complete} onChange={e => setDraft({ ...draft, complete: e.target.checked })} />This includes all my assets and debts.</label><div className="row"><button className="btn" disabled={busy}>Save balances</button><button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button></div>
    </form>}</section>}
    <section className="financial-section"><span className="editorial-label">What you are working toward</span><h2>Your goals, grounded in actual savings</h2><p>Progress uses amounts you report, not projected investment growth. Goal savings are allocations of your assets, not extra assets.</p><GoalCards goals={data.goals} onSave={(g, amount) => save({ field: 'goals', operation: 'update', target_id: g.id, value: { saved_amount: amount, saved_as_of: today() } })} /></section>
    {!goalsOnly && <><section className="financial-section"><span className="editorial-label">Historical monthly pattern · through {data.recorded.through}</span><h2>Where your money goes</h2><div className="cash-flow-totals"><p>Typical money in<strong>{money(data.cash_flow.inflow)}</strong></p><p>Typical money out<strong>{money(data.cash_flow.outflow)}</strong></p><p>Difference<strong>{money(data.cash_flow.room)}</strong></p></div><div className="allocation-strip" aria-hidden="true">{parts.map((x, i) => <span key={x.label} style={{ flex: x.amount / sum, background: ['#225649', '#a87b4d', '#6a8c84', '#b9a486', '#444f4a'][i % 5] }} />)}</div><div className="allocation-legend">{parts.map(x => <span key={x.label}>{x.label} <strong>{Math.round(x.amount / sum * 100)}%</strong></span>)}</div><p className="small muted">Shares of recorded outflows. The difference between typical inflow and outflow is not a guarantee of available money today.</p></section><p><Link to="/briefings">Read your daily briefing or weekly summary</Link></p></>}
  </div>
}
