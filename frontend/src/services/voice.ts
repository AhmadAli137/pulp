import type { Beat, Proposal } from './api'
/* Gemini native-audio relay client: streams microphone PCM to /api/agent/voice/{id} and plays replies.
   Ported from the Codex build (pulp2). Requires the backend websocket relay; falls back with an error message
   where websockets are unavailable (for example on Vercel). */

export type VoiceSession = (() => void) & { sendText: (text: string) => boolean; setMuted: (muted: boolean) => void }

export type VoiceMessage =
  | { type: 'pipeline_event'; event: 'agent' | 'handoff'; data: Record<string, unknown> }
  | { type: 'context_proposal'; proposal: Proposal }
  | { type: 'state_changed' }
  | { type: 'status'; message: string }
  | { type: 'visual'; beat: Beat }
  | { type: 'ready'; model?: string }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string }
  | { type: 'turn_complete' }
  | { type: 'proposal'; proposal: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'closed' }

type Socket = WebSocket & { pulpReady?: boolean }

export async function startVoice(accountId: number, onMessage: (m: VoiceMessage) => void): Promise<VoiceSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
  const input = new AudioContext()
  const output = new AudioContext({ sampleRate: 24000 })
  const playback = output.createGain()
  playback.connect(output.destination)
  let nextTime = 0
  let closed = false
  let microphoneReady = false
  let readyMessage: VoiceMessage | null = null
  let sources: AudioBufferSourceNode[] = []
  const socket: Socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/agent/voice/${accountId}`)
  const stop = (() => {
    if (closed) return
    closed = true
    stream.getTracks().forEach((t) => t.stop())
    if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'end' }))
    socket.close()
    void input.close()
    void output.close()
  }) as VoiceSession
  stop.setMuted = (muted) => { playback.gain.value = muted ? 0 : 1 }
  stop.sendText = (text) => {
    if (closed || socket.readyState !== 1 || !socket.pulpReady) return false
    socket.send(JSON.stringify({ type: 'text', text }))
    return true
  }
  try {
    socket.onmessage = (e) => {
      const m = JSON.parse(e.data as string) as VoiceMessage & { data?: string }
      if (m.type === 'ready') {
        socket.pulpReady = true; readyMessage = m
        if (!microphoneReady) return
      }
      if ((m as { type: string }).type === 'audio' && m.data) {
        const bytes = Uint8Array.from(atob(m.data), (c) => c.charCodeAt(0))
        const pcm = new Int16Array(bytes.buffer)
        const buffer = output.createBuffer(1, pcm.length, 24000)
        buffer.getChannelData(0).set(Float32Array.from(pcm, (x) => x / 32768))
        const source = output.createBufferSource()
        source.buffer = buffer
        source.connect(playback)
        nextTime = Math.max(nextTime, output.currentTime)
        source.start(nextTime)
        nextTime += buffer.duration
        sources.push(source)
        source.onended = () => { sources = sources.filter((x) => x !== source) }
      } else if ((m as { type: string }).type === 'interrupted') {
        sources.forEach((x) => { try { x.stop() } catch { /* ignore */ } })
        sources = []
        nextTime = 0
      } else onMessage(m)
      if (m.type === 'error') stop()
    }
    socket.onerror = () => { onMessage({ type: 'error', message: 'Voice connection failed. You can still type here.' }); stop() }
    socket.onclose = () => { stop(); onMessage({ type: 'closed' }) }
    await Promise.all([input.resume(), output.resume()])
    if (closed) return stop
    await input.audioWorklet.addModule('/pcm-worklet.js')
    if (closed) return stop
    const node = new AudioWorkletNode(input, 'pcm-input')
    const silence = input.createGain()
    silence.gain.value = 0
    input.createMediaStreamSource(stream).connect(node)
    node.connect(silence)
    silence.connect(input.destination)
    node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (socket.readyState !== 1 || !socket.pulpReady) return
      const bytes = new Uint8Array(e.data)
      let s = ''
      for (const byte of bytes) s += String.fromCharCode(byte)
      socket.send(JSON.stringify({ type: 'audio', data: btoa(s) }))
    }
    microphoneReady = true
    if (readyMessage) onMessage(readyMessage)
    return stop
  } catch (error) {
    stop()
    throw error
  }
}
