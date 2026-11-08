/* Simple view (default) shows each page's main answer; Full detail shows everything. Within Simple view, one
   "Show full detail" click reveals the rest of the current page only. */
import { create } from 'zustand'

export type ViewMode = 'simple' | 'full'
const KEY = 'pulp.view'

function readView(): ViewMode {
  try { return localStorage.getItem(KEY) === 'full' ? 'full' : 'simple' } catch { return 'simple' }
}

interface ViewState {
  view: ViewMode
  revealed: boolean
  setView: (v: ViewMode) => void
  reveal: () => void
  resetReveal: () => void
}

export const useView = create<ViewState>((set) => ({
  view: readView(),
  revealed: false,
  setView: (view) => { try { localStorage.setItem(KEY, view) } catch { /* ignore */ } set({ view, revealed: false }) },
  reveal: () => set({ revealed: true }),
  resetReveal: () => set({ revealed: false }),
}))

export const useShowDetail = () => useView((s) => s.view === 'full' || s.revealed)
