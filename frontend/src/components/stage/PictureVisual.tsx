import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { PictureParams } from '../../services/api'
import { Tangerine } from '../PulpMascot'
import { Big, Frame, INK, LINE, Label, MINT, MUTED, ORANGE, ROSE, money, useMotionScale } from './shared'

/* The month as a glass of juice. Each month plays in three beats, then pauses and repeats:
   (1) the tangerine is squeezed and money in pours into the glass on top of the buffer already there,
   (2) spending is drunk out through the straw,
   (3) what is left over settles as the new level ("+$X left over", or "−$X short" with the level ending lower).
   The glass is scaled in months of spending, with a tick for each month, so the level reads as runway.
   Reduced motion shows the settled month. */
type Phase = 'rest' | 'squeeze' | 'drink' | 'settle'
const BEATS: [Phase, number][] = [['rest', 700], ['squeeze', 1700], ['drink', 1700], ['settle', 2200]]

export default function PictureVisual({ p }: { p: PictureParams }) {
  const motionOn = useMotionScale() > 0
  const [phase, setPhase] = useState<Phase>(motionOn ? 'rest' : 'settle')
  useEffect(() => {
    if (!motionOn) { setPhase('settle'); return }
    let i = 0, t: ReturnType<typeof setTimeout>
    const next = () => { i = (i + 1) % BEATS.length; setPhase(BEATS[i][0]); t = setTimeout(next, BEATS[i][1]) }
    setPhase(BEATS[0][0]); t = setTimeout(next, BEATS[0][1])
    return () => clearTimeout(t)
  }, [motionOn, p.inflow, p.outflow, p.buffer])

  const S = Math.max(1, p.outflow), I = Math.max(0, p.inflow), B = Math.max(0, p.buffer)
  const net = I - p.outflow
  const end = Math.max(0, B + net)
  const rim = Math.max(3, Math.ceil(Math.max(B + I, B) / S) + 1)
  // glass geometry (slight taper)
  const top = 168, bot = 472, gx0 = 400, gx1 = 600, taper = 18
  const H = bot - top
  const levelY = (v: number) => bot - Math.min(1, v / (rim * S)) * (H - 8)
  const level = phase === 'squeeze' ? B + I : phase === 'drink' || phase === 'settle' ? end : B
  const ly = levelY(level)
  const glass = `M ${gx0} ${top} L ${gx1} ${top} L ${gx1 - taper} ${bot} Q 500 ${bot + 10} ${gx0 + taper} ${bot} Z`
  const wIn = 6 + 22 * Math.min(1, I / Math.max(I, S, 1))
  const wOut = 6 + 22 * Math.min(1, S / Math.max(I, S, 1))
  const tickEvery = rim <= 8 ? 1 : rim <= 16 ? 2 : Math.ceil(rim / 8)
  const squeezing = phase === 'squeeze'
  const drinking = phase === 'drink'
  const settled = phase === 'settle'
  const ok = net >= 0
  // crack length follows the shortfall: a small chip at a few percent of spending, the full wall at half of it
  const crack = ok ? 0 : Math.min(1, -net / (0.5 * S))
  const crackY = bot - 70
  const wallX = (y: number) => gx0 + (taper * (y - top)) / H
  const crackLen = 26 + 150 * crack
  const crackX = wallX(crackY)
  const crackPath = Array.from({ length: 7 }, (_, k) => {
    const y = crackY - (crackLen * k) / 6
    const x = wallX(y) + (k % 2 === 0 ? 0 : 6 + 10 * crack)
    return `${k === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  return (
    <Frame label={`Your month: ${money(p.inflow)} squeezed in, ${money(p.outflow)} spent, ${ok ? `${money(net)} left over` : `${money(-net)} short`}; ${money(p.buffer)} in the glass, ${p.months_of_spending.toFixed(1)} months of spending`}>
      <defs>
        <clipPath id="pic-glass"><path d={glass} /></clipPath>
        <linearGradient id="pic-juice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FDBA74" /><stop offset="1" stopColor="#F28C28" /></linearGradient>
      </defs>

      {/* the press: two flat plates squeeze the tangerine */}
      <g transform="translate(500 92)">
        <motion.rect y={-34} width={18} height={68} rx={4} fill="#D9DED3" animate={{ x: squeezing ? -58 : -78 }} transition={{ duration: 0.45, ease: 'easeInOut' }} />
        <motion.rect y={-34} width={18} height={68} rx={4} fill="#D9DED3" animate={{ x: squeezing ? 40 : 60 }} transition={{ duration: 0.45, ease: 'easeInOut' }} />
        <motion.g animate={{ scaleX: squeezing ? 0.82 : 1, scaleY: squeezing ? 1.06 : 1 }} transition={{ duration: 0.45, ease: 'easeInOut' }}>
          <circle r={40} fill="#F28C28" />
          <path d="M0 -40 V40 M-34 -20 L34 20 M-34 20 L34 -20" stroke="#F7A650" strokeWidth={2.5} opacity={0.7} />
          <circle r={40} fill="none" stroke="#E07A1C" strokeWidth={2} />
          <path d="M2 -40 c6 -16 22 -18 30 -12 -4 12 -18 17 -30 12Z" fill="#5E7A4A" />
        </motion.g>
      </g>
      {/* the stream: thickness follows money in */}
      <motion.line x1={500} x2={500} y1={134} y2={ly} stroke="url(#pic-juice)" strokeWidth={wIn} strokeLinecap="round"
        initial={{ opacity: 0 }} animate={{ opacity: squeezing ? 1 : 0 }} transition={{ duration: 0.3 }} />
      {squeezing && motionOn && <motion.circle cx={500} r={wIn / 2.4} fill="#F28C28" initial={{ cy: 140 }} animate={{ cy: [140, ly] }} transition={{ duration: 0.5, repeat: 3, ease: 'easeIn' }} />}

      {/* the glass and the juice */}
      <g clipPath="url(#pic-glass)">
        <motion.rect x={gx0 - 10} width={gx1 - gx0 + 20} fill="url(#pic-juice)" initial={false} animate={{ y: ly, height: bot + 20 - ly }} transition={{ duration: motionOn ? 1.2 : 0, ease: 'easeInOut' }} />
        <motion.line x1={gx0 - 10} x2={gx1 + 10} stroke="#FFE2BF" strokeWidth={3} initial={false} animate={{ y1: ly + 1, y2: ly + 1 }} transition={{ duration: motionOn ? 1.2 : 0, ease: 'easeInOut' }} />
        {/* the buffer line: where the month started */}
        <line x1={gx0} x2={gx1} y1={levelY(B)} y2={levelY(B)} stroke={INK} strokeWidth={1.5} strokeDasharray="5 5" opacity={0.55} />
      </g>
      <path d={glass} fill="none" stroke="#9FAA98" strokeWidth={3} />
      {/* a crack on the left wall that grows with the monthly shortfall and is gone at break-even or better */}
      {crack > 0 && (
        <g aria-hidden="true">
          <path d={crackPath} fill="none" stroke="#7A4A2A" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          <motion.circle cx={crackX - 6} r={3.5} fill="#F28C28" initial={false}
            animate={motionOn ? { cy: [crackY, crackY + 46], opacity: [1, 0] } : { cy: crackY + 14, opacity: 1 }} transition={{ duration: 1.1, repeat: motionOn ? Infinity : 0, ease: 'easeIn' }} />
          <Label x={gx0 - 20} y={crackY + 64} size={14} color={ROSE} weight={700} anchor="end">a crack: {money(-net)} short a month</Label>
        </g>
      )}
      <path d={`M ${gx0 + 14} ${top + 12} L ${gx0 + 26} ${bot - 30}`} stroke="#fff" strokeWidth={4} opacity={0.6} strokeLinecap="round" />

      {/* month scale beside the glass */}
      {Array.from({ length: rim + 1 }, (_, m) => m).filter((m) => m % tickEvery === 0).map((m) => (
        <g key={m}>
          <line x1={gx0 - 14} x2={gx0 - 4} y1={levelY(m * S)} y2={levelY(m * S)} stroke={m === 0 ? INK : LINE} strokeWidth={2} />
          <Label x={gx0 - 20} y={levelY(m * S) + 5} size={14} color={MUTED} anchor="end">{m === 0 ? '0' : `${m} mo`}</Label>
        </g>
      ))}
      <Label x={gx0 - 20} y={top - 10} size={14} color={MUTED} anchor="end">months of spending</Label>

      {/* the straw: spending is drunk out */}
      <path d={`M 560 ${bot - 24} L 588 ${top - 30} L 660 ${top - 70}`} fill="none" stroke="#D9DED3" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      <motion.path d={`M 560 ${bot - 24} L 588 ${top - 30} L 660 ${top - 70}`} fill="none" stroke="#F28C28" strokeWidth={Math.min(12, wOut / 2.2)} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="14 12" initial={{ opacity: 0, strokeDashoffset: 0 }} animate={{ opacity: drinking ? 1 : 0, strokeDashoffset: drinking && motionOn ? [0, -52] : 0 }} transition={{ opacity: { duration: 0.25 }, strokeDashoffset: { duration: 0.6, repeat: drinking ? Infinity : 0, ease: 'linear' } }} />

      {/* labels */}
      <g opacity={squeezing || !motionOn ? 1 : 0.55}>
        <Label x={380} y={86} size={16} color={INK} weight={800} anchor="end">squeezed in</Label>
        <Big x={380} y={120} size={26} anchor="end">+{money(I)}<tspan fontSize={15} fill={MUTED} fontWeight={500}> a month</tspan></Big>
      </g>
      <g opacity={drinking || !motionOn ? 1 : 0.55}>
        <Label x={680} y={96} size={16} color={INK} weight={800}>drunk: spending</Label>
        <Big x={680} y={130} size={26} color={ROSE}>−{money(p.outflow)}<tspan fontSize={15} fill={MUTED} fontWeight={500}> a month</tspan></Big>
      </g>
      <Label x={gx1 + 18} y={levelY(B) + 5} size={14} color={INK} weight={700}>buffer {money(p.buffer)} · {p.months_of_spending.toFixed(1)} months</Label>

      <motion.g initial={{ opacity: motionOn ? 0 : 1 }} animate={{ opacity: settled || !motionOn ? 1 : 0 }} transition={{ duration: 0.4 }}>
        <foreignObject x={300} y={488} width={46} height={46}><div style={{ width: 46, height: 46 }}><Tangerine mood={ok ? 'celebrate' : 'concerned'} label="" key={`${ok}-${settled}`} /></div></foreignObject>
        <Big x={356} y={522} size={26} color={ok ? MINT : ROSE}>{ok ? `+${money(net)} left over` : `−${money(-net)} short`}<tspan fontSize={15} fill={MUTED} fontWeight={500}> this month</tspan></Big>
      </motion.g>
      <Label x={500} y={552} size={14} color={MUTED} anchor="middle">runway with no shock: {p.runway_label}{ok ? '' : ' · the level ends lower each month'}</Label>
      {!motionOn && <Label x={680} y={bot - 40} size={14} color={ORANGE} weight={700}>{ok ? 'the level rises a little each month' : 'the level falls a little each month'}</Label>}
    </Frame>
  )
}
