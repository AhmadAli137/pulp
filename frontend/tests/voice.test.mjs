import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/services/voice.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { startVoice } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

test('live voice handles early ready, streams audio, forwards visuals, and releases audio on stop', async (t) => {
  let socket, node, stopped = 0, closed = 0, resumed = 0, interrupted = 0
  const messages = []
  const connection = { connect() {} }
  const track = { stop() { stopped++ } }
  const globals = {
    navigator: { mediaDevices: { async getUserMedia() { return { getTracks: () => [track] } } } },
    location: { protocol: 'https:', host: 'example.test' },
    WebSocket: class {
      readyState = 1
      sent = []
      constructor(url) { this.url = url; socket = this }
      send(data) { this.sent.push(JSON.parse(data)) }
      close() { this.readyState = 3 }
    },
    AudioContext: class {
      currentTime = 0
      destination = {}
      audioWorklet = { async addModule() {
        // Provider readiness can arrive before the audio worklet has loaded.
        socket.onmessage({ data: JSON.stringify({ type: 'ready' }) })
      } }
      async resume() { resumed++ }
      async close() { closed++ }
      createMediaStreamSource() { return connection }
      createGain() { return { ...connection, gain: { value: 1 } } }
      createBuffer() { return { duration: 0.01, getChannelData: () => new Float32Array(2) } }
      createBufferSource() { return { ...connection, start() {}, stop() { interrupted++ } } }
    },
    AudioWorkletNode: class { port = {}; constructor() { node = this } connect() {} },
  }
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { value, configurable: true })
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key])
  }
  const stop = await startVoice(42, (m) => messages.push(m))
  assert.equal(socket.url, 'wss://example.test/api/agent/voice/42')
  node.port.onmessage({ data: new Uint8Array([1, 0, 2, 0]).buffer })
  assert.equal(socket.sent[0].type, 'audio')
  assert.equal(stop.sendText('I cannot cut spending'), true)
  assert.deepEqual(socket.sent.at(-1), { type: 'text', text: 'I cannot cut spending' })
  assert.equal(stopped, 0)
  socket.onmessage({ data: JSON.stringify({ type: 'audio', data: 'AQACAA==' }) })
  socket.onmessage({ data: JSON.stringify({ type: 'interrupted' }) })
  assert.equal(interrupted, 1)
  const visual = { type: 'visual', beat: { visual: 'picture', caption: '', params: {} } }
  socket.onmessage({ data: JSON.stringify(visual) })
  assert.deepEqual(messages.at(-1), visual)
  const walkthrough = { type: 'walkthrough', beats: [visual.beat, { ...visual.beat, id: 'second' }] }
  socket.onmessage({ data: JSON.stringify(walkthrough) })
  assert.deepEqual(messages.at(-1), walkthrough)
  stop(); stop()
  assert.equal(stopped, 1)
  assert.equal(closed, 2)
  assert.equal(resumed, 2)
  assert.equal(socket.sent.at(-1).type, 'end')
})
