import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import type { Beat } from '../../services/api'
import ThreadFigure from './ThreadFigure'
import PulpText from './PulpText'

/* Visual playback only: native voice remains the sole audio source. */
export default function AnimatedWalkthrough({ beats, onAction, autoplay = true }: { beats: Beat[]; onAction: (message: string) => void; autoplay?: boolean }) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(autoplay && !reduced)
  const [take, setTake] = useState(0)
  const beat = beats[index]
  useEffect(() => {
    if (!playing || reduced || !beat) return
    const timer = window.setTimeout(() => {
      if (index < beats.length - 1) setIndex(i => i + 1)
      else setPlaying(false)
    }, Math.max(3000, Math.min(12000, (beat.duration_s || 6) * 1000)))
    return () => clearTimeout(timer)
  }, [playing, reduced, index, beat, beats.length, take])
  if (!beat) return null
  const move = (next: number) => { setPlaying(false); setIndex(next) }
  return <section className="animated-walkthrough" aria-label="Animated walkthrough">
    <div className="walkthrough-heading"><span className="editorial-label">Your scenario, step by step</span><span aria-live="polite">Scene {index + 1} of {beats.length}</span></div>
    <ThreadFigure key={`${index}-${take}`} beat={beat} onAction={message => { setPlaying(false); onAction(message) }} />
    <PulpText text={beat.caption} />
    <div className="walkthrough-controls" aria-label="Animation playback">
      <button type="button" onClick={() => move(index - 1)} disabled={index === 0}>Previous scene</button>
      {!reduced && <button type="button" onClick={() => { if (index === beats.length - 1 && !playing) setIndex(0); setPlaying(p => !p) }}>{playing ? 'Pause animation sequence' : 'Play animation sequence'}</button>}
      <button type="button" onClick={() => move(index + 1)} disabled={index === beats.length - 1}>Next scene</button>
      <button type="button" onClick={() => { setIndex(0); setTake(t => t + 1); setPlaying(!reduced) }}>Replay walkthrough</button>
    </div>
    <details onToggle={e => { if (e.currentTarget.open) setPlaying(false) }}><summary>Read all steps</summary>{beats.map((b, i) => <p key={b.id}><strong>{i + 1}.</strong> {b.caption}</p>)}</details>
  </section>
}
