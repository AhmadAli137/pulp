/* Preview of the Life Planner's plan search (docs/agents/v2-contracts.md, "Plan search and the four finalists" and
   "Long-term plans and plan history"). Used only while POST /api/agent/life-plans and GET /api/plans/history are not
   answering. Generate decision combinations with timing variants, simulate each month by month, screen infeasible
   ones per rule, keep the Pareto set, then pick four distinct finalists by role. */
import type { LifePlan, LifePlanResult, PersonaGoal, SearchCandidate, PlanHistoryEntry, PlanRole, PlanStep, Profile, StepReason } from '../../services/api'
import { basis, mark, mockGoals, r50, type Basis } from './fixtures'

export interface PlanRequest { mode: 'shock' | 'long_term'; r: number; h: number; oneOff: number; duration: number; startsIn: number; horizon?: number; label?: string; trigger?: string }
interface StepSpec extends PlanStep { disruption: number; pauseGoals?: boolean; invest?: boolean; delayGoal?: string }
type Timing = 'now' | 'later' | 'after'
interface Ctx { b: Basis; start: number; end: number; horizon: number; goals: PersonaGoal[]; longTerm: boolean }
interface Decision { key: string; label: string; timings: Timing[]; steps: (c: Ctx) => StepSpec[]; reason: (c: Ctx) => Omit<StepReason, 'step'> }

export type FullPlan = LifePlan
export type FullResult = LifePlanResult

export type Weights = { shortfall: number; resilience: number; goals: number; disruption: number }
/** The weighted score behind "Best balance"; the page uses the same formula to re-rank with the weight sliders. */
export const weightedScore = (c: { shortfall: number; resilience: number; goals: number; disruption: number }, w: Weights) =>
  w.shortfall * c.shortfall + w.resilience * c.resilience + w.goals * c.goals - w.disruption * c.disruption

export const ROLE_LABEL: Record<PlanRole, string> = {
  best_shortfall: 'Covers the gap best', best_resilience: 'Strongest cushion', best_goals: 'Furthest toward your goals',
  best_tradeoff: 'Best balance', least_disruption: 'Easiest to live with', falls_short: 'Falls short',
}
const m0 = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString()}`

function simulate(b: Basis, q: PlanRequest, goals: PersonaGoal[], steps: StepSpec[], horizon: number) {
  const s0 = q.mode === 'shock' ? q.startsIn : Infinity, s1 = s0 + q.duration - 1
  const inShock = (m: number) => m >= s0 && m <= s1
  const active = (s: StepSpec, m: number) => m >= s.month_start && m <= s.month_end
  let cash = b.B + steps.filter((s) => s.month_start === 0).reduce((a, s) => a + s.one_off, 0)
  const cash_path = [cash]
  const pots: Record<string, number> = Object.fromEntries(goals.map((g) => [g.id, 0]))
  const goal_paths: Record<string, number[]> = Object.fromEntries(goals.map((g) => [g.id, [0]]))
  for (let m = 1; m <= horizon; m++) {
    let net = (inShock(m) ? q.r * b.I : b.I) - (inShock(m) ? b.S + q.h * b.H : b.S)
    if (m === s0) net -= q.oneOff
    for (const s of steps) {
      if (active(s, m)) net += s.monthly_effect
      if (s.month_start === m) net += s.one_off
    }
    cash += net
    const paused = steps.some((s) => s.pauseGoals && active(s, m))
    const investing = steps.some((s) => s.invest && active(s, m))
    if (!paused && net > 0 && cash > 1.5 * b.S) {
      const alloc = net * 0.7
      cash -= alloc
      for (const g of goals) pots[g.id] += alloc * g.weight
    }
    for (const g of goals) {
      if (investing && g.horizon !== 'short') pots[g.id] *= 1.004
      goal_paths[g.id].push(pots[g.id])
    }
    cash_path.push(cash)
  }
  let months_covered = q.duration
  if (q.mode === 'shock') for (let m = s0; m <= Math.min(horizon, s1); m++) if (cash_path[m] < 0) { months_covered = m - s0; break }
  const min_cash = Math.min(...cash_path)
  const end_cash = cash_path[horizon]
  const goalsOut = goals.map((g) => {
    const deadline_month = g.target_months + (steps.some((s) => s.delayGoal === g.id) ? 12 : 0)
    const path = goal_paths[g.id]
    const saved = path[Math.min(horizon, deadline_month)]
    const reached = path.findIndex((v) => v >= g.target_amount)
    return { goal_id: g.id, label: g.label, target: g.target_amount, deadline_month, saved_at_deadline: saved, progress: Math.min(1, saved / Math.max(1, g.target_amount)), reached_month: reached >= 0 ? reached : null, weight: g.weight }
  })
  const covered = q.mode === 'shock' ? Math.min(1, months_covered / Math.max(1, q.duration)) : min_cash >= 0 ? 1 : 0.5
  const resilience = 0.6 * covered + 0.4 * Math.min(1, Math.max(0, end_cash) / (6 * b.S))
  const goal_score = goalsOut.reduce((a, g) => a + g.weight * g.progress, 0)
  const shortfall_total = Math.max(0, -min_cash)
  const denom = q.mode === 'shock' ? q.duration * Math.max(0, b.S + q.h * b.H - q.r * b.I) + q.oneOff : 0
  const shortfall = denom <= 0 ? (shortfall_total > 0 ? 0.5 : 1) : 1 - Math.min(1, shortfall_total / denom)
  return { outcome: { cash_path, goal_paths, min_cash, months_covered, shortfall_total, end_cash, goals: goalsOut, resilience, goal_score }, shortfall }
}

function catalog(b: Basis, goals: PersonaGoal[]): Decision[] {
  const side = r50(0.22 * b.I), job = r50(0.3 * b.I), c10 = r50(0.1 * b.S), c20 = r50(0.2 * b.S)
  const refi = r50(Math.max(0.35 * b.P, 0.03 * b.S)), moveSave = b.H > 0 ? r50(0.12 * b.S) : 0, room = r50(0.08 * b.S)
  const goal = (id: string) => goals.find((g) => g.id === id)
  const spendPct = Math.round((b.S / Math.max(1, b.I)) * 100)
  const st = (s: Partial<StepSpec> & Pick<StepSpec, 'decision' | 'title' | 'detail' | 'category' | 'month_start' | 'month_end'>): StepSpec => ({ monthly_effect: 0, one_off: 0, disruption: 0, ...s })
  return [
    { key: 'side_job', label: 'Weekend jobs', timings: ['now', 'later'],
      steps: (c) => [st({ decision: 'side_job', title: 'Take weekend jobs', detail: 'Two weekend jobs a month from existing contacts.', category: 'income', month_start: c.start, month_end: c.longTerm ? c.start + 11 : c.end + 2, monthly_effect: side, disruption: 0.25 })],
      reason: () => ({ because: 'Your income comes from jobs, so more jobs is the most direct lever', evidence: `${Math.round(b.cashShare * 100)}% of money in arrives as cash deposits`, moves: `+${m0(side)} a month: more of the gap covered, cushion protected` }) },
    { key: 'second_job', label: 'Part-time evening job', timings: ['now', 'later'],
      steps: (c) => [st({ decision: 'second_job', title: 'Part-time evening job', detail: 'About 12 hours a week at a supplier or hardware store.', category: 'income', month_start: c.start, month_end: c.longTerm ? c.start + 11 : c.end, monthly_effect: job, disruption: 0.3 })],
      reason: () => ({ because: 'A steady wage offsets lost income without relying on new clients', evidence: `Income swings about ${Math.round(b.cv * 100)}% month to month`, moves: `+${m0(job)} a month while it lasts` }) },
    { key: 'cut10', label: 'Pause gym, streaming and takeout', timings: ['now', 'later'],
      steps: (c) => [st({ decision: 'cut_spending', title: 'Pause gym, streaming and takeout', detail: 'About 10% of typical spending.', category: 'spending', month_start: c.start, month_end: c.longTerm ? c.horizon : c.end, monthly_effect: c10, disruption: 0.15 })],
      reason: () => ({ because: `Spending takes ${spendPct}% of income, so small cuts add up`, evidence: `Spending ratio higher than ${Math.round(b.pct?.spending_ratio ?? 59)}% of accounts`, moves: `+${m0(c10)} a month to the cushion` }) },
    { key: 'cut20', label: 'Cut a fifth of everyday spending', timings: ['now'],
      steps: (c) => [st({ decision: 'cut_spending', title: 'Cut a fifth of everyday spending', detail: 'Meal plan, no dining out, cheaper phone plan.', category: 'spending', month_start: c.start, month_end: c.longTerm ? c.start + 11 : c.end, monthly_effect: c20, disruption: 0.3 })],
      reason: () => ({ because: 'A deeper cut closes most of the gap without new income', evidence: `Typical spending ${m0(b.S)} a month`, moves: `+${m0(c20)} a month` }) },
    { key: 'cut30', label: 'Cut spending by 30%', timings: ['now'],
      steps: (c) => [st({ decision: 'cut_spending', title: 'Cut spending by 30%', detail: 'Everything non-essential stops.', category: 'spending', month_start: c.start, month_end: c.end, monthly_effect: r50(0.3 * b.S), disruption: 0.45 })],
      reason: () => ({ because: 'Closes the gap on paper', evidence: `Typical spending ${m0(b.S)} a month`, moves: 'Most of the gap' }) },
    { key: 'move', label: 'Move to a smaller flat', timings: ['later', 'after'],
      steps: (c) => [st({ decision: 'move', title: 'Move to a smaller flat', detail: 'Moving costs once, then lower rent every month.', category: 'housing', month_start: c.start, month_end: c.horizon, monthly_effect: moveSave, one_off: -r50(0.5 * b.S), disruption: 0.3 })],
      reason: () => ({ because: 'Housing is the largest fixed cost; a move pays back every month after the first', evidence: `Household bills ${m0(b.H)} a month`, moves: `−${m0(0.5 * b.S)} once, then +${m0(moveSave)} a month` }) },
    { key: 'rent_room', label: 'Rent out the spare room', timings: ['now', 'after'],
      steps: (c) => [st({ decision: 'rent_room', title: 'Rent out the spare room', detail: 'A lodger or a student let.', category: 'housing', month_start: c.start, month_end: c.horizon, monthly_effect: room, disruption: 0.2 })],
      reason: () => ({ because: 'A three-room flat can earn without anyone working longer', evidence: 'Home: three-room flat (persona)', moves: `+${m0(room)} a month for the rest of the plan` }) },
    { key: 'delay_van', label: 'Delay the van a year', timings: ['now'],
      steps: () => [st({ decision: 'delay_purchase', title: 'Delay the van by 12 months', detail: 'Keep repairing the current one for another year.', category: 'timing', month_start: 0, month_end: 0, delayGoal: 'g-van', disruption: 0.05 })],
      reason: () => ({ because: 'The van is the goal most at risk', evidence: `Van: ${m0(goal('g-van')?.target_amount ?? 0)} by month ${goal('g-van')?.target_months ?? 18}, importance ${goal('g-van')?.importance ?? 4}/5`, moves: 'Deadline +12 months; frees cash now' }) },
    { key: 'delay_trip', label: 'Push the trip back a year', timings: ['now'],
      steps: () => [st({ decision: 'delay_purchase', title: 'Push the trip back a year', detail: 'Book it for the following summer.', category: 'timing', month_start: 0, month_end: 0, delayGoal: 'g-trip', disruption: 0.03 })],
      reason: () => ({ because: 'You said the trip can wait a year if money is tight', evidence: 'Conversation: trip importance lowered to 2/5', moves: 'Trip deadline +12 months' }) },
    { key: 'delay_home', label: 'Delay the home a year', timings: ['now'],
      steps: () => [st({ decision: 'delay_purchase', title: 'Delay the home by 12 months', detail: 'Keep renting a year longer.', category: 'timing', month_start: 0, month_end: 0, delayGoal: 'g-home', disruption: 0.1 })],
      reason: () => ({ because: 'Gives the largest goal more time', evidence: `Home: ${goal('g-home')?.target_months ?? 36} months`, moves: 'Deadline +12 months' }) },
    { key: 'refinance', label: 'Move debt to a lower rate', timings: ['now'],
      steps: (c) => [st({ decision: 'refinance', title: 'Move the card balance to a lower-rate line', detail: 'Lower interest for the rest of the plan.', category: 'debt', month_start: 1, month_end: c.horizon, monthly_effect: refi, disruption: 0.05 })],
      reason: () => ({ because: 'Interest is money that buys nothing', evidence: b.P > 0 ? `Loan payment ${m0(b.P)} a month` : 'Bank fees and interest in the records', moves: `+${m0(refi)} a month for the whole plan` }) },
    { key: 'invest', label: 'Invest the home fund', timings: ['after'],
      steps: (c) => [st({ decision: 'invest', title: 'Invest the goal funds in a TFSA', detail: 'A balanced fund, about 5% a year assumed.', category: 'investing', month_start: c.longTerm ? 1 : c.end + 1, month_end: c.horizon, invest: true, disruption: 0.02 })],
      reason: () => ({ because: 'The home goal is years away, long enough for a balanced fund', evidence: `Down payment target ${m0(goal('g-home')?.target_amount ?? 0)} by month ${goal('g-home')?.target_months ?? 36}`, moves: 'Goals: about 5% a year on the longer funds' }) },
    { key: 'pause_goals', label: 'Pause goal transfers', timings: ['now'],
      steps: (c) => [st({ decision: 'pause_goals', title: 'Pause goal transfers', detail: 'Every spare dollar stays in the cushion first.', category: 'saving', month_start: 1, month_end: c.longTerm ? 6 : c.end, pauseGoals: true, disruption: 0.05 })],
      reason: () => ({ because: 'The cushion matters more than goal progress while income is down', evidence: `Cushion covers ${(b.B / Math.max(1, b.S)).toFixed(1)} months of spending`, moves: 'All spare cash stays in the cushion' }) },
  ]
}

const CONFLICTS = [['side_job', 'second_job'], ['cut10', 'cut20'], ['cut10', 'cut30'], ['cut20', 'cut30'], ['move', 'rent_room'], ['pause_goals', 'invest']]

export function mockPlanSearch(id: number, p: Profile | null, q: PlanRequest): FullResult {
  const b = basis(id, p)
  const goals = mockGoals(b)
  const longTerm = q.mode === 'long_term'
  const horizon = q.horizon ?? (longTerm ? 60 : Math.max(24, ...goals.map((g) => g.target_months)))
  const s0 = longTerm ? 1 : q.startsIn, end = longTerm ? horizon : s0 + q.duration - 1
  const w: Weights = longTerm ? { shortfall: 0, resilience: 0.4, goals: 0.5, disruption: 0.1 } : { shortfall: 0.3, resilience: 0.3, goals: 0.3, disruption: 0.1 }
  const roles: PlanRole[] = longTerm ? ['best_resilience', 'best_goals', 'least_disruption', 'best_tradeoff'] : ['best_shortfall', 'best_resilience', 'best_goals', 'best_tradeoff']
  const cat = catalog(b, goals)
  const startFor = (t: Timing) => (longTerm ? (t === 'now' ? 1 : t === 'later' ? 6 : 12) : t === 'now' ? 1 : t === 'later' ? s0 : end + 1)
  const ctx = (t: Timing): Ctx => ({ b, start: startFor(t), end, horizon, goals, longTerm })
  const options = cat.flatMap((d) => d.timings.map((t) => ({ d, t })))
  const combos: { d: Decision; t: Timing }[][] = options.map((o) => [o])
  for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) if (options[i].d !== options[j].d) combos.push([options[i], options[j]])
  let seed = (id % 9973) + (longTerm ? 11 : 3)
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  for (let k = 0; k < 44; k++) {
    const pick = [...options].sort(() => rnd() - 0.5).slice(0, 3)
    const sig = pick.map((o) => o.d.key + o.t).sort().join('|')
    if (new Set(pick.map((o) => o.d.key)).size === 3 && !combos.some((c) => c.length === 3 && c.map((o) => o.d.key + o.t).sort().join('|') === sig)) combos.push(pick)
  }
  const when = (t: Timing, d: Decision) => (d.timings.length < 2 ? '' : t === 'later' ? (longTerm ? ' (from month 6)' : ' (when it hits)') : t === 'after' ? (longTerm ? ' (from year 2)' : ' (after the shock)') : '')
  type Cand = SearchCandidate & { combo: { d: Decision; t: Timing }[]; steps: StepSpec[]; sim?: ReturnType<typeof simulate> }
  const screens = new Map<string, number>()
  const goalById = new Map(goals.map((g) => [g.id, g]))
  const cands: Cand[] = combos.map((combo, i) => {
    const keys = combo.map((o) => o.d.key)
    const steps = combo.flatMap((o) => o.d.steps(ctx(o.t)))
    const disruption = Math.min(1, steps.reduce((a, s) => a + s.disruption, 0))
    const name = combo.map((o, k) => (k === 0 ? o.d.label : o.d.label.charAt(0).toLowerCase() + o.d.label.slice(1)) + when(o.t, o.d)).join(' + ')
    const c: Cand = { id: `c${i + 1}`, name, decisions: keys, resilience: 0, goals: 0, shortfall: 0, disruption, score: 0, status: 'screened', round: 3, combo, steps }
    const late = steps.some((s) => s.delayGoal && (goalById.get(s.delayGoal)?.target_months ?? 0) + 12 > horizon)
    let rule = CONFLICTS.some(([a, z]) => keys.includes(a) && keys.includes(z)) ? 'Conflicting decisions'
      : keys.includes('cut30') ? 'Spending cut beyond 25% of S'
      : keys.includes('move') && b.H <= 0 ? 'A move with no housing bill'
      : late ? 'A goal delayed past its horizon'
      : disruption > 0.7 ? 'More upheaval than one household can take' : null
    c.sim = simulate(b, q, goals, steps, horizon)
    Object.assign(c, { resilience: c.sim.outcome.resilience, goals: c.sim.outcome.goal_score, shortfall: c.sim.shortfall })
    c.score = weightedScore(c, w)
    if (!rule && c.sim.outcome.min_cash < -0.25 * b.S) rule = 'Negative cash with no credit'
    if (rule) { c.reason = rule; screens.set(rule, (screens.get(rule) ?? 0) + 1) } else c.status = 'pareto'
    return c
  })
  const feasible = cands.filter((c) => c.status !== 'screened')
  for (const c of feasible) {
    c.round = 4
    const beaters = feasible.filter((o) => o !== c && o.shortfall >= c.shortfall && o.resilience >= c.resilience && o.goals >= c.goals
      && (o.shortfall > c.shortfall + 1e-9 || o.resilience > c.resilience + 1e-9 || o.goals > c.goals + 1e-9))
    if (beaters.length) { c.status = 'dominated'; c.reason = `beaten by ${beaters.sort((a, z) => z.score - a.score)[0].name}` }
  }
  const front = feasible.filter((c) => c.status === 'pareto')
  const axis: Record<PlanRole, (c: Cand) => number> = { falls_short: (c) => -c.score, best_shortfall: (c) => c.shortfall, best_resilience: (c) => c.resilience, best_goals: (c) => c.goals, best_tradeoff: (c) => c.score, least_disruption: (c) => -c.disruption + 0.001 * c.score }
  const jac = (a: string[], z: string[]) => { const A = new Set(a), Z = new Set(z); return [...A].filter((x) => Z.has(x)).length / (new Set([...A, ...Z]).size || 1) }
  const chosen: { role: PlanRole; c: Cand; runner?: Cand }[] = []
  // Best balance is chosen first so it really is the top weighted score; the others must differ from it.
  for (const role of ['best_tradeoff' as PlanRole, ...roles.filter((r) => r !== 'best_tradeoff')]) {
    const base = role === 'least_disruption' ? feasible.filter((c) => c.decisions.length > 0 && c.score > 0) : front.length >= 4 ? front : feasible
    const pool = base.filter((c) => !chosen.some((x) => x.c === c)).sort((a, z) => axis[role](z) - axis[role](a) || z.score - a.score)
    let k = pool.findIndex((c) => chosen.every((x) => jac(x.c.decisions, c.decisions) < 0.5))
    if (k < 0) k = 0
    const c = pool[k]
    if (!c) continue
    c.status = 'finalist'; c.round = 5
    chosen.push({ role, c, runner: pool.find((_, j) => j !== k) })
  }
  const word: Record<PlanRole, string> = { falls_short: 'falls short', best_shortfall: 'shortfall covered', best_resilience: 'resilience', best_goals: 'weighted goals', best_tradeoff: 'weighted score', least_disruption: 'least disruption' }
  const pc = (v: number) => `${Math.round(v * 100)}%`
  const val = (role: PlanRole, c: Cand) => (role === 'least_disruption' ? `${pc(c.disruption)} disruption` : `${pc(axis[role](c))} ${word[role]}`)
  const firstShort = (path: number[]) => { const k = path.findIndex((v) => v < 0); return k >= 0 ? k : null }
  const toPlan = (c: Cand, role?: PlanRole, runner?: Cand): FullPlan => {
    const sim = c.sim ?? simulate(b, q, goals, c.steps, horizon)
    const steps: PlanStep[] = c.steps.map(({ month_start, month_end, decision, title, detail, monthly_effect, one_off, category }) => ({ month_start, month_end, decision, title, detail, monthly_effect, one_off, category }))
    const reasoning: StepReason[] = c.combo.map((o, i) => ({ step: i + 1, ...o.d.reason(ctx(o.t)) }))
    const comps = { resilience: sim.outcome.resilience, goals: sim.outcome.goal_score, disruption: c.disruption, shortfall: sim.shortfall }
    return {
      id: c.id, name: c.name, summary: steps.map((s) => s.title).join(', then ') || 'No changes.',
      why: role ? `Best on ${word[role]} among ${feasible.length} feasible plans.` : 'The yardstick every plan is measured against.',
      steps, outcome: sim.outcome, score: weightedScore(comps, w), components: comps, pareto: c.status === 'finalist' || c.status === 'pareto',
      source: role ? 'search' : 'baseline',
      flags: c.decisions.some((d) => d === 'second_job' || d === 'side_job') ? [{ risk: 'Burnout', severity: 'medium', because: 'Extra work on top of long weeks for several months.' }] : [],
      role, role_label: role ? ROLE_LABEL[role] : undefined, reasoning,
      survives: sim.outcome.min_cash >= 0, first_short_month: firstShort(sim.outcome.cash_path),
      versus: role && runner ? `${val(role, c)} against ${val(role, runner)} for the runner-up, “${runner.name}”.` : undefined,
    }
  }
  const baseCand: Cand = { id: 'baseline', name: 'Carry on as you are', decisions: [], resilience: 0, goals: 0, shortfall: 0, disruption: 0, score: 0, status: 'dominated', round: 1, combo: [], steps: [] }
  const baseline = { ...toPlan(baseCand), summary: 'No changes. Goals keep their dates and the cushion absorbs what comes.' }
  const plans = roles.map((role) => chosen.find((x) => x.role === role)).filter((x): x is NonNullable<typeof x> => !!x).map((x) => toPlan(x.c, x.role, x.runner))
  // Plans that fall short, for comparison: plausible (low upheaval) candidates whose cash goes below zero.
  const failing = cands.filter((c) => c.sim && c.sim.outcome.min_cash < 0 && (c.status === 'pareto' || c.status === 'dominated' || c.reason === 'Negative cash with no credit') && c.disruption <= 0.4).sort((a, z) => z.score - a.score)
  const caut: Cand[] = []
  for (const c of failing) { if (caut.length >= 3) break; if (caut.every((x) => jac(x.decisions, c.decisions) === 0)) caut.push(c) }
  const gapPm = Math.max(0, b.S + q.h * b.H - q.r * b.I)
  const cautionary: FullPlan[] = caut.map((c) => {
    const pl = toPlan(c)
    const m = pl.first_short_month ?? 0
    return { ...pl, role: 'falls_short' as PlanRole, role_label: 'Falls short', survives: false, source: 'search',
      fails_because: `${c.name} frees too little while the shock lasts: the gap is about ${m0(gapPm)} a month and the cushion of ${m0(b.B)} runs out in month ${m}.` }
  })
  const paretoN = cands.filter((c) => c.status === 'pareto' || c.status === 'finalist').length
  const result = mark<FullResult>({
    account_id: id, shock: { label: longTerm ? 'No shock' : q.label ?? 'This shock', r: longTerm ? 1 : q.r, h: longTerm ? 0 : q.h, one_off: longTerm ? 0 : q.oneOff, duration: longTerm ? 0 : q.duration },
    horizon_months: horizon, plan_mode: q.mode, shock_starts_in: longTerm ? undefined : s0, trigger: q.trigger ?? 'Preview',
    objective: {
      formula: longTerm ? 'score = w_res × resilience + w_goal × Σ goal_weight_i × progress_i − w_dis × disruption' : 'score = w_gap × shortfall covered + w_res × resilience + w_goal × Σ goal_weight_i × progress_i − w_dis × disruption',
      weights: w, goal_weights: goals.map((g) => ({ goal_id: g.id, label: g.label, weight: g.weight, horizon: g.horizon, importance: g.importance })),
    },
    baseline, plans, cautionary, recommended: plans.find((x) => x.role === 'best_tradeoff')?.id ?? plans[0]?.id ?? 'baseline', mode: 'offline', trace: [],
    search: {
      generated: cands.length, screened_out: cands.length - feasible.length, feasible: feasible.length, pareto: paretoN, finalists: plans.length,
      screens: [...screens.entries()].map(([rule, removed]) => ({ rule, removed })).sort((a, z) => z.removed - a.removed),
      rounds: [
        { round: 1, agent: 'life_planner', title: 'Generated decision combinations', count: cands.length },
        { round: 2, agent: 'engine', title: 'Simulated each one month by month', count: cands.length },
        { round: 3, agent: 'validator', title: 'Screened out the infeasible', count: feasible.length },
        { round: 4, agent: 'ranker', title: 'Kept the Pareto set', count: paretoN },
        { round: 5, agent: 'ranker', title: 'Picked four distinct finalists', count: plans.length },
      ],
      candidates: cands.map(({ id: cid, name, decisions: d, resilience, goals: g, shortfall, disruption, score, status, reason, round }) => ({ id: cid, name, decisions: d, resilience, goals: g, shortfall, disruption, score, status, reason, round })),
    },
  })
  if (!seeding) recordHistory(id, result)
  return result
}

/* ------------------------------------------------------------------------------------------- plan history */
const history = new Map<number, PlanHistoryEntry[]>()
const seeded = new Set<number>()
let seeding = false
function entryFrom(r: LifePlanResult, at: string, trigger: string, version: number, prev?: PlanHistoryEntry): PlanHistoryEntry {
  const finalists = r.plans.map((p) => ({ role: p.role ?? 'best_tradeoff', role_label: p.role_label ?? ROLE_LABEL[p.role ?? 'best_tradeoff'], name: p.name, decisions: p.steps.map((s) => s.decision), score: p.score, components: p.components }))
  const changed: string[] = []
  if (prev) {
    const best = finalists.find((f) => f.role === 'best_tradeoff'), was = prev.finalists.find((f) => f.role === 'best_tradeoff')
    if (best && was && best.name !== was.name) changed.push(`Best balance changed from “${was.name}” to “${best.name}”.`)
    if (best && was) { const d = Math.round((best.score - was.score) * 100); if (d) changed.push(`Best balance score ${d > 0 ? 'rose' : 'fell'} ${Math.abs(d)} points.`) }
    const fresh = finalists.filter((f) => !prev.finalists.some((o) => o.name === f.name))
    if (fresh.length) changed.push(`${fresh.length} new finalist${fresh.length > 1 ? 's' : ''}: ${fresh.map((f) => f.name).join('; ')}.`)
    if (!changed.length) changed.push('Same four finalists as last time.')
  } else changed.push('First plan for this account.')
  return { id: `h-${r.plan_mode}-${at}`, at, trigger, plan_mode: r.plan_mode ?? 'shock', shock_label: r.shock.label, profile_version: version, goals: r.objective.goal_weights.map((g) => ({ label: g.label, weight: g.weight })), finalists, changed }
}
function recordHistory(id: number, r: LifePlanResult) {
  const list = history.get(id) ?? []
  const prev = list.find((e) => e.plan_mode === (r.plan_mode ?? 'shock'))
  const key = JSON.stringify([r.plan_mode, r.shock, r.plans.map((p) => p.id)])
  if (prev && (prev as PlanHistoryEntry & { key?: string }).key === key) return
  const e = Object.assign(entryFrom(r, new Date().toISOString(), r.trigger ?? 'Preview run', 7, prev), { key })
  history.set(id, [e, ...list].slice(0, 30))
}
/** Plan history in preview mode: a few earlier runs (as if the profile changed) plus every run made in this session. */
export function mockPlanHistory(id: number, p: Profile | null): PlanHistoryEntry[] {
  if (!seeded.has(id)) {
    seeded.add(id); seeding = true
    const t = (h: number) => new Date(Date.now() - h * 36e5).toISOString()
    const seeds: [PlanRequest, number, string, number][] = [
      [{ mode: 'long_term', r: 1, h: 0, oneOff: 0, duration: 0, startsIn: 1 }, 30, 'Profile built by the Persona Builder', 1],
      [{ mode: 'shock', r: 0.55, h: 0, oneOff: 0, duration: 6, startsIn: 3, label: 'Laid off' }, 26, 'You drew the layoff card', 4],
      [{ mode: 'shock', r: 0.6, h: 0, oneOff: 0, duration: 5, startsIn: 1, label: 'Biggest client walks' }, 6, 'You told Pulp: “I might lose my biggest client”', 6],
      [{ mode: 'long_term', r: 1, h: 0, oneOff: 0, duration: 0, startsIn: 1, horizon: 60 }, 2, 'Trip importance lowered in conversation', 7],
    ]
    const out: PlanHistoryEntry[] = []
    for (const [q, hrs, trig, v] of seeds) {
      const r = mockPlanSearch(id, p, { ...q, trigger: trig })
      const prev = out.find((e) => e.plan_mode === q.mode)
      const e = entryFrom(r, t(hrs), trig, v, prev)
      if (q.mode === 'long_term' && prev) {
        e.finalists = e.finalists.map((f) => (f.role === 'best_tradeoff' ? { ...f, score: f.score + 0.04 } : f))
        e.changed = ['The trip’s importance fell to 2 of 5, so its weight in the objective dropped.', 'Best balance score rose 4 points as more saving went to the van and the home.']
      }
      out.unshift(e)
    }
    seeding = false
    history.set(id, [...(history.get(id) ?? []), ...out].slice(0, 30))
  }
  return mark(history.get(id) ?? [])
}
