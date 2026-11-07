import { useCallback, useEffect, useRef, useState } from 'react'

/* Browser speech recognition + synthesis. Text chat never depends on this. */
type SR = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void) | null
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null }

function getSR(): (new () => SR) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useSpeech() {
  const [supported] = useState(() => !!getSR())
  const [ttsSupported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const recRef = useRef<SR | null>(null)
  const finalRef = useRef('')
  const onFinal = useRef<((t: string) => void) | null>(null)

  const start = useCallback((cb: (text: string) => void) => {
    const Ctor = getSR()
    if (!Ctor) { setError('Speech recognition is not supported in this browser. Use the text box.'); return }
    setError(null); setInterim(''); finalRef.current = ''
    onFinal.current = cb
    const rec = new Ctor()
    rec.lang = 'en-CA'; rec.interimResults = true; rec.continuous = false
    rec.onresult = (e) => {
      let txt = ''
      for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript
      setInterim(txt); finalRef.current = txt
    }
    rec.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Microphone permission was denied. You can keep typing.' : `Speech error: ${e.error}`)
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      const t = finalRef.current.trim()
      if (t && onFinal.current) onFinal.current(t)
      setInterim('')
    }
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { setError('Could not start the microphone.') }
  }, [])

  const stop = useCallback(() => { recRef.current?.stop() }, [])

  const speak = useCallback((text: string) => {
    if (!ttsSupported) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-CA'; u.rate = 1.0
      u.onstart = () => setSpeaking(true); u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(u)
    } catch { /* ignore */ }
  }, [ttsSupported])

  const stopSpeaking = useCallback(() => { if (ttsSupported) window.speechSynthesis.cancel(); setSpeaking(false) }, [ttsSupported])
  useEffect(() => () => { recRef.current?.abort(); if (ttsSupported) window.speechSynthesis.cancel() }, [ttsSupported])

  return { supported, ttsSupported, listening, interim, error, speaking, start, stop, speak, stopSpeaking }
}
