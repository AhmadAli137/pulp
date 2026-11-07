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
export interface Health { ok: boolean; accounts: number; data_dir: string; gemini_configured: boolean; gemini_model: string | null }
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
export interface ShockReport {
  account_id: number; baseline: ShockResult; shocked: ShockResult; verdict: Verdict; change_in_monthly_cash_flow: number
  upfront_cost: number; remaining_buffer: number
  explanation: { primary_driver: string; drivers: string[]; summary: string; contributions: Record<string, number> }
  goal_plan: GoalPlan; backup_plan: BackupPlan; tipping_point: TippingPoint; assumptions: string[]
  applied_inputs: { income_fraction: number; bills_increase: number; one_off_cost: number; horizon_months: number; preset: string | null }
  ei_note: string
}
export interface ShockInputs { income_fraction: number; bills_increase: number; one_off_cost: number; horizon_months: number }
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
export interface RoadmapAction { action: string; amount: number | null; expected_effect: string; goal: string; tradeoffs: string; assumptions: string; review_trigger: string }
export interface Roadmap { account_id: number; this_week: RoadmapAction[]; this_month: RoadmapAction[]; next_three_months: RoadmapAction[]; next_year: RoadmapAction[]; long_term: RoadmapAction[]; summary: { goal: Comparison['goal']; recommended: string; layoff_verdict: string; goal_plan_note: string; capacity_per_month: number } }

// ------------------------------------------------------------------ calls
export const api = {
  health: () => get<Health>('/api/health'),
  samples: () => get<{ accounts: SampleAccount[]; total_accounts: number; id_range: [number, number] }>('/api/accounts/sample?n=6'),
  profile: (id: number) => get<Profile>(`/api/customers/${id}`),
  history: (id: number) => get<{ history: HistoryRow[]; inflow_mix: Record<string, number>; outflow_mix: Record<string, number>; observed: { negative_balance_days: number; months_with_negative_days: number; min_balance: number } }>(`/api/customers/${id}/history`),
  cohort: (id: number) => get<Cohort>(`/api/customers/${id}/cohort`),
  research: () => get<Research>('/api/research/summary'),
  shock: (body: { account_id: number } & Partial<ShockInputs> & { preset?: string }) => post<ShockReport>('/api/shocks/calculate', body),
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
  replan: (id: number, reason = 'manual replan') => post<ReplanResult>('/api/replan', { account_id: id, reason }),
  replanDiff: (id: number) => get<{ has_previous: boolean; current: Snapshot | null; previous: Snapshot | null; diff: Diff | null; note?: string }>(`/api/replan/${id}/diff`),
}
