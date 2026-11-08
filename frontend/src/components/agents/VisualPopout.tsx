/* A larger view of a visual from the Pulp conversation, shown in the panel's left column so the chat and the live
   voice stay visible beside it. Opens when a new visual arrives (if "Pop out visuals" is on); the thumbnail stays in
   the chat. Walkthroughs get previous and next. Escape closes the visual before it closes the panel. */
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect } from 'react'
import type { Beat } from '../../services/api'
import Visual from '../stage/Visual'
import PulpText from '../stage/PulpText'
import './agents.css'

export type PopoutItem = { beats: Beat[]; index: number }

export default function VisualPane({ item, onClose, onMove, onAction }: { item: PopoutItem; onClose: () => void; onMove: (index: number) => void; onAction?: (message: string) => void }) {
  const beat = item.beats[item.index]
  const many = item.beats.length > 1
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT'
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose() }
      else if (many && !typing && e.key === 'ArrowRight' && item.index < item.beats.length - 1) onMove(item.index + 1)
      else if (many && !typing && e.key === 'ArrowLeft' && item.index > 0) onMove(item.index - 1)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [item, many, onClose, onMove])
  if (!beat) return null
  return (
    <section className="visual-pane" aria-label="Visual, larger view">
      <header>
        <span className="visual-pane-kicker">{many ? `Scene ${item.index + 1} of ${item.beats.length}` : 'A closer look'}</span>
        <button type="button" className="visual-pane-close" aria-label="Close larger view" onClick={onClose}><X size={16} /></button>
      </header>
      <div className={`visual-pane-canvas expanded-visual kind-${beat.visual}`} key={`${item.index}-${beat.id}`}>
        <Visual beat={beat} onAction={onAction} />
      </div>
      <div className="visual-pane-caption"><PulpText text={beat.caption} /></div>
      {many && (
        <footer>
          <button type="button" onClick={() => onMove(item.index - 1)} disabled={item.index === 0}><ChevronLeft size={15} />Previous</button>
          <span className="visual-pane-dots" aria-hidden="true">{item.beats.map((b, i) => <i key={b.id} className={i === item.index ? 'on' : ''} />)}</span>
          <button type="button" onClick={() => onMove(item.index + 1)} disabled={item.index === item.beats.length - 1}>Next<ChevronRight size={15} /></button>
        </footer>
      )}
    </section>
  )
}
