import { useState, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MoreLinks } from '../components/workspace'
import DemoAccountPicker from '../components/DemoAccountPicker'
import LifePlansView from '../components/plans/LifePlansView'
import PlanHistory from '../components/plans/PlanHistory'
import { useLifePlans, usePlanHistory } from '../components/plans/usePlanData'
import { SqueezeLoader } from '../components/PulpMascot'
import '../components/twist-deck.css'
import '../components/clarity.css'
import { Card, ErrorBox, fmt } from '../components/ui'
import PageAnswer, { Num } from '../components/PageAnswer'
import { dollars } from '../components/plans/palette'
import { Detail, ShowFullDetail } from '../components/Detail'
import { matchesShockInputs, type LifePlanResult } from '../services/api'
import { PRESETS, useApp } from '../stores/useApp'

type Tab = 'long' | 'shock'

export default function Plan() {
  const { accountId, profile, shock, shockInputs, shockHasHappened, shockLoading, shockError } = useApp()
  const ready = !shockLoading && matchesShockInputs(shock, accountId, shockInputs)
  const [tab, setTab] = useState<Tab | null>(null)
  const active: Tab = tab ?? (ready ? 'shock' : 'long')
  const longTerm = useLifePlans(accountId, { mode: 'long_term', trigger: 'Opened My Plan' }, !!profile && active === 'long')
  const shockPlans = useLifePlans(accountId, { mode: 'shock', inputs: shockInputs, happened: shockHasHappened, label: (shock?.applied_inputs.preset && PRESETS[shock.applied_inputs.preset]?.label) || 'This shock', trigger: 'Opened My Plan' }, !!profile && ready && active === 'shock')
  const history = usePlanHistory(profile ? accountId : null, `${longTerm.result?.recommended ?? ''}|${shockPlans.result?.recommended ?? ''}`)
  // The plan the answer sentence names: the recommended one from whichever plan is showing.
  const shown = active === 'long' ? longTerm.result : ready && shock ? shockPlans.result : null
  const answerPlan = shown ? { result: shown, longTerm: active === 'long' } : null
  if (!profile) return <DemoAccountPicker />

  return (
    <div className="stack plan-page">
      {/* Busy only while something is being worked out; "no shock yet" is muted but not loading. */}
      <PageAnswer pending={!answerPlan} busy={!answerPlan && (active === 'long' || (ready && !!shock) || shockLoading)}>{answerPlan
        ? planAnswer(answerPlan.result, answerPlan.longTerm)
        : active === 'long' ? 'Working out the best plan for the next five years…'
        : ready && shock ? 'Working out the best plan for this shock…'
        : shockLoading ? 'Working out your shock first…'
        : 'There is no shock to plan for yet.'}</PageAnswer>
      <p className="page-lead">
        {active === 'long'
          ? <>Here is what PULP would do over the next five years with no shock.{!(ready && shock) && <> <Link to="/shock">Set up a shock</Link> to plan for one.</>}</>
          : ready && shock
            ? <>For the shock you set up: <b className="plan-lead-num">{shock.applied_inputs.horizon_months} {shock.applied_inputs.horizon_months === 1 ? 'month' : 'months'}</b> with <b className="plan-lead-num">{fmt.money(shock.shocked.income_after)}</b> coming in and <b className="plan-lead-num">{fmt.money(shock.shocked.spending_after)}</b> going out each month{shock.applied_inputs.one_off_cost ? <>, plus <b className="plan-lead-num">{fmt.money(shock.applied_inputs.one_off_cost)}</b> up front</> : null}.{shockHasHappened && <> You marked this shock as already happened, so the plans start from this month.</>}{shockPlans.result && <> {planSpan(shockPlans.result, shockHasHappened)}</>}</>
            : <>Plans for a shock start from the one you set up on Shocks.</>}
      </p>

      {/* The plan switch and, on the shock tab once a shock is set up, the way back to it on Shocks: its numbers, or a
          change to it, in one link style. They sit next to the switch rather than across the page. */}
      <div className="plan-head-row">
        <div className="plan-tabs" role="tablist" aria-label="Which plan">
          <button type="button" role="tab" aria-selected={active === 'long'} className={active === 'long' ? 'on' : ''} onClick={() => setTab('long')}>Long term</button>
          <button type="button" role="tab" aria-selected={active === 'shock'} className={active === 'shock' ? 'on' : ''} onClick={() => setTab('shock')}>If a shock hits</button>
        </div>
        {/* Quieter than the context line above: small, muted, with the arrow. "Change shock" comes first and reads
            "Change" on a phone, so both links fit on one line there; its name stays "Change shock". */}
        {active === 'shock' && ready && shock && (
          <div className="link-row link-row-go plan-links">
            <Link to="/shock" aria-label="Change shock">Change<span className="plan-link-more"> shock</span><ArrowRight size={13} aria-hidden="true" /></Link>
            <Link to="/shock#resilience-plans">See the numbers behind this shock<ArrowRight size={13} aria-hidden="true" /></Link>
          </div>
        )}
      </div>

      {active === 'long' && (
        <Card title="Plans for the next five years" className="plan-card">
          {longTerm.result ? <LifePlansView key={`lt-${longTerm.result.account_id}`} result={longTerm.result} /> : <SqueezeLoader label="Squeezing five years of options from your records…" />}
        </Card>
      )}

      {active === 'shock' && (ready && shock ? (
        <Card title="Plans for this shock" className="plan-card">
          {shockPlans.result ? <LifePlansView key={`s-${JSON.stringify(shockPlans.result.shock)}`} result={shockPlans.result} /> : <SqueezeLoader label="Squeezing plans out of your records…" />}
        </Card>
      ) : (
        <Card title="Plan for a shock">
          <p>{shockLoading ? 'Calculating your plan…' : 'Set up a shock to see what it does to your cash, then come back here for the plans to get through it.'}</p>
          <ErrorBox msg={shockError} />
          {!shockLoading && <p className="plan-empty-action"><Link className="bank-button bank-button-primary" to="/shock">Set up a shock</Link></p>}
        </Card>
      ))}

      <MoreLinks links={[
        { to: '/roadmap', text: 'Next steps: this week, month and year' },
        { to: '/goals', text: 'Compare ways to reach a goal' },
      ]} />

      <Detail><details className="disclose">
        <summary>How your plans changed over time</summary>
        <p className="scenario-intro">Every time the planners run, after a twist card, a shock you mention to Pulp or a change to your goals, the four finalists are kept here.</p>
        <PlanHistory history={history.history} preview={!history.live && history.history != null} />
      </details></Detail>
      <ShowFullDetail what="My Plan" />
    </div>
  )
}

/** The answer to "What should I do?": the plan the planners recommend, said as a verdict ("The best plan is ..."), then
 *  where it leaves you, in whole dollars from the plan's own month-by-month outcome. With three or more steps only the
 *  first is named ("Start with ... and two more steps below"), so the sentence stays short; the card below lists them all. */
function planAnswer(result: LifePlanResult, longTerm: boolean): ReactNode {
  const plan = result.plans.find((p) => p.id === result.recommended) ?? result.plans.find((p) => p.role === 'best_tradeoff') ?? result.plans[0] ?? result.baseline
  const titles = plan.steps.length ? plan.steps.map((s) => s.title) : plan.name.split(/\s+\+\s+/)
  const steps = titles.map(stepPhrase).filter(Boolean)
  const many = steps.length >= 3
  const verdict = steps.length === 0 ? <>The best plan is to carry on as you are</>
    : many ? <>Start with {steps[0]} and {count(steps.length - 1)} more steps</>
    : <>The best plan{longTerm ? ' for the next five years' : ''} is {steps.join(' and ')}</>
  // After a short verdict a new sentence; after "Start with ..." a colon, so the whole answer stays about two lines.
  // The outcome is the plan's, not the account's as it stands (Shocks may just have said the cash runs out), so on the
  // shock tab it is tied to the steps: "with them, no month runs short".
  const then = (rest: string, more: ReactNode) => <>{verdict}{many ? ' below; ' : '. '}{many ? rest : rest[0].toUpperCase() + rest.slice(1)}{more}.</>
  const withSteps = steps.length === 0 ? '' : steps.length === 1 ? 'with it, ' : 'with them, '
  const end = plan.outcome.end_cash
  const cash = <Num>{dollars(Math.abs(end))}</Num>
  if (plan.survives === false && plan.first_short_month) {
    return <>{verdict}, but money still runs short in month <Num>{plan.first_short_month}</Num>.</>
  }
  if (longTerm) {
    const years = Math.round(result.horizon_months / 12)
    const goals = plan.outcome.goals.length ? <>, with your goals <Num>{Math.round(plan.components.goals * 100)}%</Num> of the way there</> : null
    return then(`${withSteps}after ${years} ${years === 1 ? 'year' : 'years'} you would `, <>{end < 0 ? <>be {cash} short</> : <>have {cash} in the account</>}{goals}</>)
  }
  // "No month runs short" only when the plan's own outcome says so; a plan without a verdict (a baseline) is checked
  // against its lowest month instead.
  const clear = plan.survives === true || (plan.survives == null && plan.outcome.min_cash >= 0)
  const where = <>{end < 0 ? <>be {cash} short</> : <>have {cash}</>} by month <Num>{result.horizon_months}</Num></>
  return then(`${withSteps}${clear ? 'no month runs short and you would ' : 'some months still run short and you would '}`, where)
}

/** Why the answer says "by month 18" for a 6-month shock: the plans cover the run-up and the recovery too. */
function planSpan(result: LifePlanResult, happened: boolean): string {
  const starts = result.shock_starts_in ?? 0
  const from = happened ? 'from this month' : starts > 0 ? `from ${starts} ${starts === 1 ? 'month' : 'months'} before the shock` : 'from the start of the shock'
  return `Each plan runs ${result.horizon_months} months, ${from} through the recovery after it.`
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const count = (n: number) => NUMBER_WORDS[n] ?? String(n)

/** First words of the step titles that are things to do ("Take in a lodger"), as they read after "The best plan is"
 *  ("taking in a lodger"). Goal labels ("top up retirement savings") use the same list. */
const GERUNDS: Record<string, string> = {
  ask: 'asking', boost: 'boosting', build: 'building', buy: 'buying', clear: 'clearing', cut: 'cutting', downsize: 'downsizing',
  fix: 'fixing', get: 'getting', go: 'going', grow: 'growing', invest: 'investing', keep: 'keeping', live: 'living',
  make: 'making', move: 'moving', pause: 'pausing', pay: 'paying', plan: 'planning', put: 'putting', raise: 'raising',
  reach: 'reaching', refinance: 'refinancing', renovate: 'renovating', repair: 'repairing', replace: 'replacing', save: 'saving',
  sell: 'selling', set: 'setting', shop: 'shopping', start: 'starting', take: 'taking', top: 'topping', travel: 'travelling',
  trim: 'trimming', work: 'working',
}
/** Step titles that name a thing ("Weekend job for a year") and need an article in a sentence. */
const ARTICLES: [RegExp, string][] = [[/^weekend job\b/, 'a'], [/^emergency fund\b/, 'an']]
const MONTHS = /^(January|February|March|April|May|June|July|August|September|October|November|December)\b/

/** A gerund for a phrase that starts with a verb ("top up savings" -> "topping up savings"), or null. */
function gerund(phrase: string): string | null {
  const [first, ...rest] = phrase.split(' ')
  const ing = GERUNDS[first.toLowerCase()]
  return ing ? [ing, ...rest].join(' ') : null
}

/** One plan step title as a phrase that reads inside a sentence: "Take in a roommate or lodger" -> "taking in a roommate
 *  or lodger", "Weekend job for a year" -> "a weekend job for a year", "Delay top up retirement savings by 6 months" ->
 *  "a 6-month pause on topping up retirement savings". Only a plain capital is lowered, so names and acronyms keep theirs. */
function stepPhrase(title: string): string {
  const t = title.trim()
  if (!t) return ''
  const delay = /^Delay (.+) by (\d+) months?$/i.exec(t)
  if (delay) {
    const goal = delay[1].trim()
    return `a ${delay[2]}-month pause on ${gerund(goal) ?? `“${goal}”`}`
  }
  if (/^Your partner adds\b/.test(t)) return t.replace(/^Your partner adds/, 'your partner adding')
  const lowered = /^[A-Z][a-z]/.test(t) && !MONTHS.test(t) ? t[0].toLowerCase() + t.slice(1) : t
  const asVerb = gerund(lowered)
  if (asVerb) return asVerb
  const article = ARTICLES.find(([re]) => re.test(lowered))
  return article ? `${article[1]} ${lowered}` : lowered
}
