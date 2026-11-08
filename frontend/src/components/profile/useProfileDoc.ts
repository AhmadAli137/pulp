/* The account's life profile (GET /api/profile/{id}). Live whenever the endpoint answers, otherwise a preview built
   from the records. Optionally polls every 10 s while the page is visible and refreshes when the window regains focus,
   so changes agents make in conversation show up without a reload. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ProfileDoc } from '../../services/api'
import { useApp } from '../../stores/useApp'
import { mockProfileDoc, mockUndo } from '../plans/fixtures'

const cache = new Map<number, { doc: ProfileDoc; live: boolean }>()

export function useProfileDoc(accountId: number | null, { poll = false }: { poll?: boolean } = {}) {
  const profile = useApp((s) => s.profile)
  const [state, setState] = useState<{ id: number | null; doc: ProfileDoc | null; live: boolean; error: string | null }>(() => {
    const c = accountId ? cache.get(accountId) : undefined
    return { id: accountId, doc: c?.doc ?? null, live: c?.live ?? false, error: null }
  })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const load = useCallback(async () => {
    if (!accountId) return
    try {
      const doc = await api.lifeProfile(accountId)
      cache.set(accountId, { doc, live: true })
      if (alive.current) setState({ id: accountId, doc, live: true, error: null })
    } catch {
      const prev = cache.get(accountId)
      if (prev?.live) { if (alive.current) setState({ id: accountId, doc: prev.doc, live: true, error: 'Could not refresh the profile just now.' }); return }
      const doc = mockProfileDoc(accountId, profile)
      cache.set(accountId, { doc, live: false })
      if (alive.current) setState({ id: accountId, doc, live: false, error: null })
    }
  }, [accountId, profile])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!poll || !accountId) return
    const tick = () => { if (document.visibilityState === 'visible') void load() }
    const t = setInterval(tick, 10_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
  }, [poll, accountId, load])
  const undo = useCallback(async (changeId: string) => {
    if (!accountId) return
    if (state.live) {
      const doc = await api.undoChange(accountId, changeId)
      cache.set(accountId, { doc, live: true })
      setState({ id: accountId, doc, live: true, error: null })
    } else {
      const doc = mockUndo(accountId, changeId)
      if (doc) { cache.set(accountId, { doc, live: false }); setState({ id: accountId, doc, live: false, error: null }) }
    }
  }, [accountId, state.live])
  const current = state.id === accountId ? state : { id: accountId, doc: null, live: false, error: null }
  return { ...current, refresh: load, undo }
}
