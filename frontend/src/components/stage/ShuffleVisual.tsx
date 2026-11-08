import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { ShuffleParams } from '../../services/api'
import { useMotionScale } from './shared'

/* A dealer at a table: the deck riffles and fans, cards overlap with staggered motion, then one card is dealt and
   flips face-up with the twist that was drawn. */
export default function ShuffleVisual({ p }: { p: ShuffleParams }) {
  const scale = useMotionScale()
  const [phase, setPhase] = useState<'shuffle' | 'deal' | 'flip'>(scale ? 'shuffle' : 'flip')
  useEffect(() => {
    if (!scale) { setPhase('flip'); return }
    setPhase('shuffle')
    const a = setTimeout(() => setPhase('deal'), 2200)
    const b = setTimeout(() => setPhase('flip'), 3200)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [p.dealt.key, scale])
  const n = Math.min(12, Math.max(6, p.deck.length))
  return (
    <div className="stage-shuffle" role="img" aria-label={`Shuffling the deck; dealt: ${p.dealt.title}`}>
      <div className="stage-table" />
      {Array.from({ length: n }, (_, i) => {
        const t = p.deck[i] ?? ''
        const riffle = phase === 'shuffle'
        return (
          <motion.div key={i} className="stage-deck-card"
            initial={scale ? { x: 0, y: 0, rotate: 0 } : false}
            animate={riffle
              ? { x: [0, (i % 2 ? 1 : -1) * (90 + i * 6), 0, (i % 2 ? -1 : 1) * 60, (i - n / 2) * 26], y: [0, -20 - i * 3, 0, -10, -Math.abs(i - n / 2) * 4], rotate: [0, (i % 2 ? 1 : -1) * 18, 0, (i % 2 ? -1 : 1) * 8, (i - n / 2) * 6] }
              : { x: (i - n / 2) * 26, y: -Math.abs(i - n / 2) * 4, rotate: (i - n / 2) * 6 }}
            transition={riffle ? { duration: 2.1, times: [0, 0.25, 0.5, 0.75, 1], delay: i * 0.03 } : { duration: 0.5 }}
            style={{ zIndex: i }}>
            <span>{t}</span>
          </motion.div>
        )
      })}
      <motion.div className="stage-dealt"
        initial={scale ? { y: 60, opacity: 0 } : false}
        animate={phase === 'shuffle' ? { y: 60, opacity: 0 } : { y: -40, opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}>
        {phase === 'flip' ? (
          <motion.div key="face" className="stage-dealt-face" initial={scale ? { scaleX: 0 } : false} animate={{ scaleX: 1 }} transition={{ duration: 0.45, ease: 'easeOut' }}>
            <span className="stage-card-kicker">YOUR TWIST</span>
            <strong>{p.dealt.title}</strong>
            <p>{p.dealt.text}</p>
          </motion.div>
        ) : (
          <motion.div key="back" className="stage-dealt-back" initial={scale ? { scaleX: 1 } : false} animate={{ scaleX: phase === 'deal' ? [1, 1, 0] : 1 }} transition={{ duration: 1.0, times: [0, 0.6, 1] }} />
        )}
      </motion.div>
    </div>
  )
}
