import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Beat } from '../../services/api'
import { speakStyled } from '../../services/ttsVoice'
import Visual from './Visual'

const MAX_MS = 14000
const readMute = () => { try { return localStorage.getItem('pulp.mute') === '1' } catch { return false } }

/* Plays a flat list of beats: one visual at a time, morphing between them; the caption is spoken and the player
   advances when the speech ends and the beat's duration has elapsed (whichever is later, capped). */
export default function BeatPlayer({ beats, index, onIndex, playing, onPlaying, onAction, status }: {
  beats: Beat[]; index: number; onIndex: (i: number) => void; playing: boolean; onPlaying: (p: boolean) => void
  onAction?: (message: string) => void; status?: string | null
}) {
  const reduced = useReducedMotion()
  const [mute, setMute] = useState(readMute)
  const beat = beats[index] ?? null
  const spokenDone = useRef(false)
  const timedDone = useRef(false)
  const timers = useRef<number[]>([])
  const tts = typeof window !== 'undefined' && 'speechSynthesis' in window

  const clear = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; if (tts) window.speechSynthesis.cancel() }, [tts])

  useEffect(() => {
    clear()
    if (!beat) return
    spokenDone.current = false; timedDone.current = false
    const advance = () => { if (spokenDone.current && timedDone.current && playing) onIndex(Math.min(beats.length - 1, index + 1)) }
    const dur = Math.max(1500, Math.min(MAX_MS, (beat.duration_s || 6) * 1000))
    timers.current.push(window.setTimeout(() => { timedDone.current = true; advance() }, dur))
    timers.current.push(window.setTimeout(() => { spokenDone.current = true; timedDone.current = true; advance() }, MAX_MS))
    if (tts && !mute && beat.caption) {
      void speakStyled(beat.caption, {
        onend: () => { spokenDone.current = true; advance() },
        onerror: () => { spokenDone.current = true; advance() },
      }).catch(() => { spokenDone.current = true; advance() })
    } else {
      spokenDone.current = true
    }
    return clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat?.id, index, mute, playing])

  useEffect(() => () => clear(), [clear])

  const toggleMute = () => { setMute((m) => { const v = !m; try { localStorage.setItem('pulp.mute', v ? '1' : '0') } catch { /* ignore */ } if (v && tts) window.speechSynthesis.cancel(); return v }) }
  const atEnd = index >= beats.length - 1

  return (
    <div className="stage-player">
      <div className="stage-canvas" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div key={beat?.id ?? 'empty'} className="stage-canvas-inner"
            initial={reduced ? false : { opacity: 0, scale: 0.96, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={reduced ? undefined : { opacity: 0, scale: 1.03, filter: 'blur(6px)' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}>
            {beat ? <Visual beat={beat} onAction={onAction} /> : null}
          </motion.div>
        </AnimatePresence>
        {status && <div className="stage-status" role="status"><span className="stage-status-dot" />{status}</div>}
      </div>
      <AnimatePresence mode="wait">
        <motion.p key={beat?.id ?? 'cap'} className="stage-caption" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
          {beat?.caption ?? ''}
        </motion.p>
      </AnimatePresence>
      <div className="stage-controls" aria-label="Playback">
        <button onClick={() => onIndex(Math.max(0, index - 1))} disabled={index <= 0} aria-label="Previous"><ChevronLeft size={18} /></button>
        <button onClick={() => onPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
        <button onClick={() => onIndex(Math.min(beats.length - 1, index + 1))} disabled={atEnd} aria-label="Next"><ChevronRight size={18} /></button>
        <span className="stage-dots" aria-hidden="true">{beats.map((b, i) => <i key={b.id + i} className={i === index ? 'on' : i < index ? 'past' : ''} onClick={() => onIndex(i)} />)}</span>
        <button onClick={() => { onIndex(0); onPlaying(true) }} aria-label="Replay from the start"><RotateCcw size={16} /></button>
        <button onClick={toggleMute} aria-label={mute ? 'Unmute narration' : 'Mute narration'}>{mute ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
      </div>
    </div>
  )
}
