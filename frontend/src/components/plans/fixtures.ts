/* Preview fixtures for the v2 views (profile, personal deck, life plans). They are used only while the backend
   endpoints are not answering; every view switches to live data as soon as /api/profile, /api/agent/deck?account_id=
   and /api/agent/life-plans respond. The numbers follow the contract formulas in docs/agents/v2-contracts.md and the
   account's own I, S, H and B so the preview looks like the real thing, but they are not the engine's numbers. */
import type {
  GoalHorizon, LifePersona, PersonaGoal, PersonalShock, Profile, ProfileChange, ProfileDoc,
} from '../../services/api'

const MOCKS = new WeakSet<object>()
/** True when a value came from these fixtures rather than the API. */
export const isMock = (o: object | null | undefined): boolean => !!o && MOCKS.has(o)
export function mark<T extends object>(o: T): T { MOCKS.add(o); return o }

export const r50 = (v: number) => Math.round(v / 50) * 50
export const URGENCY: Record<GoalHorizon, number> = { short: 1, medium: 0.75, long: 0.5 }

export interface Basis { id: number; I: number; S: number; H: number; B: number; P: number; cashShare: number; cv: number; pct: Profile['population_percentiles'] | null }
export function basis(id: number, p: Profile | null): Basis {
  const mixIn = p?.inflow_mix ?? {}
  const totalIn = Object.values(mixIn).reduce((a, b) => a + b, 0) || 1
  return {
    id, I: p?.typical_inflow ?? 4200, S: p?.typical_spending ?? 3700, H: p?.household_bills ?? 900, B: p?.buffer ?? 6500,
    P: p?.active_loan_payment ?? 0, cashShare: (mixIn.cash_deposits ?? 0) / totalIn, cv: p?.income_cv ?? 0.1, pct: p?.population_percentiles ?? null,
  }
}

function weigh(goals: Omit<PersonaGoal, 'weight'>[]): PersonaGoal[] {
  const raw = goals.map((g) => g.importance * URGENCY[g.horizon])
  const sum = raw.reduce((a, b) => a + b, 0) || 1
  return goals.map((g, i) => ({ ...g, weight: raw[i] / sum }))
}

export function mockGoals(b: Basis): PersonaGoal[] {
  return weigh([
    { id: 'g-trip', label: 'Family trip next summer', type: 'experience', size: 'small', horizon: 'short', target_amount: r50(0.35 * b.S), target_months: 8, importance: 2, why: 'A week away with the kids, booked before prices jump.', evidence: 'Spending rises every July and August in the records.', source: 'persona' },
    { id: 'g-van', label: 'Replace the work van', type: 'purchase', size: 'large', horizon: 'medium', target_amount: r50(1.6 * b.S), target_months: 18, importance: 4, why: 'The current one is old and the work depends on it.', evidence: 'Irregular large cash withdrawals look like repairs.', source: 'persona' },
    { id: 'g-home', label: 'Down payment on a first home', type: 'savings', size: 'large', horizon: 'long', target_amount: r50(4 * b.S), target_months: 36, importance: 5, why: 'Stop renting before the family outgrows the flat.', evidence: 'Buffer has grown slowly but steadily over 30 months.', source: 'persona' },
  ])
}

const NAMES = ['Marek Svoboda', 'Lena Horak', 'Tomas Novak', 'Petra Kral', 'Jakub Dvorak', 'Eva Cerna']

export function mockPersona(id: number, p: Profile | null): LifePersona {
  const b = basis(id, p)
  const cashEarner = b.cashShare > 0.6
  const occupation = cashEarner
    ? { label: 'Self-employed tradesperson, paid mostly in cash', confidence: 0.62, evidence: `${Math.round(b.cashShare * 100)}% of money in arrives as cash deposits; no payroll transfers.` }
    : { label: 'Salaried employee with a regular payroll', confidence: 0.7, evidence: 'Income arrives on the same days each month with little variation.' }
  const pct = b.pct
  return mark({
    account_id: id, fictional: true, source: 'preview', built_at: new Date(Date.now() - 36e5).toISOString(),
    display_name: NAMES[id % NAMES.length], age: 38, life_stage: 'Young family, renting',
    occupation, household: 'Two adults and two school-age children', home: 'Renting a three-room flat in the city',
    story: `${NAMES[id % NAMES.length].split(' ')[0]} runs a small renovation business and is paid job by job. Money comes in steadily on average but spending takes almost all of it, so the cushion grows slowly. The family wants a home of their own within three years and needs the van to keep working.`,
    goals: mockGoals(b),
    worries: [
      { label: 'A slow season or a lost client', type: 'income', evidence: `Income varies about ${Math.round(b.cv * 100)}% month to month.` },
      { label: 'Big repair bills on the van', type: 'costs', evidence: 'Several large cash withdrawals in single months.' },
      { label: 'Rent going up at renewal', type: 'housing', evidence: 'Renting, with spending already close to income.' },
    ],
    questions: [
      { key: 'income_stability', text: 'How many clients does most of your work come from right now?', why: 'Income is all cash deposits, so one lost client could matter more than for a payroll earner.' },
      { key: 'van', text: 'When do you expect to replace the van, and could the business pay part of it?', why: 'It is the largest near-term goal and decides how much cash to keep free.' },
      { key: 'home_timeline', text: 'Is three years a firm date for the down payment, or a wish?', why: 'A firm date gives the home goal more weight in every plan.' },
    ],
    traits: [
      { label: 'Money in each month', value: `$${Math.round(b.I).toLocaleString()}`, percentile: pct?.typical_inflow ?? 66, note: 'Higher than most accounts at this bank.' },
      { label: 'Share of income spent', value: `${Math.round((b.S / Math.max(1, b.I)) * 100)}%`, percentile: pct?.spending_ratio ?? 59, note: 'Spends almost all of what comes in.' },
      { label: 'Cash cushion', value: `$${Math.round(b.B).toLocaleString()}`, percentile: pct?.buffer ?? 58, note: `About ${(b.B / Math.max(1, b.S)).toFixed(1)} months of spending.` },
      { label: 'Income steadiness', value: `${Math.round(b.cv * 100)}% swing`, percentile: 41, note: 'Less steady than a payroll income.' },
    ],
    like_others: { archetype: 'Stretched high earners', share: 0.18, survive6_layoff_pct: 55, peers_n: 222, note: 'People with similar income and spending: about half would last a six-month layoff.' },
  })
}

const docs = new Map<number, ProfileDoc>()
export function mockProfileDoc(id: number, p: Profile | null): ProfileDoc {
  const have = docs.get(id)
  if (have) return have
  const persona = mockPersona(id, p)
  const t = (minAgo: number) => new Date(Date.now() - minAgo * 60e3).toISOString()
  const log: ProfileChange[] = [
    { id: 'c1', at: t(62), version: 1, agent: 'persona_builder', kind: 'seed', field: 'persona', label: 'Built a fictional life from the records', before: null, after: persona.occupation.label, reason: persona.occupation.evidence },
    ...persona.goals.map((g, i): ProfileChange => ({ id: `c${2 + i}`, at: t(61 - i), version: 2 + i, agent: 'persona_builder', kind: 'add', field: 'goals', label: g.label, before: null, after: `$${g.target_amount.toLocaleString()} in ${g.target_months} months, importance ${g.importance}/5`, reason: g.evidence })),
    { id: 'c5', at: t(24), version: 5, agent: 'companion', kind: 'update', field: 'goals', label: 'Family trip next summer', before: 'importance 3/5', after: 'importance 2/5', reason: 'You said the trip can wait a year if money is tight.' },
    { id: 'c6', at: t(23), version: 6, agent: 'companion', kind: 'add', field: 'concerns', label: 'Losing the biggest client', before: null, after: 'worry: income', reason: 'You mentioned one client brings in about half the work.' },
    { id: 'c7', at: t(9), version: 7, agent: 'life_planner', kind: 'add', field: 'upcoming_events', label: 'Possible slow season in winter', before: null, after: 'income at 55% for 6 months', reason: 'Raised when you asked what a slow winter would do.' },
  ]
  const doc = mark<ProfileDoc>({ account_id: id, persona, goals: persona.goals, context: { account_id: id, context_version: 7, goals: [], concerns: [], constraints: [], preferences: [], upcoming_events: [], accepted_actions: [], pending_proposals: [], asked_questions: [] }, log: log.reverse(), version: 7 })
  docs.set(id, doc)
  return doc
}
/** Undo in preview mode: mark the change undone and log an undo entry, as the backend does. */
export function mockUndo(id: number, changeId: string): ProfileDoc | null {
  const doc = docs.get(id)
  if (!doc) return null
  const target = doc.log.find((c) => c.id === changeId)
  if (!target || target.undone) return doc
  const version = doc.version + 1
  const next = mark<ProfileDoc>({
    ...doc, version,
    log: [{ id: `u${version}`, at: new Date().toISOString(), version, agent: 'user', kind: 'undo', field: target.field, label: target.label, before: target.after, after: target.before, reason: 'You undid this change.' },
      ...doc.log.map((c) => (c.id === changeId ? { ...c, undone: true } : c))],
  })
  docs.set(id, next)
  return next
}

export function mockDeck(id: number, p: Profile | null): PersonalShock[] {
  const b = basis(id, p)
  const card = (c: Omit<PersonalShock, 'source'>): PersonalShock => ({ ...c, source: 'preview' })
  return [
    card({ key: 'p-client', title: 'Biggest client walks', text: 'Your largest client moves to another contractor. Income falls to 60% for 5 months.', r: 0.6, h: 0, one_off: 0, duration: 5, category: 'income', likelihood: 'medium', why_you: 'All your income is cash from jobs, so one client is a big share of it.' }),
    card({ key: 'p-van', title: 'The van breaks down', text: 'Engine trouble on the work van. The repair costs about half a month of spending.', r: 1, h: 0, one_off: r50(0.5 * b.S), duration: 3, category: 'transport', likelihood: 'high', why_you: 'Large one-off withdrawals in your records look like vehicle repairs.' }),
    card({ key: 'p-rent', title: 'Rent goes up at renewal', text: 'The landlord raises rent. Household bills rise 12% from next month.', r: 1, h: 0.12, one_off: 0, duration: 12, category: 'housing', likelihood: 'medium', why_you: 'You rent, and spending is already close to income.' }),
    card({ key: 'p-winter', title: 'A slow winter', text: 'Renovation work dries up for the winter. Income at 55% for 4 months.', r: 0.55, h: 0, one_off: 0, duration: 4, category: 'income', likelihood: 'high', why_you: 'Your income dipped in past winters.' }),
    card({ key: 'p-injury', title: 'A back injury', text: 'You cannot work for 3 months. EI sickness pays 55%.', r: 0.55, h: 0, one_off: r50(0.1 * b.S), duration: 3, category: 'health', likelihood: 'low', why_you: 'Physical work with no employer sick pay.' }),
    card({ key: 'p-dental', title: 'Braces for your eldest', text: 'Orthodontics not covered by insurance, paid upfront.', r: 1, h: 0, one_off: r50(0.4 * b.S), duration: 2, category: 'family', likelihood: 'medium', why_you: 'Two school-age children and no insurance payments in the records.' }),
  ].map(mark)
}

