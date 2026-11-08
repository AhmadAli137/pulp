import { create } from 'zustand'
import { api, ApiError, type Profile, type ShockInputs, type ShockReport, type ContextSummary, type ReplanResult, type PlanResult } from '../services/api'

export const PRESETS: Record<string, { label: string; hint: string; inputs: Partial<ShockInputs>; oneOffMonths?: number }> = {
  baseline: { label: 'Baseline', hint: 'No shock', inputs: { income_fraction: 1, bills_increase: 0, one_off_cost: 0, horizon_months: 6 } },
  layoff: { label: 'Layoff, EI at 55%', hint: '6 months', inputs: { income_fraction: 0.55, bills_increase: 0, one_off_cost: 0, horizon_months: 6 } },
  furnace: { label: 'Furnace repair', hint: 'One month of typical spending, paid once', inputs: { income_fraction: 1, bills_increase: 0, horizon_months: 6 }, oneOffMonths: 1 },
  combined: { label: 'Layoff + bills up 15%', hint: 'Same month', inputs: { income_fraction: 0.55, bills_increase: 0.15, one_off_cost: 0, horizon_months: 6 } },
}

interface AppState {
  activePlan: PlanResult | null
  planStale: boolean
  refreshSession: () => Promise<void>
  accountId: number | null
  profile: Profile | null
  loadingProfile: boolean
  profileError: string | null
  shockInputs: ShockInputs
  activePreset: string | null
  shock: ShockReport | null
  shockLoading: boolean
  shockError: string | null
  context: ContextSummary | null
  lastReplan: ReplanResult | null
  accessible: boolean
  geminiConfigured: boolean | null
  aiLabel: string
  loadAccount: (id: number) => Promise<void>
  clearAccount: () => void
  setInputs: (p: Partial<ShockInputs>, preset?: string | null) => void
  applyPreset: (key: string) => void
  runShock: () => Promise<void>
  refreshContext: () => Promise<void>
  setLastReplan: (r: ReplanResult | null) => void
  setAccessible: (v: boolean) => void
  setGemini: (v: boolean, label?: string) => void
}

const DEFAULT_INPUTS: ShockInputs = { income_fraction: 0.55, bills_increase: 0, one_off_cost: 0, horizon_months: 6 }

let accountRequest = 0
let shockRequest = 0

export const useApp = create<AppState>((set, get) => ({
  activePlan: null,
  planStale: false,
  refreshSession: async () => {
    const id = get().accountId
    if (!id) return
    const r = await api.session(id)
    if (get().accountId !== id) return
    const sh = r.plan?.request.shock
    set({ activePlan: r.plan, planStale: r.stale, ...(sh ? { shockInputs: { income_fraction: sh.r, bills_increase: sh.h, one_off_cost: sh.one_off, horizon_months: sh.duration_months }, activePreset: null } : {}) })
    await get().refreshContext()
  },
  accountId: null,
  profile: null,
  loadingProfile: false,
  profileError: null,
  shockInputs: DEFAULT_INPUTS,
  activePreset: 'layoff',
  shock: null,
  shockLoading: false,
  shockError: null,
  context: null,
  lastReplan: null,
  accessible: (() => { try { return localStorage.getItem('pulp.accessible') === '1' } catch { return false } })(),
  geminiConfigured: null,
  aiLabel: 'offline companion',

  loadAccount: async (id) => {
    const request = ++accountRequest
    ++shockRequest
    set({ activePlan: null, planStale: false, loadingProfile: true, profileError: null, accountId: null, profile: null, context: null, shock: null, lastReplan: null })
    try {
      const profile = await api.profile(id)
      if (request !== accountRequest) return
      set({ accountId: id, profile, loadingProfile: false })
      try { localStorage.setItem('pulp.account', String(id)) } catch { /* ignore */ }
      await get().refreshSession()
      await get().runShock()
      await get().refreshContext()
    } catch (e) {
      if (request !== accountRequest) return
      const msg = e instanceof ApiError ? e.message : 'Unexpected error'
      set({ loadingProfile: false, profileError: msg, accountId: null, profile: null })
    }
  },
  clearAccount: () => { ++accountRequest; ++shockRequest; set({ accountId: null, profile: null, shock: null, context: null, lastReplan: null, profileError: null }) },
  setInputs: (p, preset = null) => set((s) => ({ shockInputs: { ...s.shockInputs, ...p }, activePreset: preset })),
  applyPreset: (key) => {
    const p = PRESETS[key]
    const prof = get().profile
    const one_off = p.oneOffMonths != null && prof ? p.oneOffMonths * prof.typical_spending : (p.inputs.one_off_cost ?? 0)
    set((s) => ({ shockInputs: { ...s.shockInputs, ...p.inputs, one_off_cost: one_off }, activePreset: key }))
    void get().runShock()
  },
  runShock: async () => {
    const { accountId, shockInputs } = get()
    if (!accountId) return
    const request = ++shockRequest
    set({ shockLoading: true, shockError: null })
    try {
      const shock = await api.shock({ account_id: accountId, ...shockInputs })
      if (request !== shockRequest || get().accountId !== accountId) return
      set({ shock, shockLoading: false })
    } catch (e) {
      if (request !== shockRequest || get().accountId !== accountId) return
      set({ shockLoading: false, shockError: e instanceof ApiError ? e.message : 'Calculation failed' })
    }
  },
  refreshContext: async () => {
    const { accountId } = get()
    if (!accountId) return
    try {
      const r = await api.context(accountId)
      if (get().accountId === accountId) set({ context: r.summary })
    } catch { /* context is optional */ }
  },
  setLastReplan: (r) => set({ lastReplan: r }),
  setAccessible: (v) => { try { localStorage.setItem('pulp.accessible', v ? '1' : '0') } catch { /* ignore */ } set({ accessible: v }) },
  setGemini: (v, label) => set({ geminiConfigured: v, aiLabel: label ?? (v ? 'Gemini companion' : 'offline companion') }),
}))
