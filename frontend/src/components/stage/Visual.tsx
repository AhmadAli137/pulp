import type { Beat } from '../../services/api'
import ActionsVisual from './ActionsVisual'
import CalendarVisual from './CalendarVisual'
import CardsVisual from './CardsVisual'
import CrowdVisual from './CrowdVisual'
import CupVisual from './CupVisual'
import DialVisual from './DialVisual'
import ForkVisual from './ForkVisual'
import MathVisual from './MathVisual'
import NoneVisual from './NoneVisual'
import PictureVisual from './PictureVisual'
import PodiumVisual from './PodiumVisual'
import ShuffleVisual from './ShuffleVisual'
import SwarmVisual from './SwarmVisual'
import RibbonVisual from './RibbonVisual'
import RiverVisual from './RiverVisual'
import TimelineVisual from './TimelineVisual'

/* One component per visual kind. Everything drawn comes from the beat's params. */
export default function Visual({ beat, onAction }: { beat: Beat; onAction?: (message: string) => void }) {
  switch (beat.visual) {
    case 'picture': return <PictureVisual p={beat.params} />
    case 'cup': return <CupVisual p={beat.params} />
    case 'river': return <RiverVisual p={beat.params} />
    case 'timeline': return <TimelineVisual p={beat.params} />
    case 'fork': return <ForkVisual p={beat.params} />
    case 'calendar': return <CalendarVisual p={beat.params} />
    case 'dial': return <DialVisual p={beat.params} />
    case 'crowd': return <CrowdVisual p={beat.params} />
    case 'ribbon': return <RibbonVisual p={beat.params} />
    case 'cards': return <CardsVisual p={beat.params} onAction={onAction} />
    case 'math': return <MathVisual p={beat.params} />
    case 'shuffle': return <ShuffleVisual p={beat.params} />
    case 'swarm': return <SwarmVisual p={beat.params} />
    case 'podium': return <PodiumVisual p={beat.params} />
    case 'actions': return <ActionsVisual p={beat.params} />
    default: return <NoneVisual />
  }
}

export type PulpExpression = 'calm' | 'worried' | 'happy' | 'thinking'

export function expressionFor(beat: Beat | null, busy: boolean): PulpExpression {
  if (busy) return 'thinking'
  if (!beat) return 'calm'
  if (beat.visual === 'timeline' && beat.params.runs_out_month != null) return 'worried'
  if (beat.visual === 'calendar' || beat.visual === 'ribbon') return 'worried'
  if (beat.visual === 'dial' || beat.visual === 'fork' || beat.visual === 'podium' || beat.visual === 'actions') return 'happy'
  if (beat.visual === 'swarm' || beat.visual === 'shuffle') return 'thinking'
  if (beat.emphasis === 'worried' || beat.emphasis === 'happy') return beat.emphasis
  return 'calm'
}
