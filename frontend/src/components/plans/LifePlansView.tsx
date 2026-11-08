/* Life plans after a shock (or for the long term): where you stand, how the agents searched, the four finalists by
   role, the plans that fall short, the trade-off, the steps over time with the agents' reasoning, and cash month by
   month. Compact mode (the 460px Pulp panel) shows the best balance only. Props stay { result, compact }. */
import { Detail } from '../Detail'
import ExplainButton from '../ExplainButton'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LifePlan, LifePlanResult } from '../../services/api'
import { useApp } from '../../stores/useApp'
import { JuiceDrop, Tangerine } from '../PulpMascot'
import CashMonthChart from './CashMonthChart'
import { isMock } from './fixtures'
import { CategoryLegend, ROLE, dollars, pct, roleOf } from './palette'
import { FallsShort, FinalistCards, WeightSliders, statedWeights, type UserWeights } from './PlanCards'
import PlanSearchView from './PlanSearchView'
import PlanTimeline from './PlanTimeline'
import StandingPanel from './StandingPanel'
import StepList, { outcomeLine } from './StepList'
import TradeoffChart, { TradeoffLegend } from './TradeoffChart'
import './plans.css'

/** variant 'summary' (the Shocks page): only what to do first, with a link to the full view in My Plan. */
export default function LifePlansView({ result, compact = false, variant = 'full' }: { result: LifePlanResult; compact?: boolean; variant?: 'full' | 'summary' }) {
  const longTerm = result.plan_mode === 'long_term'
  const finalists = result.plans
  const cautionary = result.cautionary ?? []
  const all: LifePlan[] = [...finalists, ...cautionary, result.baseline]
  const recommended = finalists.find((p) => p.id === result.recommended) ?? finalists.find((p) => p.role === 'best_tradeoff') ?? finalists[0] ?? result.baseline
  const [selectedId, setSelectedId] = useState(recommended.id)
  const selected = all.find((p) => p.id === selectedId) ?? recommended
  const stated = statedWeights(result)
  const [weights, setWeights] = useState<UserWeights>(stated)
  const custom = weights.shortfall !== stated.shortfall || weights.resilience !== stated.resilience || weights.goals !== stated.goals
  const wDis = result.objective.weights.disruption
  // Re-rank every feasible candidate (and the finalists) with the person's own weights.
  const userBest = useMemo(() => {
    if (!custom) return null
    const sum = (longTerm ? 0 : weights.shortfall) + weights.resilience + weights.goals || 1
    const k = (1 - wDis) / sum
    const score = (c: { shortfall?: number; resilience: number; goals: number; disruption: number }) =>
      k * ((longTerm ? 0 : weights.shortfall * (c.shortfall ?? 1)) + weights.resilience * c.resilience + weights.goals * c.goals) - wDis * c.disruption
    const pool = [
      ...finalists.map((p) => ({ id: p.id, name: p.name, s: score(p.components), finalist: true, c: p.components })),
      ...(result.search?.candidates ?? []).filter((c) => c.status !== 'screened' && !finalists.some((p) => p.id === c.id)).map((c) => ({ id: c.id, name: c.name, s: score(c), finalist: false, c: { resilience: c.resilience, goals: c.goals, disruption: c.disruption, shortfall: c.shortfall } })),
    ].sort((a, b) => b.s - a.s)
    return pool[0] ?? null
  }, [custom, weights, wDis, longTerm, finalists, result.search])
  const horizon = result.horizon_months
  const shock = longTerm ? null : { start: result.shock_starts_in ?? 1, duration: result.shock.duration }
  const preview = isMock(result)
  const S = useApp((st) => (st.profile?.account_id === result.account_id ? st.profile.typical_spending : undefined))

  if (compact) {
    return (
      <section className="lp lp-compact" aria-label="Plans">
        <header className="lp-compact-head">
          <span className="lp-role" style={{ ['--role' as string]: ROLE[roleOf(recommended.role)].color }}>{recommended.role_label ?? ROLE[roleOf(recommended.role)].label}</span>
          {preview && <span className="lp-preview" title="The planner endpoint is not answering yet; these are illustrative numbers.">preview</span>}
          <h3>{recommended.name}</h3>
        </header>
        <StandingPanel plan={recommended} baseline={result.baseline} shockMonths={result.shock.duration} longTerm={longTerm} compact />
        <PlanTimeline plan={recommended} horizon={horizon} shock={shock} longTerm={longTerm} compact />
        <p className="lp-compact-scores">
          Score <b>{Math.round(recommended.score * 100)}</b>
          {!longTerm && recommended.components.shortfall != null && <> · gap covered {pct(recommended.components.shortfall)}</>}
          {' '}· cushion {pct(recommended.components.resilience)} · goals {pct(recommended.components.goals)} · one of {result.search?.generated ?? finalists.length} plans tried
        </p>
        <details className="lp-compact-weights">
          <summary>What matters most to you</summary>
          <WeightSliders value={weights} onChange={setWeights} stated={stated} longTerm={longTerm} onReset={() => setWeights(stated)} />
          {userBest && <p className="small">With your weights: <b>{userBest.name}</b>.</p>}
        </details>
        <Link className="lp-open" to="/plan">Open in My Plan</Link>
      </section>
    )
  }

  if (variant === 'summary') {
    return (
      <section className="lp lp-summary" aria-label="What to do first">
        <p className="lp-lead"><b>{recommended.role_label ?? 'Best balance'}:</b> {recommended.name}. {outcomeLine(recommended, horizon, longTerm)}</p>
        <StepList plan={recommended} horizon={horizon} longTerm={longTerm} />
        <p className="lp-summary-foot">
          Chosen from {result.search?.generated ?? finalists.length} plans the agents tried for this shock.{' '}
          <Link to="/plan">See all four plans and how they were chosen in My Plan</Link>
        </p>
      </section>
    )
  }

  return (
    <section className="lp" aria-label={longTerm ? 'Long-term plans' : 'Life plans'}>
      <p className="lp-context">
        {longTerm ? <>Five-year plans with no shock, over {Math.round(horizon / 12)} years.</> : <>For this shock: income at {pct(result.shock.r)}{result.shock.h ? `, bills ${result.shock.h > 0 ? '+' : ''}${pct(result.shock.h)}` : ''}{result.shock.one_off ? `, ${dollars(result.shock.one_off)} once` : ''} for {result.shock.duration} months, starting in month {shock?.start}.</>}
        {' '}{result.search ? `${result.search.generated} plans tried, four kept.` : ''}
        {preview && <span className="lp-preview" title="The planner endpoint is not answering yet; these are illustrative numbers from the same formulas.">preview data</span>}
      </p>

      <div className="lp-block lp-first">
        <div className="section-head"><h3>{selected.id === recommended.id ? 'What to do first' : <>Steps for <span className="lp-sub">“{selected.name}”</span></>}</h3><ExplainButton topic="plan" label="what to do first" /></div>
        <p className="lp-lead">{selected.role_label ? <b>{selected.role_label}: </b> : null}{outcomeLine(selected, horizon, longTerm)}</p>
        <StepList plan={selected} horizon={horizon} longTerm={longTerm} />
        {(selected.versus || selected.why) && <p className="lp-read"><JuiceDrop /> <b>Pulp’s read</b> {selected.versus ?? selected.why}</p>}
        {selected.id !== recommended.id && <button type="button" className="lp-btn ghost" onClick={() => setSelectedId(recommended.id)}>Back to the recommended plan</button>}
      </div>

      <Detail>
      <div className="lp-block">
        <div className="section-head"><h3>Four ways to do it <span className="lp-sub">each best at something different; pick one to see its steps</span></h3><ExplainButton topic="finalists" label="the four plans" /></div>
        <div className="lp-final-wrap">
          <FinalistCards plans={finalists} selectedId={selectedId} onSelect={setSelectedId} userBestId={userBest?.finalist ? userBest.id : null} longTerm={longTerm} />
          <details className="lp-weights-wrap lp-weights-details">
            <summary>Change what matters most to you</summary>
            <WeightSliders value={weights} onChange={setWeights} stated={stated} longTerm={longTerm} onReset={() => setWeights(stated)} />
            <p className="small muted lp-weights-note" role="status">
              {userBest
                ? userBest.finalist ? <>With your weights, <b>{userBest.name}</b> comes out on top.</> : <>With your weights, <b>{userBest.name}</b> would come out on top. It is not one of the four, so its month-by-month plan is not drawn.</>
                : <>Move a slider to re-rank all {result.search?.feasible ?? finalists.length} feasible plans with your own priorities. The agents’ own choice uses the stated weights.</>}
            </p>
          </details>
        </div>
      </div>

      <div className="lp-block">
        <h3>Where you stand <span className="lp-sub">with “{selected.name}”</span></h3>
        <StandingPanel plan={selected} baseline={result.baseline} shockMonths={result.shock.duration} longTerm={longTerm} sMonthly={S} />
      </div>

      {!longTerm && (
        <details className="lp-block lp-more">
          <summary>Plans that fall short{cautionary.length ? ` (${cautionary.length})` : ''}</summary>
          <p className="lp-lede">Plausible plans the agents tried that still run out of money, for comparison.</p>
          <FallsShort plans={cautionary} onSelect={setSelectedId} selectedId={selectedId} />
        </details>
      )}

      <details className="lp-block lp-more">
        <summary>How the agents chose this, in detail</summary>
        <div className="lp-more-body">
          <div className="explain-row"><ExplainButton topic="plan_search" label="how the plans were chosen" /></div>
      {result.search && (
        <div className="lp-block">
          <h3>How the agents chose these four</h3>
          <PlanSearchView search={result.search} plans={finalists} />
        </div>
      )}

      <div className="lp-block">
        <h3>The trade-off</h3>
        <p className="lp-lede">Each dot is a plan. Right is safer, up is closer to your goals. The dashed line is the best you can do on one without giving up the other.</p>
        <div className={`lp-scatters ${longTerm ? 'single' : ''}`}>
          <TradeoffChart result={result} selectedId={selected.id} highlightId={userBest?.id ?? null} onSelect={setSelectedId} />
          {!longTerm && (
            <div className="lp-scatter-side">
              <h4>Gap covered against goals</h4>
              <TradeoffChart result={result} selectedId={selected.id} highlightId={userBest?.id ?? null} onSelect={setSelectedId} xKey="shortfall" small />
            </div>
          )}
        </div>
        <TradeoffLegend longTerm={longTerm} />
        <details className="lp-table">
          <summary>Show the plans as a table</summary>
          <table>
            <caption className="sr-only">Plans and their scores</caption>
            <thead><tr><th>Plan</th><th>Role</th>{!longTerm && <th>Gap covered</th>}<th>Cushion</th><th>Goals</th><th>Disruption</th><th>Score</th><th>Lowest cash</th></tr></thead>
            <tbody>
              {all.map((p) => (
                <tr key={p.id} className={p.id === selected.id ? 'on' : ''}>
                  <td>{p.name}</td><td>{p.role_label ?? (p.id === result.baseline.id ? 'Today’s course' : ROLE[roleOf(p.role)].label)}</td>
                  {!longTerm && <td>{pct(p.components.shortfall ?? 1)}</td>}<td>{pct(p.components.resilience)}</td><td>{pct(p.components.goals)}</td><td>{pct(p.components.disruption)}</td><td>{Math.round(p.score * 100)}</td><td>{dollars(p.outcome.min_cash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="lp-block">
        <h3>How you get there <span className="lp-sub">“{selected.name}”</span></h3>
        <PlanTimeline plan={selected} horizon={horizon} shock={shock} longTerm={longTerm} />
        <CategoryLegend used={selected.steps.map((s) => s.category)} />
      </div>

      <div className="lp-block">
        <h3>Cash, month by month</h3>
        <CashMonthChart plan={selected} baseline={result.baseline} cautionary={selected.role === 'falls_short' ? [] : cautionary} horizon={horizon} shock={shock} longTerm={longTerm} />
      </div>

      <div className="lp-block lp-objective">
        <h3>What the agents optimise</h3>
        <ul className="lp-axes">
          {!longTerm && <li><b>Covering the gap</b> <span>{pct(stated.shortfall)}</span> share of the shock’s shortfall the plan pays for</li>}
          <li><b>Cushion</b> <span>{pct(stated.resilience)}</span> months of the shock covered and cash left after it</li>
          <li><b>Goals</b> <span>{pct(stated.goals)}</span> each goal’s progress by its date, weighted by importance and urgency</li>
          <li><b>Disruption</b> <span>−{pct(wDis)}</span> how much the plan asks you to change, subtracted</li>
        </ul>
        <code className="lp-formula">{result.objective.formula}</code>
        {result.objective.goal_weights.length > 0 && (
          <p className="small muted">Goal weights: {result.objective.goal_weights.map((g) => `${g.label} ${pct(g.weight)}`).join(' · ')}. Weight = importance × urgency (short 1.0, medium 0.75, long 0.5), normalised.</p>
        )}
      </div>
        </div>
      </details>
      </Detail>
    </section>
  )
}

/** A small mood mark for verdicts elsewhere (used by the Shocks verdict). */
export function VerdictMark({ ok, size = 48 }: { ok: boolean; size?: number }) {
  return <span className="lp-verdict-mark" style={{ width: size, height: size }} aria-hidden="true"><Tangerine mood={ok ? 'celebrate' : 'concerned'} label="" /></span>
}
