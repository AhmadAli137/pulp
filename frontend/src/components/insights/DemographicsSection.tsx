/* "Where you live and who you are": the owner's age, household and home district against everyone else in the bank.
   Numbers come from GET /api/insights/demographics/{id}; this component only draws them. */
import ExplainButton from '../ExplainButton'
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Building2, CalendarClock, Landmark, MapPin, TrendingDown, TrendingUp, Minus, Users } from 'lucide-react'
import { api, type Demographics, type DemographicInsight } from '../../services/api'
import { Finding, JuiceCups, RECORDS_PERIOD } from './JuiceCups'
import './demographics.css'

const DIMENSIONS: { key: Demographics['groups'][number]['dimension']; title: string }[] = [
  { key: 'age_band', title: 'By age' },
  { key: 'household', title: 'By who owns the account' },
  { key: 'region', title: 'By region' },
  { key: 'urban', title: 'City or countryside' },
  { key: 'unemployment_trend', title: 'By local unemployment, 2022 to 2023' },
]
const CATEGORY_ICON = { age: CalendarClock, household: Users, location: MapPin, economy: Landmark, banking: Building2 } as const
const CATEGORY_LABEL = { age: 'Age', household: 'Household', location: 'Location', economy: 'Local economy', banking: 'Banking' } as const
const INK = '#1c4639'
const MUTED = '#9aab9c'
const MINE = '#9c4f30'
const LINE = '#e3e7dd'

const money = (v: number) => `$${Math.round(v).toLocaleString()}`

export default function DemographicsSection({ accountId }: { accountId: number }) {
  const [data, setData] = useState<Demographics | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [numbers, setNumbers] = useState(false)

  useEffect(() => {
    let live = true
    setState('loading')
    setData(null)
    api.demographics(accountId)
      .then((d) => { if (live) { setData(d); setState('ready') } })
      .catch(() => { if (live) setState('unavailable') })
    return () => { live = false }
  }, [accountId])

  return (
    <section className="card demo-section" aria-labelledby="demographics-heading">
      <div className="demo-head">
        <div>
          <span className="editorial-label">Your age, household and district · compared with 4,500 accounts</span>
          <h2 id="demographics-heading">Where you live and who you are</h2>
        </div>
        <ExplainButton topic="demographics" label="where you live and who you are" />
        {state === 'ready' && (
          <button type="button" className="demo-toggle" aria-pressed={numbers} onClick={() => setNumbers((v) => !v)}>
            {numbers ? 'Show plain language' : 'Show the numbers'}
          </button>
        )}
      </div>

      {state === 'loading' && <p className="muted small">Comparing your age, household and district with everyone else in the bank…</p>}
      {state === 'unavailable' && (
        <p className="demo-note" role="note">Location and age comparisons are not available right now. Everything else on this page still works.</p>
      )}
      {state === 'ready' && data && (
        <>
          <DistrictCard data={data} />
          <ol className="demo-insights" aria-label="What your age and location say">
            {data.insights.slice(0, 4).map((i) => <InsightRow key={i.key} insight={i} numbers={numbers} />)}
          </ol>
          {data.insights.length > 4 && (
            <details className="demo-more disclose">
              <summary>Show {data.insights.length - 4} more about your age and location</summary>
              <ol className="demo-insights" start={5}>
                {data.insights.slice(4).map((i) => <InsightRow key={i.key} insight={i} numbers={numbers} />)}
              </ol>
            </details>
          )}
          <GroupCharts data={data} />
          <details className="demo-caveats">
            <summary>How to read this</summary>
            <ul>{data.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
          </details>
        </>
      )}
    </section>
  )
}

function DistrictCard({ data }: { data: Demographics }) {
  const d = data.district
  const p = data.person
  const delta = d.unemployment_2023 - d.unemployment_2022
  const Trend = delta > 0.005 ? TrendingUp : delta < -0.005 ? TrendingDown : Minus
  const facts: [string, string][] = [
    ['Average salary', `${money(d.average_salary)} / month`],
    ['Urban population', `${Math.round(d.urban_ratio_pct)}%`],
    ['Business owners', `${Math.round(d.entrepreneurs_per_1000)} per 1,000`],
    ['Recorded crime', `${Math.round(d.crimes_per_1000)} per 1,000 a year`],
    ['Inhabitants', d.inhabitants.toLocaleString()],
  ]
  const who = [
    p.age != null ? `${p.age} years old` : null,
    p.joint ? 'shared account' : 'one owner',
    p.card ? `${p.card} card` : 'no card',
    `banking here ${p.account_years.toFixed(1)} years`,
  ].filter(Boolean).join(' · ')
  return (
    <div className="demo-district">
      <div className="demo-district-name">
        <MapPin size={18} aria-hidden="true" />
        <div>
          <strong>{d.name}</strong>
          <span>{d.region} · {who}</span>
        </div>
      </div>
      <dl className="demo-facts">
        <div className="demo-fact demo-fact-trend">
          <dt>Unemployment</dt>
          <dd>
            {d.unemployment_2022.toFixed(2)}% <span aria-hidden="true">→</span> {d.unemployment_2023.toFixed(2)}%
            <Trend size={15} className={delta > 0 ? 'demo-up' : 'demo-down'} aria-label={delta > 0 ? 'rising' : delta < 0 ? 'falling' : 'flat'} />
          </dd>
        </div>
        {facts.map(([k, v]) => (
          <div className="demo-fact" key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  )
}

function InsightRow({ insight, numbers }: { insight: DemographicInsight; numbers: boolean }) {
  const Icon = CATEGORY_ICON[insight.category] ?? MapPin
  return (
    <li className="demo-insight">
      <span className="demo-icon" aria-hidden="true"><Icon size={16} /></span>
      <div className="demo-insight-body">
        <div className="demo-insight-top">
          <h3>{insight.title}</h3>
          <span className="demo-cat">{CATEGORY_LABEL[insight.category]}</span>
          <span className={`demo-strength demo-strength-${insight.strength}`} title="How much data stands behind this">
            {insight.strength === 'strong' ? 'Strong evidence' : insight.strength === 'moderate' ? 'Moderate evidence' : 'Weak: small group'}
          </span>
        </div>
        <p className={numbers ? 'demo-technical' : undefined}>{numbers ? insight.technical : insight.plain}</p>
        <div className="demo-insight-meta">
          <span className="demo-value">{insight.value}</span>
          <span className="demo-compare">{insight.compare}</span>
        </div>
        {insight.percentile != null && <PercentileTrack value={insight.percentile} label={insight.title} />}
      </div>
    </li>
  )
}

function PercentileTrack({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="demo-track" role="img" aria-label={`${label}: percentile ${Math.round(v)} of 100`}>
      <div className="demo-track-bar">
        {[25, 50, 75].map((t) => <i key={t} style={{ left: `${t}%` }} />)}
        <b style={{ left: `${v}%` }} />
      </div>
      <div className="demo-track-ticks" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((t) => <span key={t} style={{ left: `${t}%` }}>{t}</span>)}
      </div>
      <span className="demo-track-caption">Percentile: {Math.round(v)}</span>
    </div>
  )
}

function useNarrow(px = 600) {
  const query = `(max-width: ${px}px)`
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches)
  useEffect(() => {
    const m = window.matchMedia?.(query)
    if (!m) return
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return narrow
}

function GroupCharts({ data }: { data: Demographics }) {
  const narrow = useNarrow()
  const overall = useMemo(() => {
    const rows = data.groups.filter((g) => g.dimension === 'age_band')
    const n = rows.reduce((s, g) => s + g.n, 0)
    return n ? rows.reduce((s, g) => s + g.survive6_layoff_pct * g.n, 0) / n : null
  }, [data])
  return (
    <div className="demo-groups">
      <h3>Who lasts a six-month layoff, by group</h3>
      <p className="small muted">
        Share of accounts that would last six months on 55% of their usual income. Your group is highlighted
        {overall != null ? `; across everyone it is ${overall.toFixed(0)}%` : ''}. Each group shows how many accounts it holds.
      </p>
      <Finding title="Who lasts a six-month layoff, by group"
        source={{ kind: 'simulated', what: 'six-month layoff at 55% of usual money in, accounts grouped by owner and district records', period: `account records ${RECORDS_PERIOD}` }}
        simple={<div className="demo-group-grid">
          {DIMENSIONS.map((dim) => {
            const rows = data.groups.filter((g) => g.dimension === dim.key)
            if (!rows.length) return null
            return <JuiceCups key={dim.key} title={dim.title}
              cups={rows.map((g) => ({ label: g.mine ? `${g.label} (you)` : g.label, value: g.survive6_layoff_pct, sub: `${g.n.toLocaleString()} accounts`, highlight: g.mine }))} />
          })}
        </div>}
        detailed={<div className="demo-group-grid">
        {DIMENSIONS.map((dim) => {
          const rows = data.groups.filter((g) => g.dimension === dim.key)
          if (!rows.length) return null
          const chart = rows.map((g) => ({ ...g, name: narrow ? `${g.label} · ${g.n.toLocaleString()}` : `${g.label} (n=${g.n.toLocaleString()})` }))
          const height = 34 + rows.length * 30
          return (
            <figure className="demo-group" key={dim.key}>
              <figcaption>{dim.title}</figcaption>
              <ResponsiveContainer width="100%" height={height}>
                <BarChart data={chart} layout="vertical" margin={{ top: 4, right: narrow ? 34 : 40, left: 0, bottom: 4 }} barCategoryGap={6}>
                  <CartesianGrid stroke={LINE} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#54645a' }} />
                  <YAxis type="category" dataKey="name" width={narrow ? 128 : 160} tick={{ fontSize: 11, fill: INK }} interval={0} />
                  {overall != null && <ReferenceLine x={overall} stroke={INK} strokeDasharray="4 3" />}
                  <Bar dataKey="survive6_layoff_pct" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {chart.map((g) => <Cell key={g.label} fill={g.mine ? MINE : MUTED} />)}
                    <LabelList dataKey="survive6_layoff_pct" position="right" formatter={(v: unknown) => `${Math.round(Number(v))}%`} style={{ fontSize: 11, fill: INK }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <table className="sr-only">
                <caption>{dim.title}: share lasting a six-month layoff</caption>
                <thead><tr><th>Group</th><th>Accounts</th><th>Lasting six months</th><th>Median spending ÷ income</th></tr></thead>
                <tbody>{rows.map((g) => (
                  <tr key={g.label}><td>{g.label}{g.mine ? ' (you)' : ''}</td><td>{g.n}</td><td>{g.survive6_layoff_pct}%</td><td>{Math.round(g.median_spend_ratio * 100)}%</td></tr>
                ))}</tbody>
              </table>
            </figure>
          )
        })}
      </div>} />
    </div>
  )
}
