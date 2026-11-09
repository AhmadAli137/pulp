import { create } from 'zustand'

/** The empty state's account ID field. With no account loaded, the header's chip leads here instead of opening a second form. */
export const PICKER_FIELD_ID = 'picker-account-id'

interface PickerState {
  /** How many empty states (DemoAccountPicker) are on screen; at most one in practice. */
  mounted: number
  /** When focus was last asked to move to the empty state's field (e.g. right after signing out), so a picker that mounts soon after takes it. */
  focusAskedAt: number
  mount: () => () => void
  askFocus: () => void
  takeFocus: () => boolean
}

export const usePicker = create<PickerState>((set, get) => ({
  mounted: 0,
  focusAskedAt: 0,
  mount: () => {
    set((s) => ({ mounted: s.mounted + 1 }))
    return () => set((s) => ({ mounted: Math.max(0, s.mounted - 1) }))
  },
  askFocus: () => set({ focusAskedAt: Date.now() }),
  takeFocus: () => {
    const asked = get().focusAskedAt
    if (!asked) return false
    set({ focusAskedAt: 0 })
    return Date.now() - asked < 5000
  },
}))

/** Bring the empty state's ID field into view and focus it. Returns false when there is none on screen. */
export function focusPickerField(): boolean {
  const field = document.getElementById(PICKER_FIELD_ID)
  if (!(field instanceof HTMLInputElement)) return false
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  field.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  field.focus({ preventScroll: true })
  return true
}
