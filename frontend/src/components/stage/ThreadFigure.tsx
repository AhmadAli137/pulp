import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { Beat } from '../../services/api'
import Visual from './Visual'

/* An inline figure inside one of Pulp's messages: the beat's visual, light palette, capped height, with a small
   replay affordance that re-mounts the figure (and re-speaks the caption when the caller wants that). */
export default function ThreadFigure({ beat, onReplay, onAction }: { beat: Beat; onReplay?: () => void; onAction?: (message: string) => void }) {
  const [take, setTake] = useState(0)
  if (beat.visual === 'none') return null
  return (
    <figure className={`thread-figure kind-${beat.visual}`}>
      <div className="thread-figure-canvas" key={take}><Visual beat={beat} onAction={onAction} /></div>
      <button type="button" className="thread-replay" aria-label="Replay this" title="Replay" onClick={() => { setTake((t) => t + 1); onReplay?.() }}><RotateCcw size={12} /></button>
    </figure>
  )
}
