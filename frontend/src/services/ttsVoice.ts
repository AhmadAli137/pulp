/* One warm female English voice for everything PULP speaks in the browser.

   Why the voice sometimes sounds robotic: browsers expose a list of system voices that loads asynchronously and
   differs by OS and browser. Windows ships old synthetic voices ("Microsoft David/Zira Desktop"); Edge adds the
   natural "Online (Natural)" voices; Chrome adds Google's network voices. If we speak before the list is ready we
   get the OS default (David), and if we rank the old voices high we get Zira. So: prefer natural/online/Google
   voices, rank the legacy Windows voices last, and wait for the list before the first utterance. */

const PREFERRED: RegExp[] = [
  /natural/i,                                  // Edge: "Microsoft Aria Online (Natural)", "Jenny", "Clara" (en-CA)
  /online/i,
  /google uk english female/i,
  /google us english/i,
  /\b(aria|jenny|clara|sonia|libby|michelle|emma|ava)\b/i,
  /samantha|karen|moira|tessa|serena|fiona/i,  // macOS
  /female/i,
  /zira/i,                                     // legacy Windows, last resort before the default
]
const AVOID_MALE = /\b(david|mark|george|daniel|alex|fred|guy|ryan|male)\b/i

let cached: SpeechSynthesisVoice | null = null
let readyPromise: Promise<void> | null = null

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

/** Resolves when the browser has published its voice list (or after a short timeout). */
export function voicesReady(timeoutMs = 1500): Promise<void> {
  const s = synth()
  if (!s) return Promise.resolve()
  if (s.getVoices().length) return Promise.resolve()
  if (!readyPromise) {
    readyPromise = new Promise<void>((resolve) => {
      const done = () => { resolve(); readyPromise = null }
      const timer = setTimeout(done, timeoutMs)
      const prev = s.onvoiceschanged
      s.onvoiceschanged = (ev) => { clearTimeout(timer); cached = null; prev?.call(s, ev); done() }
    })
  }
  return readyPromise
}

export function pickVoice(): SpeechSynthesisVoice | null {
  const s = synth()
  if (!s) return null
  const voices = s.getVoices()
  if (!voices.length) return cached
  if (cached && voices.includes(cached)) return cached
  const english = voices.filter((v) => /^en/i.test(v.lang))
  const pool = english.length ? english : voices
  for (const re of PREFERRED) {
    const hit = pool.find((v) => re.test(v.name) && !AVOID_MALE.test(v.name))
    if (hit) { cached = hit; return hit }
  }
  cached = pool.find((v) => !AVOID_MALE.test(v.name)) ?? pool[0] ?? null
  return cached
}

export function styleUtterance(u: SpeechSynthesisUtterance): SpeechSynthesisUtterance {
  const v = pickVoice()
  if (v) { u.voice = v; u.lang = v.lang }
  u.rate = 1.0
  u.pitch = 1.05
  return u
}

/** Speak text with the chosen voice, waiting for the voice list on the first call. Returns the utterance. */
export async function speakStyled(text: string, opts?: { onend?: () => void; onerror?: () => void }): Promise<SpeechSynthesisUtterance | null> {
  const s = synth()
  if (!s) return null
  await voicesReady()
  const u = styleUtterance(new SpeechSynthesisUtterance(text))
  if (opts?.onend) u.onend = opts.onend
  if (opts?.onerror) u.onerror = opts.onerror
  s.speak(u)
  return u
}

export function currentVoiceName(): string | null {
  return pickVoice()?.name ?? null
}

if (synth()) {
  // warm the list early; Chrome only populates it after the first getVoices() call
  synth()!.getVoices()
  void voicesReady()
}
