import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import type { Scene } from '../services/api'
import RunwayScene from './scenes/RunwayScene'
import TwoFuturesScene from './scenes/TwoFuturesScene'
import HabitScene from './scenes/HabitScene'
import LeverScene from './scenes/LeverScene'

/* Plays the Explainer's scenes in order: picture, caption, voice. Every number in a scene comes from its params. */
export function SceneView({ scene }: { scene: Scene }) {
  switch (scene.type) {
    case 'runway': return <RunwayScene p={scene.params} />
    case 'two_futures': return <TwoFuturesScene p={scene.params} />
    case 'habit': return <HabitScene p={scene.params} />
    case 'lever': return <LeverScene p={scene.params} />
  }
}

const tts = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export default function ScenePlayer({ scenes, autoplay = true, sceneMs = 7000, source }: { scenes: Scene[]; autoplay?: boolean; sceneMs?: number; source?: string }) {
  const [i, setI] = useState(0)
  const [muted, setMuted] = useState(!tts())
  const [playing, setPlaying] = useState(autoplay)
  const timer = useRef<number | null>(null)
  const scene = scenes[i]

  const stopSpeech = useCallback(() => { if (tts()) window.speechSynthesis.cancel() }, [])
  useEffect(() => () => { stopSpeech(); if (timer.current) window.clearTimeout(timer.current) }, [stopSpeech])

  useEffect(() => {
    if (!scene) return
    if (timer.current) window.clearTimeout(timer.current)
    let advanced = false
    const next = () => { if (advanced) return; advanced = true; if (playing && i < scenes.length - 1) setI(i + 1); else if (playing) setPlaying(false) }
    if (!muted && tts()) {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(scene.narration)
      u.lang = 'en-CA'; u.rate = 1.0
      u.onend = () => { timer.current = window.setTimeout(next, 900) }
      u.onerror = () => { timer.current = window.setTimeout(next, sceneMs) }
      window.speechSynthesis.speak(u)
    } else {
      timer.current = window.setTimeout(next, sceneMs)
    }
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [i, scene, muted, playing, scenes.length, sceneMs])

  if (!scene) return null
  const go = (n: number) => { stopSpeech(); setI(Math.max(0, Math.min(scenes.length - 1, n))); setPlaying(true) }
  return (
    <div className="scene-player" aria-live="polite">
      <div className="scene-player-head">
        <span className="scene-title">{scene.title}</span>
        <span className="scene-count">{i + 1} / {scenes.length}{source ? ` · ${source.startsWith('google-adk') ? 'scenes chosen by Gemini on ADK' : 'scenes chosen by rules'}` : ''}</span>
      </div>
      <div key={scene.id} className="scene-stage"><SceneView scene={scene} /></div>
      <p className="scene-caption">{scene.narration}</p>
      <div className="scene-controls">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous scene"><ChevronLeft size={16} /></button>
        <div className="scene-dots">{scenes.map((s, k) => <button key={s.id} type="button" className={k === i ? 'on' : ''} onClick={() => go(k)} aria-label={`Scene ${k + 1}: ${s.title}`} />)}</div>
        <button type="button" onClick={() => go(i + 1)} disabled={i === scenes.length - 1} aria-label="Next scene"><ChevronRight size={16} /></button>
        <button type="button" onClick={() => go(0)} aria-label="Replay scenes"><RotateCcw size={14} /></button>
        <button type="button" onClick={() => { setMuted((m) => !m); stopSpeech() }} aria-label={muted ? 'Unmute narration' : 'Mute narration'} disabled={!tts()}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
      </div>
    </div>
  )
}
