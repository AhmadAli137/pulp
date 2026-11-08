import { Maximize2, RotateCcw, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Beat } from '../../services/api'
import Visual from './Visual'

/* Inline, naturally sized visuals with replay and an optional larger view. */
export default function ThreadFigure({ beat, onReplay, onAction }: { beat: Beat; onReplay?: () => void; onAction?: (message: string) => void }) {
  const [take, setTake] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  if (beat.visual === 'none') return null
  return (
    <figure className={`thread-figure kind-${beat.visual}`}>
      <div className="thread-figure-canvas" key={take}><Visual beat={beat} onAction={onAction} /></div>
      <div className="figure-tools"><button type="button" aria-label="Expand visual" title="View larger" onClick={() => dialog.current?.showModal()}><Maximize2 size={13} /></button>
      <button type="button" className="thread-replay" aria-label="Replay this" title="Replay" onClick={() => { setTake((t) => t + 1); onReplay?.() }}><RotateCcw size={12} /></button></div>
      <dialog ref={dialog} className="thread-visual-dialog" aria-label="Expanded visual" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close() }}>
        <header><span>Closer look</span><button type="button" aria-label="Close expanded visual" onClick={() => dialog.current?.close()}><X size={18}/></button></header>
        <div className={`expanded-visual kind-${beat.visual}`}><Visual beat={beat} onAction={message => { dialog.current?.close(); onAction?.(message) }} /></div>
      </dialog>
    </figure>
  )
}
