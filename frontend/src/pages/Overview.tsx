import { Activity, ArrowRight, CalendarDays, Landmark, MessageCircle, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import DemoAccountPicker from '../components/DemoAccountPicker'
import DiscoveryHighlight from '../components/insights/DiscoveryHighlight'
import { LikeOthers, TraitTrack } from '../components/profile/ProfileParts'
import { useProfileDoc } from '../components/profile/useProfileDoc'
import { JuiceDrop, PressIcon, SqueezeLoader, Tangerine } from '../components/PulpMascot'
import ResilienceEntry from '../components/ResilienceEntry'
import ThreadFigure from '../components/stage/ThreadFigure'
import '../components/twist-deck.css'
import { Card, fmt } from '../components/ui'
import type { LifePersona, Profile } from '../services/api'
import { useApp } from '../stores/useApp'

const monthFormat = new Intl.DateTimeFormat('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function recordMonth(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00Z`)
  return Number.isNaN(date.valueOf()) ? value : monthFormat.format(date)
}

export default function Overview() {
  const profile = useApp((state) => state.profile)
  const openPulp = useApp((state) => state.openPulp)
  const { doc } = useProfileDoc(profile?.account_id ?? null)
  if (!profile) return <DemoAccountPicker />
  const persona = doc?.account_id === profile.account_id ? doc.persona : null

  const { account_id, typical_inflow, typical_spending, typical_surplus } = profile
  const chartMax = Math.max(typical_inflow, typical_spending, 1)
  const runway = profile.baseline_runway
  const runwayLabel = runway === null ? 'No monthly shortfall'
    : runway === 0 ? '0 months'
    : runway >= 120 ? '120+ months'
    : `${profile.baseline_runway_label} months`
  const runwayNote = runway === null ? 'Typical money in covers typical money out.'
    : runway === 0 ? 'The historical figures give this account no positive cash buffer.'
    : 'The cash buffer divided by the monthly shortfall, with no shock applied.'

  return (
    <div className="bank-overview" key={account_id}>
      <section className="bank-account-summary" aria-labelledby="bank-summary-title">
        <div>
          <span className="bank-demo-badge"><span aria-hidden="true" /> Historical demo data</span>
          <h2 id="bank-summary-title">Account {account_id}</h2>
          <p><CalendarDays size={16} aria-hidden="true" /> {recordMonth(profile.first_month)} to {recordMonth(profile.last_month)} <span>·</span> {profile.months_available} {profile.months_available === 1 ? 'month' : 'months'} of records</p>
        </div>
        <div className="bank-actions">
          <Link className="bank-button bank-button-primary" to="/shock"><Activity size={17} aria-hidden="true" /> Run a shock</Link>
          <Link className="bank-button" to="/plan">View my plan <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      <DiscoveryHighlight accountId={account_id} compact />

      <Squeezed persona={persona} loading={!doc} />

      <div className="bank-overview-grid">
        <Card title="Your typical month" className="bank-flow">
          <p>These figures use the middle of the monthly totals in the records, in Canadian dollars.</p>
          <dl className="bank-flow-rows">
            {([
              ['Money in', typical_inflow],
              ['Money out', typical_spending],
            ] as const).map(([label, amount]) => (
              <div key={label} className="bank-flow-row">
                <dt>{label}</dt>
                <dd className="bank-money">{fmt.money(amount, 2)}</dd>
                <span className="bank-flow-track" aria-hidden="true"><span style={{ width: `${Math.max(0, amount) / chartMax * 100}%` }} /></span>
              </div>
            ))}
          </dl>
          <div className="bank-flow-total">
            <span>{typical_surplus < 0 ? 'Typical monthly shortfall' : 'Typical monthly amount left'}</span>
            <strong className="bank-money" style={typical_inflow > typical_spending ? { color: 'var(--bank-green)' } : undefined}>{fmt.money(Math.abs(typical_surplus), 2)}</strong>
          </div>
          <section className="bank-runway" aria-labelledby="bank-runway-title">
            <div className="bank-flow-total">
              <h3 id="bank-runway-title">Baseline runway</h3>
              <strong className="bank-money">{runwayLabel}</strong>
            </div>
            <p>{runwayNote}</p>
          </section>
          <details className="bank-picture">
            <summary>See your month as a picture</summary>
            <PictureWhatIf profile={profile} />
          </details>
        </Card>

        <div className="bank-balance-cards">
          <Card title={<><Wallet size={19} aria-hidden="true" /> Cash buffer</>} className="bank-balance">
            <strong className="bank-money">{fmt.money(profile.buffer, 2)}</strong>
            <p>Based on average daily balances from the last {profile.buffer_months_used} {profile.buffer_months_used === 1 ? 'month' : 'months'} in the data.</p>
          </Card>
          <Card title={<><Landmark size={19} aria-hidden="true" /> Typical monthly fixed costs</>} className="bank-balance">
            <strong className="bank-money">{fmt.money(profile.typical_fixed_costs, 2)}</strong>
            <p>Recorded bills, insurance, and loan payments are already part of money out.</p>
            <dl className="bank-cost-breakdown">
              <div><dt>Typical household bills</dt><dd>{fmt.money(profile.household_bills, 2)}</dd></div>
              {profile.active_loan_payment > 0 && (
                <div><dt>Active loan payment</dt><dd>{fmt.money(profile.active_loan_payment, 2)}</dd></div>
              )}
            </dl>
            {profile.active_loan_payment > 0 && <p>Active loan payment uses the recorded amount at the end of 2025.</p>}
          </Card>
        </div>
      </div>

      <section className="card brand-section" aria-labelledby="ov-like-title">
        <div className="card-head"><h2 id="ov-like-title">You, and people like you</h2><Link to="/profile">Open your profile <ArrowRight size={14} aria-hidden="true" /></Link></div>
        {persona ? (
          <>
            <div className="ov-like">
              <div className="pf-traits">
                <h3 className="ov-sub">How you are unique</h3>
                {[...persona.traits].sort((a, b) => Math.abs((b.percentile ?? 50) - 50) - Math.abs((a.percentile ?? 50) - 50)).slice(0, 3).map((t) => <TraitTrack key={t.label} t={t} />)}
              </div>
              <div>
                <h3 className="ov-sub">How you are like others</h3>
                <LikeOthers like={persona.like_others} />
              </div>
            </div>
            <p className="ov-teaser"><JuiceDrop /> <b>Pulp’s read:</b> {persona.display_name}, {persona.age != null ? `${persona.age}, ` : ''}{persona.occupation.label.toLowerCase()}. <Link to="/profile">Read the full fictional profile</Link></p>
          </>
        ) : <SqueezeLoader label="Squeezing your records for what makes you unusual…" />}
      </section>

      <aside className="bank-next">
        <Tangerine className="bank-next-mascot" />
        <div>
          <h2>Start with a change you might face</h2>
          <p>Explore what a drop in income or an unexpected bill could change, then make a goal plan and a backup plan.</p>
        </div>
        <div className="bank-next-actions">
          <button type="button" className="bank-button" onClick={() => openPulp('__intro__')}><MessageCircle size={16} aria-hidden="true" /> Talk it through with Pulp</button>
          <Link to="/twin">See account details <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </aside>
      <ResilienceEntry researchOnly />
    </div>
  )
}

/** A slim strip of what Pulp distilled from the records, with the press mark: records in, a drop of insight out. */
function Squeezed({ persona, loading }: { persona: LifePersona | null; loading: boolean }) {
  const chips: { k: string; v: string }[] = []
  if (persona) {
    const odd = [...persona.traits].filter((t) => t.percentile != null)
      .sort((a, b) => Math.abs((b.percentile ?? 50) - 50) - Math.abs((a.percentile ?? 50) - 50)).slice(0, 2)
    for (const t of odd) {
      const p = t.percentile ?? 50
      chips.push({ k: t.label, v: `${t.value} · ${p >= 50 ? 'higher' : 'lower'} than ${Math.round(p >= 50 ? p : 100 - p)}% of accounts` })
    }
    chips.push({ k: 'Like', v: `${Math.round(persona.like_others.share * 100)}% of accounts: ${persona.like_others.archetype}` })
    if (persona.worries[0]) chips.push({ k: 'Watch', v: persona.worries[0].label })
  }
  return (
    <section className="squeezed brand-squeeze" aria-label="What Pulp squeezed from your records">
      <div className="squeezed-head"><PressIcon size={30} className={loading ? 'pressing' : ''} /><strong>What Pulp squeezed from your records</strong></div>
      {loading ? <span className="small muted">Squeezing your records…</span> : (
        <ul className="squeezed-chips">{chips.map((c) => <li key={c.k + c.v}><b>{c.k}</b> {c.v}</li>)}</ul>
      )}
      <span className="squeezed-links"><Link to="/insights">Insights</Link><Link to="/profile">Profile</Link></span>
    </section>
  )
}

/** The month as a picture, with what-if sliders: money in, spending and household bills move the cup live. */
function PictureWhatIf({ profile }: { profile: Profile }) {
  const [di, setDi] = useState(0)
  const [ds, setDs] = useState(0)
  const [db, setDb] = useState(0)
  const I = profile.typical_inflow * (1 + di)
  const S = profile.typical_spending * (1 + ds) + profile.household_bills * db
  const B = profile.buffer
  const gap = S - I
  const runway = B <= 0 ? 0 : gap <= 0 ? null : Math.min(120, B / gap)
  const changed = di !== 0 || ds !== 0 || db !== 0
  const left = I - S
  const left0 = profile.typical_surplus
  const sliders: [string, number, (v: number) => void, number, number, string | undefined][] = [
    ['Money in', di, setDi, -50, 30, undefined],
    ['Spending', ds, setDs, -30, 30, undefined],
    ['Household bills', db, setDb, -20, 50, profile.household_bills > 0 ? undefined : 'No labelled bills in the records, so this cannot move spending.'],
  ]
  return (
    <>
      <ThreadFigure beat={{ id: `picture-${profile.account_id}`, visual: 'picture', caption: '', duration_s: 0, params: {
        inflow: I, outflow: S, buffer: B, months_of_spending: S > 0 ? B / S : 0,
        runway_label: runway == null ? 'no shortfall (120+)' : runway.toFixed(1) } }} />
      <fieldset className="whatif">
        <legend>What if</legend>
        {sliders.map(([label, v, set, min, max, note]) => (
          <label key={label} className="lp-slider">
            <span className="lp-slider-head"><b>{label}</b><output>{v > 0 ? '+' : ''}{Math.round(v * 100)}%</output></span>
            <input type="range" min={min} max={max} step={5} value={Math.round(v * 100)} onChange={(e) => set(Number(e.target.value) / 100)} />
            {note && <small>{note}</small>}
          </label>
        ))}
        <p className="whatif-result" role="status">
          {left >= 0 ? `${fmt.money(left)} left over a month` : `${fmt.money(-left)} short a month`}
          {changed && <> · actual {left0 >= 0 ? `${fmt.money(left0)} left over` : `${fmt.money(-left0)} short`} ({left - left0 >= 0 ? '+' : '−'}{fmt.money(Math.abs(left - left0))})</>}
          {' '}· {(S > 0 ? B / S : 0).toFixed(1)} months of spending in the cup · runway {runway == null ? 'no shortfall' : `${runway.toFixed(1)} months`}
        </p>
        {changed && <button type="button" className="lp-btn ghost" onClick={() => { setDi(0); setDs(0); setDb(0) }}>Reset</button>}
      </fieldset>
    </>
  )
}
