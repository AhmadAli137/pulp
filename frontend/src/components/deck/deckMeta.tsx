/* Shared labels, groups and icons for the personal deck (the Shock Generator's cards for this person). */
import { Briefcase, Car, CloudLightning, Globe2, HeartPulse, Home, Receipt, Sparkles, TrendingDown, Users } from 'lucide-react'
import type { ComponentType } from 'react'

export type DeckGroup = 'life' | 'money' | 'world' | 'disaster'

export const CATEGORY: Record<string, { label: string; group: DeckGroup; Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }> }> = {
  income: { label: 'Income', group: 'money', Icon: Briefcase },
  costs: { label: 'Costs', group: 'money', Icon: Receipt },
  opportunity: { label: 'Opportunity', group: 'money', Icon: Sparkles },
  housing: { label: 'Housing', group: 'life', Icon: Home },
  health: { label: 'Health', group: 'life', Icon: HeartPulse },
  family: { label: 'Family', group: 'life', Icon: Users },
  transport: { label: 'Transport', group: 'life', Icon: Car },
  economy: { label: 'Economy', group: 'world', Icon: TrendingDown },
  political: { label: 'World events', group: 'world', Icon: Globe2 },
  disaster: { label: 'Natural disaster', group: 'disaster', Icon: CloudLightning },
}

export const GROUPS: { key: DeckGroup; label: string }[] = [
  { key: 'life', label: 'Life' },
  { key: 'money', label: 'Money' },
  { key: 'world', label: 'World events' },
  { key: 'disaster', label: 'Disasters' },
]

export const groupOf = (category?: string): DeckGroup => CATEGORY[category ?? '']?.group ?? 'money'

/** Who brings a card the person picked by hand: the scenario's natural messenger, never the one just shown. */
const BY_KEY: Record<string, string> = {
  layoff: 'manager', hours_cut: 'manager', client_loss: 'client', slow_season: 'client', rent_up: 'landlord', roommate_leaves: 'landlord',
  moving: 'landlord', furnace: 'technician', home_repair: 'technician', car: 'mechanic', car_repair: 'mechanic', health: 'doctor',
  sick_leave: 'doctor', dental: 'dentist', vet: 'vet', parental: 'midwife', rate_reset: 'banker', bills_inflation: 'meter_reader',
  pension_lag: 'meter_reader', holidays: 'meter_reader', job_offer: 'recruiter', family_help: 'relative', wildfire: 'emergency_official',
  flood: 'emergency_official', ice_storm: 'emergency_official', recession: 'economist', tariffs: 'economist', inflation_spike: 'economist',
  market_drop: 'economist', conflict: 'reporter', public_cuts: 'reporter', strike: 'reporter', lockdown: 'health_officer', fraud: 'banker',
}
const BY_CATEGORY: Record<string, string> = {
  income: 'manager', costs: 'meter_reader', opportunity: 'recruiter', housing: 'landlord', health: 'doctor', family: 'relative',
  transport: 'mechanic', economy: 'economist', political: 'reporter', disaster: 'emergency_official',
}
export function messengerFor(key: string, category: string | undefined, exclude: string | null): string {
  const pick = BY_KEY[key.replace(/^p_/, '')] ?? BY_CATEGORY[category ?? ''] ?? 'manager'
  if (pick !== exclude) return pick
  return ['relative', 'reporter', 'economist', 'client'].find((c) => c !== exclude) ?? 'manager'
}
export const nameOf = (id: string) => `The ${id.replace(/_/g, ' ').replace(/\b\w/g, (c, i) => (i === 0 ? c.toUpperCase() : c))}`

export function Likelihood({ level }: { level?: string }) {
  const n = level === 'high' ? 3 : level === 'medium' ? 2 : level === 'low' ? 1 : 0
  if (!n) return null
  return (
    <span className="deck-likely" title={`${level} likelihood for you`} aria-label={`${level} likelihood`}>
      {[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  )
}
