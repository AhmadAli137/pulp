import type { LifeProfile } from '../components/PersonProfile'
import type { Overview, Briefing } from '../components/FinancialOverview'
/* API client for the PULP backend. All numbers come from the deterministic backend. */

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

export class ApiError extends Error {
  status: number
  hint?: string
  constructor(status: number, message: string, hint?: string) {
    super(message)
    this.status = status
    this.hint = hint
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init })
  } catch {
    throw new ApiError(0, 'Cannot reach the PULP API. Start the backend (uvicorn app.main:app --port 8000).')
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch { /* ignore */ }
    throw new ApiError(res.status, detail, res.headers.get('X-Hint') ?? undefined)
  }
  return res.json() as Promise<T>
}

const get = <T,>(p: string) => request<T>(p)
const post = <T,>(p: string, body: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body) })
const del = <T,>(p: string) => request<T>(p, { method: 'DELETE' })

// ------------------------------------------------------------------ types
export interface Health { ok: boolean; accounts: number; data_dir: string; gemini_configured: boolean; gemini_model: string | null; ai_provider: 'gemini' | 'vultr' | 'offline'; ai_model: string | null; ai_label: string }
export interface SampleAccount { account_id: number; I: number; S: number; B: number; months: number; has_active_loan: boolean; tag: string }
export interface HistoryRow {
  month: string; money_in: number; money_out: number; household_bills: number; insurance: number; loan_payments: number
  fixed_costs: number; month_end_balance: number; min_balance: number; avg_daily_balance: number; days_below_zero: number
}
export interface Profile {
  account_id: number; months_available: number; first_month: string; last_month: string
  typical_inflow: number; typical_spending: number; typical_fixed_costs: number; household_bills: number
  typical_insurance: number; typical_loan_payments: number; buffer: number; buffer_months_used: number
  buffer_rows: { month: string; avg_daily_balance: number }[]; active_loan_payment: number
  loan: null | { loan_id: number; loan_start: string; amount: number; duration_months: number; monthly_payment: number; status: string; status_meaning: string; running_end_2025: boolean }
  typical_surplus: number; baseline_gap: number; baseline_runway: number | null; baseline_runway_label: string
  observed_negative_balance_days: number; observed_months_below_zero: number; observed_min_balance: number
  income_cv: number; spending_ratio: number; inflow_mix: Record<string, number>; outflow_mix: Record<string, number>
  history_months: number
  account: { district_id: number | null; district_name: string | null; region: string | null; statement_frequency: string | null; account_opened: string | null }
  standing_orders: { amount: number; purpose: string }[]
  population_percentiles: { typical_inflow: number; typical_spending: number; buffer: number; spending_ratio: number | null }
  show_the_math: Record<string, { label: string; value: number | string; rows?: { month: string; avg_daily_balance: number }[]; n_months?: number }>
  data_note: string
}
export interface ShockResult {
  inputs: { I: number; S: number; H: number; B: number; r: number; h: number; one_off: number }
  income_after: number; spending_after: number; buffer_left: number; monthly_gap: number
  runway: number | null; runway_display: number | null; runway_label: string; runway_status: 'exhausted' | 'no_shortfall' | 'capped' | 'finite'
}
export interface Verdict { horizon_months: number; survives: boolean; exact_at_horizon: boolean; months_covered: number; shortfall_over_horizon: number; cash_left_at_horizon: number; verdict: string }
export interface GoalPlan { cash_needed: number; current_buffer: number; additional_buffer_needed: number; capacity_to_save_per_month: number; capacity_assumption: string; months_to_target: number | null; reachable_from_surplus: boolean; note: string; title: string; horizon_months: number }
export interface BackupPlan { immediate_need: number; recurring_gap: number; buffer_left: number; monthly_improvement_needed: number; unresolved_gap_over_horizon: number; note: string; title: string; no_discretionary_inference: string }
export interface TippingPoint { kind: string; max_bill_increase: number | null; absorbable_extra_per_month: number | null; note: string }
export interface ShockCashPoint { month: number; baseline: number; after_shock: number }
export interface ShockReport {
  account_id: number; baseline: ShockResult; shocked: ShockResult; verdict: Verdict; change_in_monthly_cash_flow: number
  upfront_cost: number; remaining_buffer: number; cash_path: ShockCashPoint[]
  explanation: { primary_driver: string; drivers: string[]; summary: string; contributions: Record<string, number> }
  goal_plan: GoalPlan; backup_plan: BackupPlan; tipping_point: TippingPoint; assumptions: string[]; warnings?: string[]
  applied_inputs: { income_fraction: number; bills_increase: number; one_off_cost: number; horizon_months: number; preset: string | null }
  ei_note: string
}
export interface ShockInputs { income_fraction: number; bills_increase: number; one_off_cost: number; horizon_months: number }
export interface PurchaseComparison {
  wait: ShockReport; buy: ShockReport; cash_preserved: number; extra_shortfall: number; recommendation: 'wait' | 'compare'
}

export function matchesShockInputs(report: ShockReport | null, accountId: number | null, inputs: ShockInputs): report is ShockReport {
  return report != null && report.account_id === accountId
    && report.applied_inputs.income_fraction === inputs.income_fraction
    && report.applied_inputs.bills_increase === inputs.bills_increase
    && report.applied_inputs.one_off_cost === inputs.one_off_cost
    && report.applied_inputs.horizon_months === inputs.horizon_months
}
export interface SimResult {
  spec: Record<string, unknown>; mode: string; calibration: string; months: number[]
  buffer_percentiles: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] }
  goal_fund_median: number[]; income_median: number[]; spending_median: number[]
  prob_below_zero_any: number; prob_below_zero_by_month: number[]; median_min_buffer: number; p10_min_buffer: number; median_end_buffer: number
  median_first_negative_month: number | null; deterministic_month_cash_runs_out: number | null
  goal_reached_share: number | null; goal_reached_month_median: number | null; goal_target: number; n_paths: number; disclaimer: string
}
export interface SimBundle { scenario: SimResult; deterministic: SimResult; baseline: SimResult }
export interface Branch { key: string; label: string; median_path: number[]; p10: number[]; p90: number[]; prob_below_zero_any: number; median_end_buffer: number; deterministic_end_buffer: number; deterministic_month_cash_runs_out: number | null }
export interface Strategy {
  action?: string; means?: string; needs_context?: string[]
  key: string; label: string; feasible: boolean; monthly_contribution: number; freed_up_per_month: number; emergency_floor: number
  prob_shortfall_under_stress: number; median_min_buffer: number; median_end_buffer: number; goal_progress_at_deadline: number
  goal_amount_at_deadline: number; months_to_goal_deterministic: number | null; goal_reached_share_mc: number | null
  buffer_median_path: number[]; goal_median_path: number[]; score: number; infeasible_reason: string | null
}
export interface Comparison {
  account_id: number; goal: { type: string; label: string; target_amount: number; target_months: number; source: string; assumption: string }
  stress_label: string; weights: { resilience: number; goal: number; reasons: string[] }; capacity_per_month: number; capacity_assumption: string
  emergency_target: number; strategies: Strategy[]; recommended: string; why: string; horizon_months: number
}
export interface ContextItem { id: string; value: Record<string, unknown>; source: string; confirmed: boolean; created_at: string; updated_at: string }
export interface Proposal { id: string; changes: { field: string; operation: string; value: Record<string, unknown> }[]; source: string; rationale: string; status: string; created_at: string }
export interface ContextDoc {
  account_id: number; goals: ContextItem[]; concerns: ContextItem[]; constraints: ContextItem[]; preferences: ContextItem[]; upcoming_events: ContextItem[]
  accepted_actions: ContextItem[]; completed_actions: ContextItem[]; proposals: Proposal[]; asked_questions: { key: string; at: string }[]
  conversation: { role: string; text: string; at: string; mode?: string }[]; strategy_snapshots: Snapshot[]; context_version: number; updated_at: string; identity_note: string
}
export interface ContextSummary { account_id: number; context_version: number; goals: Record<string, unknown>[]; concerns: Record<string, unknown>[]; constraints: Record<string, unknown>[]; preferences: Record<string, unknown>[]; upcoming_events: Record<string, unknown>[]; accepted_actions: Record<string, unknown>[]; pending_proposals: Proposal[]; asked_questions: string[] }
export interface Snapshot {
  id: string; at: string; context_version: number; recommended: string; recommended_label: string
  goal: Comparison['goal']; emergency_target: number; stress_label: string; weights: Comparison['weights']
  prob_shortfall_under_stress: number; months_to_goal: number | null; goal_progress_at_deadline: number; monthly_contribution: number
  buffer_median_path: number[]; goal_median_path: number[]; trigger?: string
}
export interface Diff { has_previous: boolean; materially_changed: boolean; reasons: string[]; changes: Record<string, { old: unknown; new: unknown; label: string }> }
export interface ReplanResult { account_id: number; comparison: Comparison; snapshot: Snapshot; previous: Snapshot | null; diff: Diff }
export interface ChatResponse {
  account_id: number; mode: string; reply: string
  extraction: { intent: string; proposed_changes: { field: string; operation: string; value: Record<string, unknown> }[]; requires_confirmation: boolean; follow_up_question: string | null; rationale: string }
  proposal: Proposal | null; tool_results: { tool: string; args?: Record<string, unknown>; result?: unknown }[]
  next_question: { key: string; text: string; value: number | null } | null; context: ContextSummary; notice: string | null
}
export interface Cohort {
  account_id: number; tolerance: number; n_peers: number; note?: string
  me?: { I: number; S: number; B: number; H: number; spending_ratio: number | null; runway_layoff: number | null; survives6_layoff: boolean; survives6_combined: boolean; buffer_months_of_spending: number | null }
  peers?: { median_S: number; median_B: number; median_H: number; median_spending_ratio: number; survive6_layoff_pct: number; survive6_combined_pct: number; median_runway_layoff_finite: number | null; median_buffer_months_of_spending: number }
  percentiles_within_cohort?: { buffer: number; spending: number; spending_ratio: number | null; runway_layoff: number }
  nearest_peers?: { account_id: number; I: number; S: number; B: number; spending_ratio: number | null; runway_layoff: number | null; survives6_layoff: boolean }[]
  runway_distribution_layoff?: { bucket: string; n: number }[]
}
export interface Research {
  available: boolean; headline?: string; opening_sentence?: string; accounts_total?: number; accounts_eligible_positive_inflow?: number
  population?: Record<string, number>; runs?: Record<string, Record<string, number | null>>
  survival_by_quartile?: Record<string, { quartile: string; n: number; survive6_pct: number; median_value: number }[]>
  survival_by_spending_ratio_band?: { band: string; n: number; survive6_pct: number }[]
  representative_pair?: Record<string, number | boolean | null>; variance_decomposition_layoff55?: Record<string, number | string>
  matching_rule?: string; note?: string
}
export interface PlanCandidate {
  action?: string; how?: string; means?: string; needs_context?: string[]; feasibility?: string
  label: string; source: 'grid' | 'strategist'
  levers: { freed_up_per_month: number; goal_contribution_per_month: number; emergency_floor: number; extra_income_per_month: number }
  prob_shortfall_under_stress: number; median_min_buffer: number; median_end_buffer: number
  goal_progress_at_deadline: number; goal_amount_at_deadline: number; months_to_goal_deterministic: number | null
  disruption: number; score: number; adjusted_score: number; buffer_median_path: number[]; goal_median_path: number[]
  flags: { risk: string; severity: string; because: string }[]; why?: string; evidence?: string; validation?: string[]
}
export interface PlanResult {
  account_id: number; mode: 'adk' | 'offline'
  framework: { name: string; available: boolean; model: string | null; agents: string[] }
  error: string | null
  request: { context_version: number; shock: { r: number; h: number; one_off: number; duration_months: number; label: string; official: Record<string, unknown>; verdict: Record<string, unknown> }; goal: Comparison['goal']; weights: Comparison['weights']; stress_need: number; horizon_months: number }
  objective: { formula: string; weights: Comparison['weights']; disruption_weight: number }
  grid_size: number; ranked: PlanCandidate[]; recommended: string | null; why: string | null; stay_the_course: PlanCandidate | null
  strategist: { levers?: Record<string, unknown>[]; raw?: string } | null
  challenger: { flags?: Record<string, unknown>[]; questions?: string[]; raw?: string } | null
  unmatched_flags: Record<string, unknown>[]; validation_notes: string[]
  tool_calls: { agent: string; tool: string; args: Record<string, unknown> }[]
  timing_seconds: { fan_out: number; total: number }; disclaimer: string
}
export interface InsightFlag { key: string; label: string; severity: 'info' | 'watch' | 'risk'; evidence: string; insight: string }
export interface Archetype {
  id: number; name: string; description: string; likely_life_stage: string; likely_occupation: string; confidence: number; evidence: string
  share: number; size: number; survive6_layoff_pct: number; naming_source: string
}
export interface Insights {
  decision_profile?: { life_profile?: LifeProfile; period: { from: string; to: string; months: number }; observations: { key: string; evidence: string; life_effect: string; question: string; unlocks: string; needs_answer: boolean; priority: number; source: string; period: { from: string; to: string; months: number } }[] }
  account_id: number; flags: InsightFlag[]; archetype: Archetype | null
  features: Record<string, { value: number | boolean | null; percentile?: number | null; doc?: string }>
  narrative: { headline: string; insights: { text: string; flag: string }[]; source: string }
  narrator_error?: string
}
export interface ArchetypeCluster {
  id: number; size: number; share: number; medians: Record<string, number | null>; survive6_layoff_pct: number; survive6_combined_pct: number
  median_runway_layoff: number; distinguishing: { feature: string; cluster_median: number; population_median: number; z: number }[]
  flag_prevalence: Record<string, number>; example_accounts: number[]
  name: string; description: string; likely_life_stage: string; likely_occupation: string; confidence: number; evidence: string
}
export interface ArchetypesDoc {
  k: number; method: string; features: string[]; naming_source: string; built_at: string; n_accounts: number; loaded_from?: string
  flag_catalog: { key: string; label: string; severity: string }[]; clusters: ArchetypeCluster[]
}
export interface HunterFinding { title: string; statement: string; evidence: string; strength: 'strong' | 'moderate' | 'weak'; caveat: string; effect?: number; recorded_after_call?: number }
export interface HunterDoc {
  mode: 'adk' | 'baseline'; model: string | null; ran_at: string; budget: number | null; tool_calls_made: number
  tool_log: { tool: string; args: Record<string, unknown> }[]; findings: HunterFinding[]; summary: string | null; best_finding: string | null
  seconds: number | null; n_accounts: number; baseline_findings?: unknown[]; loaded_from?: string
}
export interface FeatureSurvival { feature: string; meaning: string; bins: { range: string; n: number; survive6_layoff_pct: number; survive6_combined_pct: number }[] }
export interface RoadmapAction { action: string; amount: number | null; expected_effect: string; goal: string; tradeoffs: string; assumptions: string; review_trigger: string }
export interface Roadmap { account_id: number; this_week: RoadmapAction[]; this_month: RoadmapAction[]; next_three_months: RoadmapAction[]; next_year: RoadmapAction[]; long_term: RoadmapAction[]; summary: { goal: Comparison['goal']; recommended: string; layoff_verdict: string; goal_plan_note: string; capacity_per_month: number } }


// ------------------------------------------------------------------ agent run (SSE) and scenes
export interface RunwayParams { duration_months: number; buffer_start: number; income_before: number; income_after: number; spending_after: number; monthly_gap: number; runs_out_month: number | null; runway_label: string; verdict: string }
export interface FuturePath { label: string; prob_shortfall: number; buffer_path: number[]; months_to_goal: number | null; action?: string; means?: string; horizon?: 'now' | 'this month' | 'this year' | 'later' }
export interface LeverDial { freed_up_per_month: number; goal_contribution_per_month: number; emergency_floor: number; extra_income_per_month: number }
export interface TwoFuturesParams { goal: { label: string; target_amount: number; target_months: number }; stay: FuturePath; plan: FuturePath & { levers: LeverDial } }
export type HabitKind = 'timing' | 'fee' | 'creep' | 'transfer' | 'margin' | 'volatile' | 'loan' | 'none'
export interface HabitParams { flag: string; label: string; kind: HabitKind; evidence: string; numbers: Record<string, number> }
export interface LeverParams { lever_label: string; dial: LeverDial; before: { prob_shortfall: number; median_min_buffer: number }; after: { prob_shortfall: number; median_min_buffer: number }; typical_spending: number; action?: string; means?: string; horizon?: 'now' | 'this month' | 'this year' | 'later' }
export type Scene = { id: string; title: string; narration: string } & (
  | { type: 'runway'; params: RunwayParams }
  | { type: 'two_futures'; params: TwoFuturesParams }
  | { type: 'habit'; params: HabitParams }
  | { type: 'lever'; params: LeverParams })
export type StageName = 'freeze' | 'fan_out' | 'council' | 'validate' | 'rank' | 'explain'
export interface StageEvent { name: StageName; status: 'start' | 'done'; detail: string; seconds?: number; data?: Record<string, unknown> }
export interface AgentEvent { t: number; agent: 'strategist' | 'challenger' | 'explainer'; kind: 'tool_call' | 'tool_result' | 'text' | 'final'; tool?: string; args?: Record<string, unknown>; summary?: string }
export type RunEvent =
  | { type: 'insight'; data: Insights }
  | { type: 'stage'; data: StageEvent }
  | { type: 'agent'; data: AgentEvent }
  | { type: 'plan'; data: PlanResult }
  | { type: 'scenes'; data: { source: string; scenes: Scene[] } }
  | { type: 'done'; data: { seconds: number } }
  | { type: 'error'; data: { message: string } }
export interface HunterReplayStep { index: number; tool: string; args: Record<string, unknown>; finding?: HunterFinding }
// ------------------------------------------------------------------ narrated stage (Director storyboard)
export type VisualKind = 'picture' | 'cup' | 'river' | 'timeline' | 'fork' | 'calendar' | 'dial' | 'crowd' | 'ribbon' | 'cards' | 'math' | 'shuffle' | 'swarm' | 'podium' | 'actions' | 'none'
export type Horizon = 'now' | 'this month' | 'this year' | 'later'
/* Human fields the backend attaches to plan candidates: an imperative decision, what it does, and when. */
export interface HumanPlan { action?: string; means?: string; horizon?: Horizon }
export interface ActionItem { title: string; how: string; horizon: Horizon; effect: string; source: 'grid' | 'strategist' | 'habit' | 'future' }
export interface ActionsParams { headline: string; actions: ActionItem[] }
export interface PictureParams { inflow: number; outflow: number; buffer: number; months_of_spending: number; runway_label: string; headline?: string }
export interface CupParams { buffer: number; outflow: number; months_of_spending: number; label: string }
export interface RiverParams { inflow: number; outflow: number; surplus: number; parts_in: Record<string, number>; parts_out: Record<string, number> }
export interface TimelineParams { duration_months: number; income_before: number; income_after: number; spending_after: number; monthly_gap: number; buffer_start: number; runs_out_month: number | null; runway_label: string; verdict: string; events: { month: number; label: string }[] }
export interface CalendarParams { neg_months: number; timing_share: number; months: number }
export interface CrowdParams { n_total: number; archetype: { name: string; size: number; share: number; survive6_layoff_pct: number }; you: { survives6_layoff: boolean; runway_layoff: number | null } }
export interface RibbonParams { months: number; spending_drift_pm: number; income_drift_pm: number; inflow: number; outflow: number }
export interface CardsParams { cards: { key: 'layoff' | 'furnace' | 'combined' | 'random'; title: string; text: string }[] }
export interface MathParams { lines: string[] }
export interface ShuffleParams { deck: string[]; dealt: { key: string; title: string; text: string } }
export interface SwarmCandidate extends HumanPlan { label: string; source: 'grid' | 'strategist'; score: number; prob_shortfall: number; buffer_path: number[]; best: boolean; flags: number }
export interface SwarmParams { horizon_months: number; grid_size: number; candidates: SwarmCandidate[]; objective: string; weights: { resilience: number; goal: number } }
export interface PodiumEntry extends HumanPlan { rank: number; label: string; source: string; score: number; prob_shortfall: number; goal_progress: number; levers: LeverDial; flags: { risk: string; severity: string; because: string }[]; why: string }
export interface PodiumParams { top: PodiumEntry[]; objective: string; weights: { resilience: number; goal: number }; stay: { label: string; prob_shortfall: number; score: number } | null }
export type Beat = { id: string; caption: string; duration_s: number; emphasis?: string } & (
  | { visual: 'picture'; params: PictureParams }
  | { visual: 'cup'; params: CupParams }
  | { visual: 'river'; params: RiverParams }
  | { visual: 'timeline'; params: TimelineParams }
  | { visual: 'fork'; params: TwoFuturesParams }
  | { visual: 'calendar'; params: CalendarParams }
  | { visual: 'dial'; params: LeverParams }
  | { visual: 'crowd'; params: CrowdParams }
  | { visual: 'ribbon'; params: RibbonParams }
  | { visual: 'cards'; params: CardsParams }
  | { visual: 'math'; params: MathParams }
  | { visual: 'shuffle'; params: ShuffleParams }
  | { visual: 'swarm'; params: SwarmParams }
  | { visual: 'podium'; params: PodiumParams }
  | { visual: 'actions'; params: ActionsParams }
  | { visual: 'none'; params: Record<string, never> })
export interface Storyboard { opening: boolean; source: string; beats: Beat[]; card?: unknown }
export interface StageAgentEvent { t: number; agent: string; kind: 'tool_call' | 'tool_result' | 'text'; tool?: string; args?: Record<string, unknown>; summary?: string }
export interface StageMemoryEvent { proposal: Proposal | null; context: ContextSummary; next_question: { key: string; text: string } | null; reply?: string | null }
export interface StageHandoffEvent { t: number; from: string; to: string; title: string; items: string[] }
/** A twist card from the deck: the shock in the judges' terms (r, h, one-off in dollars or months of spending). */
export interface DeckCard { key: string; title: string; text: string; r: number; h: number; duration: number; one_off: number; one_off_months: number | null }
/** Our flags and the simulated layoff checked against loans that actually went bad (status B or D). */
export interface Validation {
  available: boolean; loans?: number; bad?: number; bad_rate_pct?: number
  by_flag?: { flag: string; n_with: number; bad_rate_with_pct: number; bad_rate_without_pct: number; lift: number }[]
  by_survival?: { fails_layoff_bad_rate_pct: number | null; survives_layoff_bad_rate_pct: number | null; n_fail: number; n_survive: number }
}
/** An agent in the system (the registry behind the Agents page). stage 0 = shared by every stage. symbol = icon key. */
export interface Persona { key: string; name: string; kind: 'ai' | 'code' | 'memory'; runs_on: string; role: string; reads: string[]; writes: string[]; guardrail: string; stage?: 0 | 1 | 2 | 3; symbol?: string; analogy?: string }

/* ---------------------------------------------------------------------------------------------------------------
   v2 contracts (docs/agents/v2-contracts.md): life personas, the profile change log, personal shocks, life plans,
   agent traces and the Stage 1 report. Backend owns the numbers; the frontend only draws them. */
export type GoalSize = 'small' | 'large'
export type GoalHorizon = 'short' | 'medium' | 'long'
/** A goal with its weight in the planning objective: weight = importance x horizon urgency, normalised to sum 1. */
export interface PersonaGoal {
  id: string; label: string; type: string; size: GoalSize; horizon: GoalHorizon
  target_amount: number; target_months: number; importance: number; weight: number
  why: string; evidence: string; source: 'persona' | 'conversation' | 'user'
  /** Tied to a specific signal in this account's records (a loan's end date, a lease, overdraft interest), not a general goal. */
  personal?: boolean
  /** One sentence in the persona's own (fictional) voice on why this goal matters to them. */
  quote?: string
}
export type GoalLens = 'balanced' | 'safety' | 'ambitious' | 'life' | 'habits'
/** A personal goal idea from the records, ranked through a lens. Amounts are code-set from the account's own figures. */
export interface GoalIdea extends Omit<PersonaGoal, 'weight'> {
  key: string; family: 'safety' | 'growth' | 'life' | 'habit'; relevance: number; signal: string; lens_score: number; in_profile: boolean; picked_by?: 'model'
  /** true: tied to a specific signal in this account's records; false: a general idea sized from its own numbers. */
  from_records?: boolean
}
export interface GoalIdeasResult {
  account_id: number; lens: GoalLens; lenses: Record<GoalLens, string>; ideas: GoalIdea[]
  /** With use_ai: the Persona Builder model's 3-5 picks (reworded; amounts unchanged) and a note on how it personalised. */
  model: { picks: GoalIdea[]; note: string; model: string } | null
}
/** Stage 1 Persona Builder: a realistic but fictional life for an anonymized account, consistent with its records. */
export interface LifePersona {
  account_id: number; fictional: true; source: string; built_at: string
  display_name: string; age: number | null; life_stage: string
  occupation: { label: string; confidence: number; evidence: string }
  household: string; home: string; story: string
  goals: PersonaGoal[]
  /** quote: one sentence in the persona's own (fictional) voice on why this worries them. */
  worries: { label: string; type: string; evidence: string; quote?: string }[]
  questions: { key: string; text: string; why: string }[]
  /** What makes this person unusual: a measure, its value, and where it sits among all accounts (0-100). */
  traits: { label: string; value: string; percentile: number | null; note: string }[]
  /** How they are like other people. */
  like_others: { archetype: string; share: number; survive6_layoff_pct: number; peers_n: number; note: string }
}
/** One entry in the profile's history. Agents update the profile directly; every change is logged and undoable. */
export interface ProfileChange {
  id: string; at: string; version: number; agent: string; kind: 'seed' | 'add' | 'update' | 'remove' | 'undo'
  field: string; label: string; before: unknown; after: unknown; reason: string; undone?: boolean
}
export interface ProfileDoc { account_id: number; persona: LifePersona | null; goals: PersonaGoal[]; context: ContextSummary; log: ProfileChange[]; version: number }
/** Stage 3 Shock Generator: shocks that fit this person's life, with numbers set by code from the account. */
export interface PersonalShock {
  key: string; title: string; text: string; r: number; h: number; one_off: number; duration: number
  category: 'income' | 'housing' | 'health' | 'family' | 'transport' | 'costs' | 'opportunity' | 'disaster' | 'economy' | 'political'
  likelihood: 'low' | 'medium' | 'high'; why_you: string; source: string
}
/** A step in a multi-step plan: a real-life decision active over a range of months. */
export interface PlanStep {
  month_start: number; month_end: number; decision: string; title: string; detail: string
  monthly_effect: number; one_off: number; category: 'income' | 'housing' | 'spending' | 'debt' | 'saving' | 'investing' | 'timing' | 'goal'
}
export interface GoalOutcome { goal_id: string; label: string; target: number; deadline_month: number; saved_at_deadline: number; progress: number; reached_month: number | null; weight: number }
/** Month-by-month result of following a plan under the shock. cash_path has horizon_months + 1 points. */
export interface PlanOutcome {
  cash_path: number[]; goal_paths: Record<string, number[]>; min_cash: number; months_covered: number
  shortfall_total: number; end_cash: number; goals: GoalOutcome[]; resilience: number; goal_score: number
}
/** Which objective a finalist won. Four finalists: one best on each axis, one best overall trade-off. */
export type PlanRole = 'best_shortfall' | 'best_resilience' | 'best_goals' | 'best_tradeoff' | 'least_disruption' | 'falls_short'
/** Why a step is in the plan: the insight it rests on and what it moves in the objective. */
export interface StepReason { step: number; because: string; evidence: string; moves: string }
export interface LifePlan {
  id: string; name: string; summary: string; why: string; steps: PlanStep[]; outcome: PlanOutcome; score: number
  /** No shortfall at any month of the horizon. */
  survives?: boolean; first_short_month?: number | null
  /** For role 'falls_short': why this plausible plan still runs out. */
  fails_because?: string
  /** shortfall is 0-1 where 1 = no uncovered shortfall at all (higher is better on every axis). */
  components: { resilience: number; goals: number; disruption: number; shortfall?: number }; pareto: boolean; source: 'catalog' | 'strategist' | 'baseline' | 'search'
  flags: { risk: string; severity: string; because: string }[]
  role?: PlanRole; role_label?: string
  /** Step-by-step justification grounded in Stage 1 insights and the objective. */
  reasoning?: StepReason[]
  /** Why this finalist beat the runners-up for its role. */
  versus?: string
}
/** One candidate from the Life Planner search, compact, for the screening visual. */
export interface SearchCandidate {
  id: string; name: string; decisions: string[]; resilience: number; goals: number; shortfall: number; disruption: number; score: number
  status: 'finalist' | 'pareto' | 'dominated' | 'screened'; reason?: string; round: number
}
/** The search the planners ran: generate many, screen infeasible, keep the Pareto set, pick four distinct finalists. */
export interface PlanSearch {
  generated: number; screened_out: number; feasible: number; pareto: number; finalists: number
  screens: { rule: string; removed: number }[]
  rounds: { round: number; agent: string; title: string; count: number }[]
  candidates: SearchCandidate[]
}
export interface LifePlanResult {
  account_id: number; shock: { label: string; r: number; h: number; one_off: number; duration: number }; horizon_months: number
  objective: { formula: string; weights: { resilience: number; goals: number; disruption: number; shortfall?: number }; goal_weights: { goal_id: string; label: string; weight: number; horizon: GoalHorizon; importance: number }[] }
  baseline: LifePlan; plans: LifePlan[]; recommended: string
  /** Up to three plausible plans that still run short, for contrast. */
  cautionary?: LifePlan[]; mode: 'adk' | 'offline'; trace: TraceEvent[]
  search?: PlanSearch
  /** 'shock' = respond to a shock; 'long_term' = a general multi-year plan toward the goals with no shock. */
  plan_mode?: 'shock' | 'long_term'; shock_starts_in?: number; trigger?: string
}
/** One run of the planners, kept so the person can see how their plans changed as their profile changed. */
export interface PlanHistoryEntry {
  id: string; at: string; trigger: string; plan_mode: 'shock' | 'long_term'; shock_label: string; profile_version: number
  goals: { label: string; weight: number }[]
  finalists: { role: PlanRole; role_label: string; name: string; decisions: string[]; score: number; components: { resilience: number; goals: number; disruption: number; shortfall?: number } }[]
  changed: string[]
}
/** The single finding most worth telling this person: ranked by severity, rarity across all accounts, and how unlikely
 *  they are to notice it themselves. Numbers come from the engine and the flag evidence. */
export interface Discovery {
  kind: 'flag' | 'demographic' | 'trait'; key: string; title: string; plain: string; evidence: string
  rarity: string; share: number | null; severity: 'risk' | 'watch' | 'info'; action: string; score: number; link: string
}
export interface DiscoveryResult { account_id: number; discovery: Discovery | null; runners_up: Discovery[]; method: string }
/** The bottom line for one account: time, money, perspective and control. Every item states its basis. */
export interface BenefitItem { label: string; text?: string; amount?: number; kind?: string; basis: string }
export interface Benefits {
  account_id: number; headline: string
  time: { hours_saved: number; pulp_seconds: number; basis: string; items: string[] }
  money: { per_year: number; items: (BenefitItem & { amount: number; kind: 'found in your records' })[]
    shock: { label: string; shortfall_without: number; shortfall_with_plan: number; avoided: number; plan: string | null; kind: 'if a layoff hits'; basis: string } }
  perspective: { count: number; headline: string; items: (BenefitItem & { text: string })[] }
  control: { runway_now_months: number; runway_with_plan_months: number; runway_gain_months: number; plans_tried: number; choices: number
    goals_with_dates: number; items: (BenefitItem & { text: string })[] }
  elapsed_ms: number
}
/** Shock Dealer: who reveals a twist card (a character id from a fixed cast) and, for the open slot, which scenario.
 *  IDs only; the card's amounts come from the deck and every result from the engine. source 'local' = no model ran. */
export interface DealCharacter { id: string; name: string; role: string }
export interface ShockDeal {
  slot: number; character: DealCharacter
  card: DeckCard & { category?: string; likelihood?: string; why_you?: string; source?: string }
  reason: string; source: string; ms: number
}
/** Demographic and location insights: the person's age, household and district against everyone else in the data. */
export interface DemographicInsight { key: string; title: string; plain: string; technical: string; value: string; compare: string; percentile: number | null; strength: 'strong' | 'moderate' | 'weak'; category: 'age' | 'household' | 'location' | 'economy' | 'banking' }
export interface Demographics {
  account_id: number
  person: { age: number | null; age_band: string; gender: string | null; owners: number; joint: boolean; card: string | null; account_years: number }
  district: { id: number; name: string; region: string; inhabitants: number; urban_ratio_pct: number; average_salary: number; unemployment_2022: number; unemployment_2023: number; entrepreneurs_per_1000: number; crimes_per_1000: number }
  insights: DemographicInsight[]
  /** Layoff survival and spending ratio by group, so the page can show where this person's groups sit. */
  groups: { dimension: 'age_band' | 'region' | 'urban' | 'unemployment_trend' | 'household'; label: string; n: number; survive6_layoff_pct: number; median_spend_ratio: number; mine: boolean }[]
  caveats: string[]
}
/** One observable step of an agent, for the Agents page and the panel's workflow column. */
export interface TraceEvent { t: number; stage: 1 | 2 | 3; agent: string; kind: 'start' | 'tool_call' | 'tool_result' | 'handoff' | 'output' | 'note'; title: string; to?: string; items?: string[]; data?: Record<string, unknown> }
export interface AgentTrace { account_id: number; stages: { stage: 1 | 2 | 3; title: string; summary: string; events: TraceEvent[] }[] }
/** One recorded agent run (a conversation turn, a persona build, a deck, a plan search, or the Stage 1 distillation). */
export interface AgentRunSummary {
  id: string; at: string | null; stage: 1 | 2 | 3; title: string; trigger: string; source: string
  n_events: number; duration_s: number; agents: string[]
}
/** A run with every event in order, for step-by-step replay and the raw log. */
export interface AgentRun extends AgentRunSummary { events: TraceEvent[] }
/** Extra server-sent events on /api/agent/stage (and voice pipeline_event): profile updates and life plans. */
export interface StageProfileEvent { changes: ProfileChange[]; context: ContextSummary; version: number; spoken: string }
export type StageLifePlansEvent = LifePlanResult
export type StageTraceEvent = TraceEvent
export interface ReportSection { heading: string; body: string; table?: { headers: string[]; rows: (string | number)[][] } }
export interface Stage1Report { generated_at: string; account_id: number | null; plain: { title: string; summary: string; sections: ReportSection[] }; technical: { title: string; summary: string; sections: ReportSection[] } }
export const API_BASE = BASE

// ------------------------------------------------------------------ calls
export const api = {
  overview: (id: number) => get<Overview>(`/api/customers/${id}/overview`),
  briefing: (id: number, period: 'daily' | 'weekly') => get<Briefing>(`/api/customers/${id}/briefing?period=${period}`),
  session: (id: number) => get<{ plan: PlanResult | null; context_version: number; stale: boolean }>(`/api/agent/session/${id}`),
  health: () => get<Health>('/api/health'),
  samples: () => get<{ accounts: SampleAccount[]; total_accounts: number; id_range: [number, number] }>('/api/accounts/sample?n=6'),
  profile: (id: number) => get<Profile>(`/api/customers/${id}`),
  history: (id: number) => get<{ history: HistoryRow[]; inflow_mix: Record<string, number>; outflow_mix: Record<string, number>; observed: { negative_balance_days: number; months_with_negative_days: number; min_balance: number } }>(`/api/customers/${id}/history`),
  cohort: (id: number) => get<Cohort>(`/api/customers/${id}/cohort`),
  research: () => get<Research>('/api/research/summary'),
  insights: (id: number, useAi = true) => get<Insights>(`/api/customers/${id}/insights?use_ai=${useAi}`),
  archetypes: () => get<ArchetypesDoc>('/api/research/archetypes'),
  hunter: () => get<HunterDoc>('/api/research/hunter'),
  featureSurvival: (feature: string, bins = 4) => get<FeatureSurvival>(`/api/research/features?feature=${encodeURIComponent(feature)}&bins=${bins}`),
  shock: (body: { account_id: number } & Partial<ShockInputs> & { preset?: string }) => post<ShockReport>('/api/shocks/calculate', body),
  comparePurchase: (body: { account_id: number; purchase_cost: number } & ShockInputs) => post<PurchaseComparison>('/api/shocks/compare-purchase', body),
  simulate: (body: { account_id: number; scenario: Record<string, unknown>; strategy?: Record<string, unknown> }) => post<SimBundle>('/api/scenarios/simulate', body),
  branches: (id: number, horizon = 24) => get<{ branches: Branch[]; horizon_months: number }>(`/api/scenarios/branches/${id}?horizon=${horizon}&n_paths=300`),
  compare: (id: number) => post<Comparison>('/api/strategies/compare', { account_id: id, n_paths: 300 }),
  roadmap: (id: number) => get<Roadmap>(`/api/roadmap/${id}`),
  context: (id: number) => get<{ context: ContextDoc; summary: ContextSummary; next_question: { key: string; text: string } | null }>(`/api/context/${id}`),
  resetContext: (id: number) => del<{ context: ContextDoc; summary: ContextSummary }>(`/api/context/${id}`),
  propose: (id: number, changes: { field: string; operation?: string; value: Record<string, unknown> }[]) => post<{ proposal: Proposal; summary: ContextSummary }>('/api/context/propose', { account_id: id, changes, source: 'user' }),
  confirm: (id: number, proposal_id: string, accept = true) => post<{ proposal: Proposal; applied: unknown[]; summary: ContextSummary; replan: ReplanResult | null }>('/api/context/confirm', { account_id: id, proposal_id, accept, replan: true }),
  edit: (id: number, change: { field: string; operation: string; value: Record<string, unknown>; target_id?: string }, replan = false) => post<{ applied: unknown; summary: ContextSummary; replan: ReplanResult | null }>('/api/context/edit', { account_id: id, change, replan }),
  chat: (id: number, message: string) => post<ChatResponse>('/api/agent/chat', { account_id: id, message }),
  personas: () => get<{ personas: Persona[] }>('/api/agent/personas'),
  deck: () => get<{ cards: DeckCard[] }>('/api/agent/deck'),
  validation: () => get<Validation>('/api/research/validation'),
  lifeProfile: (id: number) => get<ProfileDoc>(`/api/profile/${id}`),
  undoChange: (id: number, changeId: string) => post<ProfileDoc>(`/api/profile/${id}/undo/${changeId}`, {}),
  personalDeck: (id: number) => get<{ account_id: number; cards: PersonalShock[]; source: string }>(`/api/agent/deck?account_id=${id}`),
  planHistory: (accountId: number) => get<{ account_id: number; history: PlanHistoryEntry[] }>(`/api/plans/history/${accountId}`),
  /** slot 1-3 keep their official scenario (layoff, furnace, combined); slot 4 also deals the scenario. Prefetch the next deal
   *  right after a reveal (the model takes several seconds); if it is not ready within ~600 ms, call again with use_ai: false. */
  shockDealer: (body: { account_id?: number | null; slot: number; scenario?: string; exclude_character?: string | null; exclude_scenario?: string | null; use_ai?: boolean; pool?: 'personal' | 'deck' }) => post<ShockDeal>('/api/agent/shock-dealer', body),
  characters: () => get<{ characters: (DealCharacter & { fits: string[] })[] }>('/api/agent/characters'),
  discovery: (accountId: number) => get<DiscoveryResult>(`/api/customers/${accountId}/discovery`),
  goalIdeas: (accountId: number, lens: GoalLens = 'balanced', useAi = false) => get<GoalIdeasResult>(`/api/profile/${accountId}/goal-ideas?lens=${lens}&use_ai=${useAi}`),
  addGoalIdea: (accountId: number, ideaId: string, lens: GoalLens = 'balanced') => post<ProfileDoc>(`/api/profile/${accountId}/goals`, { idea_id: ideaId, lens }),
  benefits: (accountId: number) => get<Benefits>(`/api/customers/${accountId}/benefits`),
  demographics: (accountId: number) => get<Demographics>(`/api/insights/demographics/${accountId}`),
  lifePlans: (body: { account_id: number; income_fraction?: number; bills_increase?: number; one_off_cost?: number; shock_duration?: number; use_ai?: boolean; mode?: 'shock' | 'long_term'; shock_starts_in?: number; horizon_months?: number; trigger?: string }) => post<LifePlanResult>('/api/agent/life-plans', body),
  agentTrace: (id: number) => get<AgentTrace>(`/api/agents/trace/${id}`),
  agentRuns: (id: number) => get<{ account_id: number; runs: AgentRunSummary[] }>(`/api/agents/runs/${id}`),
  agentRun: (id: number, runId: string) => get<AgentRun>(`/api/agents/runs/${id}/${encodeURIComponent(runId)}`),
  stage1Report: (id?: number | null) => get<Stage1Report>(`/api/report/stage1${id ? `?account_id=${id}` : ''}`),
  plan: (body: { account_id: number; income_fraction: number; bills_increase: number; one_off_cost: number; shock_duration: number; use_ai: boolean }) => post<PlanResult>('/api/agent/plan', body),
  replan: (id: number, reason = 'manual replan') => post<ReplanResult>('/api/replan', { account_id: id, reason }),
  replanDiff: (id: number) => get<{ has_previous: boolean; current: Snapshot | null; previous: Snapshot | null; diff: Diff | null; note?: string }>(`/api/replan/${id}/diff`),
}
