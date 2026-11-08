/* Pick a consistent, warm female English voice for browser speech so every spoken line in PULP sounds like Pip.
   Browsers load voices asynchronously; call pickVoice() at speak time and it re-checks the list. */
const PREFERRED = [
  /zira/i, /aria/i, /jenny/i, /samantha/i, /karen/i, /moira/i, /tessa/i, /serena/i,
  /google uk english female/i, /google us english/i, /female/i,
]

let cached: SpeechSynthesisVoice | null = null

export function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return cached
  if (cached && voices.includes(cached)) return cached
  const english = voices.filter((v) => /^en/i.test(v.lang))
  for (const re of PREFERRED) {
    const hit = english.find((v) => re.test(v.name)) ?? voices.find((v) => re.test(v.name))
    if (hit) { cached = hit; return hit }
  }
  // Avoid known male system defaults when any other English voice exists
  const notMale = english.filter((v) => !/david|mark|george|daniel|alex|fred|male/i.test(v.name))
  cached = notMale[0] ?? english[0] ?? voices[0] ?? null
  return cached
}

export function styleUtterance(u: SpeechSynthesisUtterance): SpeechSynthesisUtterance {
  const v = pickVoice()
  if (v) { u.voice = v; u.lang = v.lang }
  u.rate = 1.0
  u.pitch = 1.05
  return u
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => { cached = null; pickVoice() }
}
