/* One place that decides which small symbol goes with which kind of thing (a worry, a question, a goal, a plan step),
   so every page shows the same icon for the same idea. Unknown kinds get a neutral dot. */
import {
  Armchair, ArrowRightLeft, Briefcase, Calendar, CalendarClock, Car, Circle, Gift, GraduationCap, HandCoins, HeartHandshake, Home, Landmark,
  LifeBuoy, PiggyBank, Plane, Receipt, Repeat, Shield, ShoppingBag, Sprout, Target, TrendingDown, TrendingUp, Umbrella, Wallet, Waves,
  BookOpen, Activity, Coins, type LucideIcon,
} from 'lucide-react'

export type SymbolTone = 'green' | 'orange' | 'red' | 'blue' | 'neutral'
export interface Symbol { Icon: LucideIcon; tone: SymbolTone }

const S = (Icon: LucideIcon, tone: SymbolTone = 'green'): Symbol => ({ Icon, tone })
const NEUTRAL = S(Circle, 'neutral')

const WORRIES: Record<string, Symbol> = {
  thin_margin: S(Wallet, 'orange'), fragile_but_clean: S(Umbrella, 'orange'), layoff: S(Briefcase, 'orange'),
  timing_dips: S(CalendarClock, 'orange'), penalty_interest: S(CalendarClock, 'orange'), fee_bleed: S(Receipt, 'orange'),
  income_volatile: S(Activity, 'orange'), cash_economy: S(Waves, 'orange'), loan_stress: S(Landmark, 'orange'),
  balance_sliding: S(TrendingDown, 'red'), lifestyle_creep: S(ShoppingBag, 'orange'), rent_pressure: S(Home, 'orange'),
  no_adjustment_when_hit: S(TrendingDown, 'orange'), slow_recovery: S(LifeBuoy, 'orange'),
}

const GOALS: Record<string, Symbol> = {
  emergency_fund: S(Umbrella), home: S(Home), housing_move: S(Home), vehicle: S(Car), retirement: S(Armchair), debt: S(Landmark),
  holidays: S(Gift), investing: S(Sprout), career: S(GraduationCap), family: S(HeartHandshake), income_smoothing: S(Waves),
  habit: S(Repeat), tax: S(Receipt), travel: S(Plane), education: S(BookOpen), care: S(HeartHandshake), spending: S(ShoppingBag),
  cushion: S(PiggyBank), short_purchase: S(ShoppingBag), long_term: S(TrendingUp), goal: S(Target),
}

const STEPS: Record<string, Symbol> = {
  income: S(HandCoins), housing: S(Home), spending: S(ShoppingBag), debt: S(Landmark), saving: S(PiggyBank),
  investing: S(Sprout), timing: S(Calendar), goal: S(Target),
}

export function worrySymbol(type?: string | null): Symbol {
  return (type && WORRIES[type]) || S(Shield, 'orange')
}

export function questionSymbol(key?: string | null): Symbol {
  if (!key) return NEUTRAL
  if (key.startsWith('goal')) return S(Target, 'blue')
  if (key === 'transfer_purpose') return S(ArrowRightLeft, 'blue')
  if (key === 'bill_dates') return S(Calendar, 'blue')
  if (key === 'income_source') return S(Briefcase, 'blue')
  if (key === 'job_security') return S(Shield, 'blue')
  return S(Target, 'blue')
}

export function goalSymbol(type?: string | null): Symbol {
  return (type && GOALS[type]) || S(Target)
}

export function stepSymbol(category?: string | null): Symbol {
  return (category && STEPS[category]) || S(Coins)
}
