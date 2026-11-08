/* What PULP gives you: the bottom line in four plain tiles (time saved, money you can keep, a new perspective, control),
   each with one number and one line, and how each was worked out behind one disclosure. */
import { useEffect, useState } from 'react'
import { Clock, Compass, Eye, PiggyBank } from 'lucide-react'
import { API_BASE } from '../../services/api'
import ItemIcon from '../ItemIcon'
import './benefits.css'

/** Shape of GET /api/customers/{id}/benefits (kept local so this page works before the shared type lands). */
export interface BenefitsData {
  headline: string
  time: { hours_saved: number; pulp_seconds?: number; basis?: string; items?: (string | { label: string; minutes?: number; basis?: string })[] }
  money: { per_year: number; items?: { label: string; amount: number; basis?: string }[]; shock?: { label: string; shortfall_without: number; shortfall_with_plan: number; avoided: number } | null }
  perspective: { count: number; headline?: string; items?: (string | { label: string; basis?: string })[] }
  control: { items?: (string | { label: string; basis?: string })[]; runway_gain_months?: number | null; plans_tried?: number; choices?: number }
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`
const text = (x: string | { label: string; basis?: string; minutes?: number }) => typeof x === 'string' ? x : x.basis ? `${x.label}: ${x.basis}` : x.label

export default function BenefitsPanel({ accountId }: { accountId: number }) {
  const [data, setData] = useState<BenefitsData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading')
  useEffect(() => {
    let live = true
    setState('loading'); setData(null)
    fetch(`${API_BASE}/api/customers/${accountId}/benefits`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: BenefitsData) => { if (live) { setData(d); setState('ready') } })
      .catch(() => { if (live) setState('gone') })
    return () => { live = false }
  }, [accountId])
  if (state === 'gone') return null
  if (state === 'loading' || !data) return <section className="benefits benefits-loading" aria-busy="true"><span /><span /><span /><span /></section>

  const tiles = [
    { key: 'time', Icon: Clock, title: 'Time saved', num: `${Math.max(1, Math.round(data.time.hours_saved))} hours`,
      line: data.time.pulp_seconds ? `What took an afternoon of spreadsheets took ${Math.round(data.time.pulp_seconds)} seconds.` : 'No forms, no spreadsheets: it reads your records for you.' },
    { key: 'money', Icon: PiggyBank, title: 'Money you can keep', num: `${money(data.money.per_year)} a year`,
      line: data.money.shock?.avoided ? `and ${money(data.money.shock.avoided)} less shortfall if ${data.money.shock.label.toLowerCase()}.` : 'From habits in your own records you can change.' },
    { key: 'perspective', Icon: Eye, title: 'A new perspective', num: `${data.perspective.count} things`,
      line: data.perspective.headline ?? 'you probably had not noticed about your money.' },
    { key: 'control', Icon: Compass, title: 'Control', num: data.control.runway_gain_months ? `+${data.control.runway_gain_months.toFixed(1)} months` : `${data.control.choices ?? 4} choices`,
      line: data.control.plans_tried ? `of breathing room, from ${data.control.plans_tried.toLocaleString()} plans tried for you.` : 'Clear options for what to do next, ready before you need them.' },
  ]
  return (
    <section className="benefits" aria-labelledby="benefits-title">
      <h2 id="benefits-title">What PULP gives you</h2>
      <p className="benefits-headline">{data.headline}</p>
      <ul className="benefits-tiles">
        {tiles.map((t) => (
          <li key={t.key}>
            <ItemIcon symbol={{ Icon: t.Icon, tone: 'green' }} />
            <div><span className="benefits-title">{t.title}</span><strong>{t.num}</strong><span className="benefits-line">{t.line}</span></div>
          </li>
        ))}
      </ul>
      <details className="benefits-how">
        <summary>How we worked this out</summary>
        <ul>
          {data.time.basis && <li><b>Time:</b> {data.time.basis}</li>}
          {(data.money.items ?? []).map((i) => <li key={i.label}><b>Money:</b> {i.label}, {money(i.amount)} a year{i.basis ? `. ${i.basis}` : ''}</li>)}
          {data.money.shock && <li><b>Money:</b> in {data.money.shock.label.toLowerCase()}, the shortfall goes from {money(data.money.shock.shortfall_without)} to {money(data.money.shock.shortfall_with_plan)} with the best plan.</li>}
          {(data.perspective.items ?? []).map((i, n) => <li key={`p${n}`}><b>Perspective:</b> {text(i)}</li>)}
          {(data.control.items ?? []).map((i, n) => <li key={`c${n}`}><b>Control:</b> {text(i)}</li>)}
        </ul>
      </details>
    </section>
  )
}
