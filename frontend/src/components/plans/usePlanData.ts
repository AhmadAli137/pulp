/* Data for the plan views. Each hook asks the API first and uses it whenever it answers; while an endpoint is not
   there yet it falls back to the preview fixtures, which the views label as a preview. Live results are cached per
   request so switching pages does not re-run the planners. */
import { useEffect, useState } from 'react'
import { api, type PlanHistoryEntry, type ShockInputs } from '../../services/api'
import { useApp } from '../../stores/useApp'
import { isMock } from './fixtures'
import { mockPlanHistory, mockPlanSearch, type FullResult } from './searchFixture'

export interface PlanQuery { mode: 'shock' | 'long_term'; inputs?: ShockInputs; happened?: boolean; label?: string; trigger?: string }

const live = new Map<string, FullResult>()
const inflight = new Map<string, Promise<FullResult>>()

function keyOf(id: number, q: PlanQuery) {
  const i = q.inputs
  return q.mode === 'long_term' ? `${id}|lt` : `${id}|s|${i?.income_fraction}|${i?.bills_increase}|${i?.one_off_cost}|${i?.horizon_months}|${q.happened ? 1 : 0}`
}

export function useLifePlans(accountId: number | null, q: PlanQuery, enabled = true) {
  const profile = useApp((s) => s.profile)
  const key = accountId ? keyOf(accountId, q) : ''
  const [state, setState] = useState<{ key: string; result: FullResult | null; loading: boolean }>({ key: '', result: null, loading: false })
  useEffect(() => {
    if (!enabled || !accountId) return
    const cached = live.get(key)
    if (cached) { setState({ key, result: cached, loading: false }); return }
    let alive = true
    setState((s) => ({ key, result: s.key === key ? s.result : null, loading: true }))
    const i = q.inputs
    const request = inflight.get(key) ?? api.lifePlans(q.mode === 'long_term'
      ? { account_id: accountId, mode: 'long_term', horizon_months: 60, trigger: q.trigger }
      : { account_id: accountId, mode: 'shock', income_fraction: i?.income_fraction, bills_increase: i?.bills_increase, one_off_cost: i?.one_off_cost, shock_duration: i?.horizon_months, shock_starts_in: q.happened ? 1 : undefined, trigger: q.trigger }) as Promise<FullResult>
    inflight.set(key, request)
    request
      .then((r) => { live.set(key, r); if (alive) setState({ key, result: r, loading: false }) })
      .catch(() => {
        if (!alive) return
        const r = mockPlanSearch(accountId, profile, q.mode === 'long_term'
          ? { mode: 'long_term', r: 1, h: 0, oneOff: 0, duration: 0, startsIn: 1, horizon: 60, trigger: q.trigger }
          : { mode: 'shock', r: i?.income_fraction ?? 0.55, h: i?.bills_increase ?? 0, oneOff: i?.one_off_cost ?? 0, duration: i?.horizon_months ?? 6, startsIn: q.happened ? 1 : 3, label: q.label, trigger: q.trigger })
        setState({ key, result: r, loading: false })
      })
      .finally(() => inflight.delete(key))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, profile?.account_id])
  const result = state.key === key ? state.result : null
  return { result, loading: state.loading || (enabled && !!accountId && state.key !== key), live: !!result && !isMock(result) }
}

/** The planners' run history, newest first; refreshed when the window regains focus. */
export function usePlanHistory(accountId: number | null, bump: unknown = null) {
  const profile = useApp((s) => s.profile)
  const [state, setState] = useState<{ id: number | null; history: PlanHistoryEntry[] | null; live: boolean }>({ id: null, history: null, live: false })
  useEffect(() => {
    if (!accountId) return
    let alive = true
    const load = () => api.planHistory(accountId)
      .then((r) => { if (alive) setState({ id: accountId, history: r.history, live: true }) })
      .catch(() => { if (alive) setState({ id: accountId, history: [...mockPlanHistory(accountId, profile)], live: false }) })
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => { alive = false; window.removeEventListener('focus', onFocus) }
  }, [accountId, profile, bump])
  return state.id === accountId ? state : { id: accountId, history: null, live: false }
}
