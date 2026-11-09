import { create } from 'zustand'
import { api, ApiError, type DeckCard, type Profile, type ShockInputs, type ShockReport, type ContextSummary, type ReplanResult, type PlanResult } from '../services/api'

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
  shockHasHappened: boolean
  context: ContextSummary | null
  lastReplan: ReplanResult | null
  accessible: boolean
  geminiConfigured: boolean | null
  aiLabel: string
  loadAccount: (id: number) => Promise<void>
  /** Switch from the loaded account to another. The current account stays until the new one has loaded,
   *  so an unknown ID leaves the user where they were. Resolves to an error message, or null once switched.
   *  With no account loaded it loads the ID and resolves to its error (which is then not also kept as profileError). */
  switchAccount: (id: number) => Promise<string | null>
  clearAccount: () => void
  /** The last persona name the header saw for an account, kept while the profile doc refetches so the account chip
   *  does not drop "· Élise" between pages. Keyed by account; cleared on sign-out. */
  personaName: { id: number; name: string } | null
  rememberPersona: (id: number, name: string) => void
  setInputs: (p: Partial<ShockInputs>, preset?: string | null) => void
  setShockHasHappened: (value: boolean) => void
  applyPreset: (key: string) => void
  runShock: () => Promise<void>
  refreshContext: () => Promise<void>
  setLastReplan: (r: ReplanResult | null) => void
  setAccessible: (v: boolean) => void
  setGemini: (v: boolean, label?: string) => void
  /** The Pulp side panel (conversation, voice and agents). A seed is sent as the first message when it opens. */
  pulpOpen: boolean
  pulpSeed: string | null
  openPulp: (seed?: string) => void
  closePulp: () => void
  takePulpSeed: () => string | null
  /** Put a twist card's shock into the official calculator and run it. */
  applyCard: (card: DeckCard) => void
}

const ACCOUNT_KEY = 'pulp.account'
const DEFAULT_INPUTS: ShockInputs = { income_fraction: 0.55, bills_increase: 0, one_off_cost: 0, horizon_months: 6 }
const EMPTY_ACCOUNT = {
  accountId: null,
  profile: null,
  loadingProfile: false,
  profileError: null,
  activePlan: null,
  planStale: false,
  shockInputs: DEFAULT_INPUTS,
  activePreset: 'layoff',
  shock: null,
  shockLoading: false,
  shockError: null,
  shockHasHappened: false,
  context: null,
  lastReplan: null,
}

const PERSONA_KEY = 'pulp.persona'
function readSavedPersona(): { id: number; name: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(PERSONA_KEY) ?? 'null')
    return v && Number.isSafeInteger(v.id) && typeof v.name === 'string' && v.name ? { id: v.id, name: v.name } : null
  } catch {
    return null
  }
}

export function readSavedAccount(): number | null {
  try {
    const saved = localStorage.getItem(ACCOUNT_KEY)
    const id = Number(saved)
    return saved && /^\d+$/.test(saved) && Number.isSafeInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

let accountRequest = 0
let shockRequest = 0

export const useApp = create<AppState>((set, get) => ({
  ...EMPTY_ACCOUNT,
  personaName: readSavedPersona(),
  rememberPersona: (id, name) => {
    if (get().personaName?.id === id && get().personaName?.name === name) return
    try { localStorage.setItem(PERSONA_KEY, JSON.stringify({ id, name })) } catch { /* ignore */ }
    set({ personaName: { id, name } })
  },
  refreshSession: async () => {
    const id = get().accountId
    if (!id) return
    const request = accountRequest
    const lastInputs = get().shockInputs
    const r = await api.session(id)
    if (request !== accountRequest || get().accountId !== id) return
    const sh = r.plan?.request.shock
    set({ activePlan: r.plan, planStale: r.stale })
    if (sh && get().shockInputs === lastInputs) {
      set({ shockInputs: { income_fraction: sh.r, bills_increase: sh.h, one_off_cost: sh.one_off, horizon_months: sh.duration_months }, activePreset: null })
    }
    await get().refreshContext()
  },
  accessible: (() => { try { return localStorage.getItem('pulp.accessible') === '1' } catch { return false } })(),
  geminiConfigured: null,
  aiLabel: 'offline companion',

  loadAccount: async (id) => {
    const request = ++accountRequest
    ++shockRequest
    set({ ...EMPTY_ACCOUNT, loadingProfile: true })
    try {
      const profile = await api.profile(id)
      if (request !== accountRequest) return
      try { localStorage.setItem(ACCOUNT_KEY, String(id)) } catch { /* ignore */ }
      set({ accountId: id, profile, loadingProfile: false })
      await Promise.all([get().refreshContext(), get().runShock()])
    } catch (e) {
      if (request !== accountRequest) return
      const msg = e instanceof ApiError && e.status > 0 && e.status < 500
        ? e.message : 'Couldn’t load this demo account. Try again.'
      set({ loadingProfile: false, profileError: msg, accountId: null, profile: null })
    }
  },
  switchAccount: async (id) => {
    if (!get().accountId) {
      // Nothing to keep: load it, and hand any error back to the caller to show where the ID was typed.
      const request = accountRequest + 1
      await get().loadAccount(id)
      const failure = request === accountRequest ? get().profileError : null
      if (failure) set({ profileError: null })
      return failure
    }
    const request = ++accountRequest
    set({ loadingProfile: true, profileError: null })
    try {
      const profile = await api.profile(id)
      if (request !== accountRequest) return null
      try { localStorage.setItem(ACCOUNT_KEY, String(id)) } catch { /* ignore */ }
      ++shockRequest
      set({ ...EMPTY_ACCOUNT, accountId: id, profile })
      void Promise.all([get().refreshContext(), get().runShock()])
      return null
    } catch (e) {
      if (request !== accountRequest) return null
      set({ loadingProfile: false })
      return e instanceof ApiError && e.status > 0 && e.status < 500
        ? e.message : 'Couldn’t load this demo account. Try again.'
    }
  },
  clearAccount: () => {
    ++accountRequest
    ++shockRequest
    try { localStorage.removeItem(ACCOUNT_KEY); localStorage.removeItem(PERSONA_KEY) } catch { /* ignore */ }
    set({ ...EMPTY_ACCOUNT, personaName: null })
  },
  setInputs: (p, preset = null) => set((s) => ({ shockInputs: { ...s.shockInputs, ...p }, activePreset: preset })),
  setShockHasHappened: (shockHasHappened) => set({ shockHasHappened }),
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
    const request = accountRequest
    try {
      const r = await api.context(accountId)
      if (request === accountRequest && get().accountId === accountId) set({ context: r.summary })
    } catch { /* context is optional */ }
  },
  setLastReplan: (r) => {
    if (!r || r.account_id === get().accountId) set({ lastReplan: r })
  },
  setAccessible: (v) => { try { localStorage.setItem('pulp.accessible', v ? '1' : '0') } catch { /* ignore */ } set({ accessible: v }) },
  setGemini: (v, label) => set({ geminiConfigured: v, aiLabel: label ?? (v ? 'Gemini companion' : 'offline companion') }),
  pulpOpen: false,
  pulpSeed: null,
  openPulp: (seed) => set({ pulpOpen: true, pulpSeed: seed ?? null }),
  closePulp: () => set({ pulpOpen: false }),
  takePulpSeed: () => { const seed = get().pulpSeed; if (seed) set({ pulpSeed: null }); return seed },
  applyCard: (card) => {
    const S = get().profile?.typical_spending ?? 0
    const one_off = card.one_off_months != null ? card.one_off_months * S : card.one_off
    set({ shockInputs: { income_fraction: card.r, bills_increase: card.h, one_off_cost: one_off, horizon_months: card.duration }, activePreset: card.key in PRESETS ? card.key : null })
    void get().runShock()
  },
}))
