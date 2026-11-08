/* Realistic sample data for the agents showcase while the backend endpoints are still landing.
   Built from the account's own engine numbers (Profile), so the sample reads like this account. The Agents page
   swaps these out automatically the moment /api/agents/trace, /api/agent/personas (v2) or /api/agent/life-plans answer. */
import type { AgentTrace, LifePlan, LifePlanResult, SearchCandidate, PlanOutcome, PlanStep, Persona, Profile, TraceEvent } from '../../services/api'

/** Full registry: role, inputs, outputs and guardrail for every agent, used where the live registry lacks an entry. */
export const ROSTER: Persona[] = [
  { key: 'schema_scout', name: 'Schema Scout', kind: 'ai', stage: 1, symbol: 'map', analogy: 'the surveyor', runs_on: 'Gemini on Google ADK', role: 'Surveys the eight bank tables, finds the keys that join them and decides which columns are worth measuring.', reads: ['table names and columns', 'sample rows'], writes: ['a join plan', 'columns to measure'], guardrail: 'reads schemas and samples only; never sees a full account' },
  { key: 'feature_forge', name: 'Feature Forge', kind: 'code', stage: 1, symbol: 'anvil', analogy: 'the lab', runs_on: 'Python (pandas, numpy)', role: 'Computes about 78 behavioural signals per account: income regularity, payday and bill dates, penalty interest, spending drift, past income drops.', reads: ['the join plan', 'monthly_summary.csv', 'transactions.csv', 'loans.csv'], writes: ['78 signals per account', 'percentiles against all accounts'], guardrail: 'deterministic code; the same input always gives the same signals' },
  { key: 'pattern_hunter', name: 'Pattern Hunter', kind: 'ai', stage: 1, symbol: 'magnifier', analogy: 'the detective', runs_on: 'Gemini on Google ADK', role: 'Looks across the signals for patterns worth a flag, such as a sliding balance or uneven income, and cites the evidence for each.', reads: ['78 signals', 'population percentiles'], writes: ['flags, each with its evidence'], guardrail: 'a flag needs a signal past a stated threshold; no evidence, no flag' },
  { key: 'archetype_namer', name: 'Archetype Namer', kind: 'ai', stage: 1, symbol: 'tags', analogy: 'the librarian', runs_on: 'Gemini on Google ADK', role: 'Names the six behavioural clusters found by code so a person recognises themselves in one.', reads: ['cluster centres from k-means', 'top distinguishing signals'], writes: ['archetype names and one-line descriptions'], guardrail: 'names clusters; cannot move an account between them' },
  { key: 'narrator', name: 'Profile Narrator', kind: 'ai', stage: 1, symbol: 'quill', analogy: 'the storyteller', runs_on: 'Gemini on Google ADK', role: 'Writes the three or four sentences worth hearing about an account, one per flag.', reads: ['official numbers', 'flags with evidence', 'archetype'], writes: ['headline', 'one sentence per flag'], guardrail: 'may only talk about the flags it was given; every sentence names its flag' },
  { key: 'persona_builder', name: 'Persona Builder', kind: 'ai', stage: 1, symbol: 'id-card', analogy: 'the biographer', runs_on: 'Gemini on Google ADK', role: 'Builds a realistic but fictional life for the anonymized account: likely work, household, goals, worries and the first questions worth asking.', reads: ['profile story', 'signals', 'district statistics'], writes: ['a fictional life persona', 'goals with weights', 'first questions'], guardrail: 'marked fictional; must stay consistent with the records (no job that contradicts the income pattern)' },
  { key: 'companion', name: 'Companion', kind: 'memory', stage: 2, symbol: 'ear', analogy: 'the note-taker', runs_on: 'Gemini (offline extractor without a key)', role: 'Listens to what you say and updates your profile directly: goals, worries, constraints and life events. Every change is logged and can be undone.', reads: ['your message', 'your profile'], writes: ['logged, undoable profile changes'], guardrail: 'every change carries a reason and a before and after; saying "no" undoes it' },
  { key: 'director', name: 'Director', kind: 'ai', stage: 2, symbol: 'compass', analogy: 'the show director', runs_on: 'Gemini on Google ADK', role: 'Decides what to show for each turn and writes what Pulp says, calling the engine when it needs numbers.', reads: ['your message', 'your profile', 'engine tools'], writes: ['beats: a visual, a source, a caption'], guardrail: 'numbers come from tools; captions are checked against the data behind each visual' },
  { key: 'engine', name: 'Engine', kind: 'code', stage: 0, symbol: 'gear', analogy: 'the calculator', runs_on: 'Python (pandas, numpy)', role: 'The official formula, the month-by-month simulator and the plan scorer. The only source of numbers.', reads: ['the CSVs', 'a shock', 'a plan'], writes: ['runway, cash paths, scores'], guardrail: 'tested against the judges’ definitions; no model can change a number' },
  { key: 'shock_generator', name: 'Shock Generator', kind: 'ai', stage: 3, symbol: 'storm', analogy: 'the risk officer', runs_on: 'Gemini on Google ADK', role: 'Proposes shocks that fit this life, such as a client loss for a cash earner or a rate reset for a borrower.', reads: ['life persona', 'signals', 'loan terms'], writes: ['personal shocks with a reason each'], guardrail: 'chooses which shocks; code sets every amount from the account' },
  { key: 'shock_dealer', name: 'Shock Dealer', kind: 'ai', stage: 3, symbol: 'cards', analogy: 'the dealer', runs_on: 'Gemini on Google ADK, grounded offline fallback', role: 'Deals the next twist card through a character from this life (a recruiter, a landlord, a mechanic) and says why it fits, never repeating the previous character or scenario.', reads: ['personal deck', 'life persona', 'recent twists'], writes: ['the dealt card', 'a reason'], guardrail: 'picks a card; every amount on it is set by code from the account' },
  { key: 'strategist', name: 'Strategist', kind: 'ai', stage: 3, symbol: 'knight', analogy: 'the chess player', runs_on: 'Gemini on Google ADK', role: 'Adds up to six plan ideas built from your own life, which go through the same simulation and screens as every other candidate.', reads: ['your profile', 'the shock', 'the decision catalog'], writes: ['candidate plans'], guardrail: 'proposes only; the engine scores and the validator screens' },
  { key: 'life_planner', name: 'Life Planner', kind: 'code', stage: 3, symbol: 'route', analogy: 'the route planner', runs_on: 'Python, with Gemini for wording', role: 'Generates hundreds of multi-step plans from real decisions (second job, move, delay a purchase, refinance) with timing variants.', reads: ['the decision catalog', 'goals and weights', 'the shock'], writes: ['120 to 400 candidate plans'], guardrail: 'every decision comes from the catalog with code-set effects' },
  { key: 'life_fit', name: 'Life Fit Assessor', kind: 'code', stage: 3, symbol: 'heart', analogy: 'the life coach', runs_on: 'Python rules over the persona and records', role: 'Checks every decision against the person: age and physical capacity, the time a shared household leaves, whether a lodger or a move is realistic, whether gig work exists where they live. Adds options that suit their stage of life.', reads: ['the persona', 'age, household and district', 'what you told Pulp about health and time'], writes: ['a fit score and reason per decision'], guardrail: 'poor fits are screened out with the reason shown; fit is part of the stated objective' },
  { key: 'challenger', name: 'Challenger', kind: 'ai', stage: 3, symbol: 'shield', analogy: 'the sceptic', runs_on: 'Gemini on Google ADK', role: 'Questions the finalists: flags steps you are unlikely to follow given what you told Pulp, and writes why each beat its runners-up.', reads: ['finalists', 'your profile'], writes: ['risk flags', 'step reasoning'], guardrail: 'cannot change scores or the profile' },
  { key: 'validator', name: 'Validator and Ranker', kind: 'code', stage: 3, symbol: 'scales', analogy: 'the referee', runs_on: 'Python', role: 'Screens out infeasible plans, keeps the Pareto frontier, and picks four distinct finalists.', reads: ['simulated candidates'], writes: ['screen counts', 'the frontier', 'four finalists'], guardrail: 'one stated objective; finalists must differ (Jaccard below 0.5)' },
]

type P = Pick<Profile, 'typical_inflow' | 'typical_spending' | 'buffer' | 'household_bills'> & Partial<Profile>
const DEFAULT: P = { typical_inflow: 5200, typical_spending: 4380, buffer: 9400, household_bills: 1150 }
const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`

export function mockTrace(accountId: number, profile?: P | null): AgentTrace {
  const p = profile ?? DEFAULT
  const I = p.typical_inflow, S = p.typical_spending, B = p.buffer
  const gap = Math.max(1, S - 0.55 * I)
  const runway = Math.min(120, B / gap)
  const ratio = S / Math.max(1, I)
  const s1: TraceEvent[] = [
    { t: 0.0, stage: 1, agent: 'data', kind: 'handoff', to: 'schema_scout', title: '8 tables', items: ['monthly_summary.csv', 'transactions.csv', 'loans.csv', 'accounts.csv', 'clients.csv', 'districts.csv', 'dispositions.csv', 'cards.csv'], data: { tables: 8, rows: 1056320 } },
    { t: 0.4, stage: 1, agent: 'schema_scout', kind: 'start', title: 'Surveys the tables and their keys' },
    { t: 1.1, stage: 1, agent: 'schema_scout', kind: 'handoff', to: 'feature_forge', title: 'Join plan', items: ['account_id joins 6 tables', 'district_id joins districts', 'transactions by month and type', 'loan status kept for validation only'], data: { joins: 7, measured_columns: 23 } },
    { t: 1.6, stage: 1, agent: 'feature_forge', kind: 'tool_call', title: 'Compute behavioural signals', data: { account_id: accountId, months: p.months_available ?? 72 } },
    { t: 2.7, stage: 1, agent: 'feature_forge', kind: 'tool_result', title: '78 signals', items: [`typical money in ${money(I)}`, `typical spending ${money(S)}`, `spends ${Math.round(ratio * 100)}% of income`, `income variation ${((p.income_cv ?? 0.18) * 100).toFixed(0)}%`, `cash buffer ${money(B)}`], data: { signals: 78, spending_ratio: +ratio.toFixed(3), income_cv: p.income_cv ?? 0.18, buffer: Math.round(B) } },
    { t: 3.0, stage: 1, agent: 'feature_forge', kind: 'handoff', to: 'pattern_hunter', title: '78 signals', items: ['with percentiles against 4,500 accounts'] },
    { t: 3.1, stage: 1, agent: 'feature_forge', kind: 'handoff', to: 'archetype_namer', title: 'Cluster position', items: ['k-means, 6 clusters', 'distance to each centre'] },
    { t: 4.2, stage: 1, agent: 'pattern_hunter', kind: 'output', title: '3 flags with evidence', items: [ratio > 0.85 ? 'High spending ratio: past the 75th percentile' : 'Healthy spending ratio: below the median', 'Bills land within 4 days of payday', 'One income drop in 2023, recovered in 3 months'], data: { flags: 3, threshold: 'percentile >= 75 or a named event' } },
    { t: 4.5, stage: 1, agent: 'archetype_namer', kind: 'output', title: ratio > 0.85 ? 'Archetype: Stretched earner' : 'Archetype: Steady planner', items: ['one of 6 named clusters', 'shares the cluster with 18% of accounts'] },
    { t: 4.8, stage: 1, agent: 'pattern_hunter', kind: 'handoff', to: 'narrator', title: '3 flags' },
    { t: 4.9, stage: 1, agent: 'archetype_namer', kind: 'handoff', to: 'narrator', title: 'Archetype' },
    { t: 6.0, stage: 1, agent: 'narrator', kind: 'output', title: 'Headline and 3 sentences', items: [`Your cash would cover about ${runway.toFixed(1)} months of a layoff at 55% income.`, 'Every sentence names the flag behind it.'] },
    { t: 6.2, stage: 1, agent: 'narrator', kind: 'handoff', to: 'persona_builder', title: 'Profile story' },
    { t: 7.6, stage: 1, agent: 'persona_builder', kind: 'output', title: 'A fictional life', items: ['Likely work: salaried, paid monthly (confidence 0.7)', 'Household: two adults, one income', 'Goals: emergency fund, a used car, a summer trip', 'First question: “Is your income steady month to month?”'], data: { fictional: true, goals: 3, worries: 2, questions: 3 } },
    { t: 7.9, stage: 1, agent: 'persona_builder', kind: 'handoff', to: 'shock_generator', title: 'Life persona' },
    { t: 7.95, stage: 1, agent: 'persona_builder', kind: 'handoff', to: 'profile', title: 'Seeded profile', items: ['3 goals with weights', '2 worries', 'version 1'] },
    { t: 9.1, stage: 1, agent: 'shock_generator', kind: 'output', title: '8 shocks for this life', items: ['Layoff, EI at 55% for 6 months (high)', `Rent up ${money(Math.max(150, 0.12 * p.household_bills))} a month (medium)`, 'Car repair, one month of spending (medium)', 'Reduced hours, 80% income for 4 months (medium)'], data: { cards: 8, amounts_set_by: 'engine' } },
  ]
  const s2: TraceEvent[] = [
    { t: 0.0, stage: 2, agent: 'you', kind: 'handoff', to: 'companion', title: '“Saving for a car”', items: ['“We want a used car by next summer, around six thousand.”'] },
    { t: 0.6, stage: 2, agent: 'companion', kind: 'tool_call', to: 'profile', title: 'Update the profile', data: { field: 'goals', operation: 'add' } },
    { t: 0.9, stage: 2, agent: 'companion', kind: 'output', to: 'profile', title: 'Updated your profile (1 change)', items: ['Goal: Used car → $6,000 within 12 months'], data: { version: 2, undoable: true } },
    { t: 1.1, stage: 2, agent: 'companion', kind: 'handoff', to: 'director', title: 'New goal' },
    { t: 1.5, stage: 2, agent: 'director', kind: 'tool_call', to: 'engine', title: 'Read the numbers', data: { tool: 'get_financial_profile', account_id: accountId } },
    { t: 1.8, stage: 2, agent: 'engine', kind: 'tool_result', title: `Saves ${money(Math.max(0, I - S))} a month`, data: { typical_surplus: Math.round(I - S), months_to_goal: Math.ceil(6000 / Math.max(50, I - S)) } },
    { t: 2.6, stage: 2, agent: 'director', kind: 'handoff', to: 'stage', title: '3 beats', items: ['A goal timeline', 'Your typical month', 'A question about timing'] },
  ]
  const s3: TraceEvent[] = [
    { t: 0.0, stage: 3, agent: 'you', kind: 'handoff', to: 'companion', title: '“Might lose my job”', items: ['“There are layoffs coming at work.”'] },
    { t: 0.4, stage: 3, agent: 'companion', kind: 'handoff', to: 'shock_generator', title: 'Shock mentioned' },
    { t: 0.9, stage: 3, agent: 'shock_generator', kind: 'handoff', to: 'engine', title: 'Layoff, 6 months', items: ['income retained 55%', 'bills unchanged', 'no one-off cost'], data: { r: 0.55, h: 0, one_off: 0, duration: 6 } },
    { t: 1.3, stage: 3, agent: 'engine', kind: 'handoff', to: 'life_planner', title: `Short ${money(gap)}/month`, items: [`runway ${runway.toFixed(1)} months`, `monthly gap ${money(gap)}`], data: { runway: +runway.toFixed(1), gap: Math.round(gap) } },
    { t: 1.6, stage: 3, agent: 'strategist', kind: 'handoff', to: 'life_planner', title: '6 ideas', items: ['Pause the car fund', 'Weekend shifts at the old employer', 'Sublet the spare room'] },
    { t: 2.4, stage: 3, agent: 'life_planner', kind: 'handoff', to: 'engine', title: '240 plans', items: ['1 to 4 decisions each', 'start now, at the shock, or after it'], data: { generated: 240 } },
    { t: 3.6, stage: 3, agent: 'engine', kind: 'handoff', to: 'validator', title: '240 simulated', items: ['12 months each, month by month'], data: { generated: 240 } },
    { t: 4.1, stage: 3, agent: 'validator', kind: 'handoff', to: 'ranker', title: '61 screened out', items: ['22 conflicting decisions', '17 cuts beyond 25% of spending', '12 goals pushed past their horizon', '10 negative cash with no credit'], data: { screened_out: 61 } },
    { t: 4.5, stage: 3, agent: 'ranker', kind: 'handoff', to: 'challenger', title: '18 on the frontier', items: ['Pareto over shortfall, resilience and goals'], data: { pareto: 18 } },
    { t: 5.4, stage: 3, agent: 'challenger', kind: 'handoff', to: 'director', title: '4 finalists', items: ['Best on shortfall', 'Best on resilience', 'Best on goals', 'Best trade-off'], data: { finalists: 4 } },
    { t: 6.0, stage: 3, agent: 'director', kind: 'handoff', to: 'stage', title: 'Plans explained', items: ['Each step names the insight behind it'] },
  ]
  return {
    account_id: accountId,
    stages: [
      { stage: 1, title: 'From records to a person', summary: 'Eight tables become 78 signals, three flags, an archetype, a short story and a realistic fictional life with goals and the first questions to ask.', events: s1 },
      { stage: 2, title: 'Getting to know you', summary: 'What you say updates your profile directly, logged and undoable; the Director shows what changed using engine numbers.', events: s2 },
      { stage: 3, title: 'When life happens', summary: 'A shock triggers a search: hundreds of plans simulated, screened and narrowed to four distinct finalists.', events: s3 },
    ],
  }
}

/* ---------------------------------------------------------------- plan search sample */
function rng(seed: number) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647 }
const DECISIONS = ['second_job', 'cut_spending_10', 'delay_car', 'pause_trip', 'sublet_room', 'refinance', 'move_cheaper', 'sell_item', 'extra_hours']

export function mockLifePlans(accountId: number, profile?: P | null): LifePlanResult {
  const p = profile ?? DEFAULT
  const I = p.typical_inflow, S = p.typical_spending, B = p.buffer
  const H = 12, dur = 6
  const goals = [
    { goal_id: 'g-emergency', label: 'Emergency fund', target: Math.round(3 * S), deadline_month: 12, weight: 0.5, horizon: 'short' as const, importance: 5 },
    { goal_id: 'g-car', label: 'Used car', target: 6000, deadline_month: 12, weight: 0.32, horizon: 'medium' as const, importance: 4 },
    { goal_id: 'g-trip', label: 'Summer trip', target: 1800, deadline_month: 9, weight: 0.18, horizon: 'medium' as const, importance: 2 },
  ]
  const simulate = (steps: PlanStep[]): PlanOutcome => {
    const cash = [Math.round(B)]
    let c = B, covered = 0, short = 0
    for (let m = 1; m <= H; m++) {
      const inc = m <= dur ? 0.55 * I : I
      const eff = steps.reduce((a, s) => a + (m - 1 >= s.month_start && m - 1 <= s.month_end ? s.monthly_effect : 0) + (m - 1 === s.month_start ? -s.one_off : 0), 0)
      c += inc - S + eff
      if (c < 0) { short += -c; c = 0 } else if (m <= dur) covered = m
      cash.push(Math.round(c))
    }
    const end = cash[H]
    const save = Math.max(0, end - B * 0.6)
    const out = goals.map((g) => { const saved = Math.round(save * g.weight); return { goal_id: g.goal_id, label: g.label, target: g.target, deadline_month: g.deadline_month, saved_at_deadline: saved, progress: Math.min(1, saved / g.target), reached_month: saved >= g.target ? g.deadline_month : null, weight: g.weight } })
    const resilience = 0.6 * Math.min(1, covered / dur) + 0.4 * Math.min(1, end / (6 * S))
    return { cash_path: cash, goal_paths: Object.fromEntries(out.map((g) => [g.goal_id, cash.map((v) => Math.round(Math.max(0, v - B * 0.6) * g.weight))])), min_cash: Math.min(...cash), months_covered: covered, shortfall_total: Math.round(short), end_cash: end, goals: out, resilience: +resilience.toFixed(3), goal_score: +out.reduce((a, g) => a + g.weight * g.progress, 0).toFixed(3) }
  }
  const gapTotal = dur * Math.max(1, S - 0.55 * I)
  const plan = (id: string, name: string, summary: string, steps: PlanStep[], extra: Partial<LifePlan>): LifePlan => {
    const o = simulate(steps)
    const dis = steps.reduce((a, s) => a + (s.decision === 'second_job' ? 0.25 : s.decision === 'move_cheaper' ? 0.3 : 0.12), 0)
    const shortfall = 1 - Math.min(1, o.shortfall_total / gapTotal)
    return { id, name, summary, why: summary, steps, outcome: o, score: +(0.5 * o.resilience + 0.4 * o.goal_score - 0.1 * dis).toFixed(3), components: { resilience: o.resilience, goals: o.goal_score, disruption: +dis.toFixed(2), shortfall: +shortfall.toFixed(3) }, pareto: true, source: 'search', flags: [], ...extra }
  }
  const step = (month_start: number, month_end: number, decision: string, title: string, detail: string, monthly_effect: number, category: PlanStep['category'], one_off = 0): PlanStep => ({ month_start, month_end, decision, title, detail, monthly_effect: Math.round(monthly_effect), one_off, category })
  const plans: LifePlan[] = [
    plan('p-shortfall', 'Second job through the layoff', 'Weekend shifts cover most of the gap while EI runs.', [step(0, 5, 'second_job', 'Take weekend shifts', 'About 14 hours a week at $22', 1230, 'income'), step(0, 5, 'cut_spending_10', 'Trim 10% of spending', 'Dining, subscriptions, delivery', 0.1 * S, 'spending')], { role: 'best_shortfall', role_label: 'Best on shortfall', reasoning: [{ step: 0, because: 'Income dropped once before and you recovered in 3 months', evidence: 'income drop 2023', moves: 'shortfall' }], versus: 'Covers more of the gap than any other finalist.' }),
    plan('p-resilience', 'Build the cushion now', 'Cut early and pause the trip, so the buffer is larger when the layoff lands.', [step(0, 11, 'cut_spending_10', 'Trim 12% of spending now', 'Start before the shock', 0.12 * S, 'spending'), step(0, 8, 'pause_trip', 'Pause the summer trip', 'Move it to next year', 200, 'goal')], { role: 'best_resilience', role_label: 'Best on resilience', reasoning: [{ step: 0, because: 'Bills land within 4 days of payday', evidence: 'flag: bill timing', moves: 'resilience' }], versus: 'Ends with the most months of spending in cash.' }),
    plan('p-goals', 'Keep the car on track', 'Sublet the spare room so the car fund keeps growing through the layoff.', [step(1, 11, 'sublet_room', 'Sublet the spare room', '$650 a month from month 2', 650, 'housing'), step(0, 5, 'delay_car', 'Delay the car by 3 months', 'Buy in month 15 instead of 12', 0, 'timing')], { role: 'best_goals', role_label: 'Best on goals', reasoning: [{ step: 0, because: 'The car is your second most important goal', evidence: 'profile goal, weight 0.32', moves: 'goals' }], versus: 'Reaches more of your weighted goals than the others.' }),
    plan('p-tradeoff', 'Delay, trim and a short side gig', 'A balanced route: delay the car, trim 8% and take shifts for four months.', [step(0, 5, 'delay_car', 'Delay the car purchase', 'Six months later', 0, 'timing'), step(0, 11, 'cut_spending_10', 'Trim 8% of spending', 'Mostly dining and delivery', 0.08 * S, 'spending'), step(1, 4, 'extra_hours', 'Four months of extra shifts', 'About 8 hours a week', 700, 'income')], { role: 'best_tradeoff', role_label: 'Best trade-off', reasoning: [{ step: 0, because: 'You spend about the median share of income', evidence: 'spending ratio', moves: 'resilience and goals' }], versus: 'Highest weighted score: good on every axis, worst on none.' }),
  ]
  const r = rng(accountId)
  const candidates: SearchCandidate[] = Array.from({ length: 240 }, (_, i) => {
    const n = 1 + Math.floor(r() * 4)
    const decisions = Array.from({ length: n }, () => DECISIONS[Math.floor(r() * DECISIONS.length)])
    const res = +(0.25 + r() * 0.6).toFixed(3), gl = +(0.15 + r() * 0.65).toFixed(3), sh = +(0.3 + r() * 0.65).toFixed(3)
    const status: SearchCandidate['status'] = i < 61 ? 'screened' : i < 61 + 14 ? 'pareto' : 'dominated'
    return { id: `c-${i}`, name: decisions.map((d) => d.replaceAll('_', ' ')).join(' + '), decisions, resilience: res, goals: gl, shortfall: sh, disruption: +(n * 0.12).toFixed(2), score: +(0.5 * res + 0.4 * gl - 0.012 * n).toFixed(3), status, reason: status === 'screened' ? ['conflicting decisions', 'cut beyond 25% of spending', 'goal past its horizon', 'negative cash with no credit'][i % 4] : undefined, round: i < 200 ? 1 : 2 }
  })
  plans.forEach((pl, i) => candidates.push({ id: pl.id, name: pl.name, decisions: pl.steps.map((s) => s.decision), resilience: pl.components.resilience, goals: pl.components.goals, shortfall: pl.components.shortfall ?? 0, disruption: pl.components.disruption, score: pl.score, status: 'finalist', round: i < 2 ? 1 : 2 }))
  const baseline = plan('p-baseline', 'Do nothing', 'Ride it out on the buffer.', [], { pareto: false, source: 'baseline' })
  return {
    account_id: accountId,
    shock: { label: 'Layoff, EI at 55% for 6 months', r: 0.55, h: 0, one_off: 0, duration: dur },
    horizon_months: H,
    objective: { formula: 'score = 0.5 x resilience + 0.4 x weighted goals - 0.1 x disruption', weights: { resilience: 0.5, goals: 0.4, disruption: 0.1 }, goal_weights: goals.map((g) => ({ goal_id: g.goal_id, label: g.label, weight: g.weight, horizon: g.horizon, importance: g.importance })) },
    baseline, plans, recommended: 'p-tradeoff', mode: 'offline',
    trace: mockTrace(accountId, p).stages[2].events,
    search: {
      generated: 240, screened_out: 61, feasible: 179, pareto: 18, finalists: 4,
      screens: [{ rule: 'Conflicting decisions', removed: 22 }, { rule: 'Spending cut beyond 25%', removed: 17 }, { rule: 'Goal past its horizon', removed: 12 }, { rule: 'Negative cash with no credit', removed: 10 }],
      rounds: [{ round: 1, agent: 'life_planner', title: 'Catalog combinations', count: 234 }, { round: 2, agent: 'strategist', title: 'Ideas from your life', count: 6 }],
      candidates,
    },
  }
}
