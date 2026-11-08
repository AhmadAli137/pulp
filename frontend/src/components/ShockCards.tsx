import { useState } from 'react'
import { useApp } from '../stores/useApp'

/* The judge's twist cards. Official cards use the brief's exact wording and the store presets;
   the random card draws r, h and a one-off cost; "Write your own" scrolls to the controls. */
const OFFICIAL: { key: string; title: string; text: string }[] = [
  { key: 'layoff', title: 'Layoff', text: 'This customer was laid off. EI pays 55% of their usual income for 6 months. Do they make it?' },
  { key: 'furnace', title: 'Furnace', text: 'The furnace dies, and the repair costs a full month of their typical spending.' },
  { key: 'combined', title: 'Layoff + bills', text: 'They lose their job (EI at 55%) and their household bills go up 15% in the same month.' },
]
const R = [0.55, 0.6, 0.7, 1.0]
const H = [0, 0.1, 0.15, 0.25]
const ONE_OFF_MONTHS = [0, 0.5, 1]

function pick<T>(xs: T[]): T { return xs[Math.floor(Math.random() * xs.length)] }

function wording(r: number, h: number, m: number): string {
  const parts: string[] = []
  if (r < 1) parts.push(`income drops to ${Math.round(r * 100)}% for 6 months`)
  if (h > 0) parts.push(`household bills go up ${Math.round(h * 100)}%`)
  if (m > 0) parts.push(`a surprise cost of ${m === 1 ? 'a full month' : 'half a month'} of typical spending lands now`)
  const s = parts.join(', and ')
  return s.charAt(0).toUpperCase() + s.slice(1) + '. Do they make it?'
}

export default function ShockCards() {
  const { profile, activePreset, applyPreset, setInputs, runShock } = useApp()
  const [random, setRandom] = useState<{ r: number; h: number; m: number } | null>(null)
  const [flipKey, setFlipKey] = useState(0)

  const drawRandom = () => {
    let r = 1, h = 0, m = 0
    while (r === 1 && h === 0 && m === 0) { r = pick(R); h = pick(H); m = pick(ONE_OFF_MONTHS) }
    setRandom({ r, h, m })
    setFlipKey((k) => k + 1)
    const one_off = profile ? m * profile.typical_spending : 0
    setInputs({ income_fraction: r, bills_increase: h, one_off_cost: one_off, horizon_months: 6 }, 'random')
    void runShock()
  }

  const scrollToControls = () => document.getElementById('shock-controls')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="twist-deck" role="group" aria-label="Twist cards">
      {OFFICIAL.map((c) => (
        <button key={c.key} className={`twist-card${activePreset === c.key ? ' active' : ''}`} onClick={() => { setFlipKey((k) => k + 1); applyPreset(c.key) }}>
          <span className="twist-face">
            <span className="twist-title">{c.title}</span>
            <span className="twist-text">{c.text}</span>
          </span>
        </button>
      ))}
      <button key={`random-${flipKey}`} className={`twist-card random${activePreset === 'random' ? ' active' : ''}`} onClick={drawRandom}>
        <span className="twist-face">
          <span className="twist-title">{random ? 'Random draw' : 'Draw a random card'}</span>
          <span className="twist-text">{random ? wording(random.r, random.h, random.m) : 'A new mix of income loss, bill increase and surprise cost each time.'}</span>
          {random && <span className="twist-again">Draw again</span>}
        </span>
      </button>
      <button className="twist-card custom" onClick={scrollToControls}>
        <span className="twist-face">
          <span className="twist-title">Write your own</span>
          <span className="twist-text">Set the exact income fraction, bill increase and one-off cost below.</span>
        </span>
      </button>
    </div>
  )
}
