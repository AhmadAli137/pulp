import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { ShuffleParams } from '../../services/api'
import { useMotionScale } from './shared'
import { TwistCardBack, TwistCardFace } from './TwistCard'

type Phase = 'idle' | 'riffle' | 'cut' | 'deal' | 'done'
const N = 10

/* A dealer at a table. The deck splits in two halves that lift, riffle together with staggered rotations and snap
   into one stack; a quick cut; then one card slides out, flips face-up in 3D with a small bounce and lands centred.
   Under 3.5 s in total. With reduced motion, the dealt card simply fades in. */
export default function ShuffleVisual({ p }: { p: ShuffleParams }) {
  const scale = useMotionScale()
  const [phase, setPhase] = useState<Phase>(scale ? 'idle' : 'done')
  useEffect(() => {
    if (!scale) { setPhase('done'); return }
    setPhase('idle')   // let the stage morph settle, then shuffle, cut, deal: about 3.4 s in all
    const z = setTimeout(() => setPhase('riffle'), 420)
    const a = setTimeout(() => setPhase('cut'), 1720)
    const b = setTimeout(() => setPhase('deal'), 2320)
    const c = setTimeout(() => setPhase('done'), 3400)
    return () => { clearTimeout(z); clearTimeout(a); clearTimeout(b); clearTimeout(c) }
  }, [p.dealt.key, scale])

  const dealing = phase === 'deal' || phase === 'done'
  return (
    <div className="stage-shuffle" role="img" aria-label={`Shuffling the deck; dealt: ${p.dealt.title}`}>
      <div className="shuffle-table" />
      <div className="shuffle-stack">
        {Array.from({ length: N }, (_, i) => {
          const left = i % 2 === 0
          const side = left ? -1 : 1
          const rest = { x: 0, y: -i * 1.2, rotate: (i % 3 - 1) * 1.5 }
          const anim = phase === 'riffle'
            ? { x: [0, side * 120, side * 118, side * 30, 0], y: [-i * 1.2, -18 - i * 2, -26 - i * 2, -8 - i, -i * 1.2], rotate: [0, side * 14, side * 10, side * 4, (i % 3 - 1) * 1.5] }
            : phase === 'cut'
              ? (i >= N / 2 ? { x: [0, 170, 170, 0], y: [-i * 1.2, -40, -40, -i * 1.2], rotate: [0, 6, 6, 0] } : rest)
              : rest
          const trans = phase === 'riffle'
            ? { duration: 1.25, times: [0, 0.25, 0.5, 0.78, 1], ease: 'easeInOut', delay: (left ? Math.floor(i / 2) : Math.floor(i / 2) + 0.5) * 0.035 }
            : phase === 'cut' ? { duration: 0.6, times: [0, 0.35, 0.65, 1], ease: 'easeInOut' } : { duration: 0.3 }
          return (
            <motion.div key={i} className="shuffle-card" style={{ zIndex: i }} initial={scale ? { x: 0, y: -i * 1.2, rotate: 0 } : false} animate={anim} transition={trans}>
              <TwistCardBack style={{ width: 150 }} />
            </motion.div>
          )
        })}
      </div>
      <motion.div className="shuffle-dealt" style={{ zIndex: 40 }}
        initial={scale ? { opacity: 0, y: 40, scale: 0.6 } : { opacity: 0 }}
        animate={scale
          ? (dealing ? { opacity: 1, y: -30, scale: [0.6, 1.08, 1] } : { opacity: 0, y: 40, scale: 0.6 })
          : { opacity: 1, y: -30, scale: 1 }}
        transition={scale ? { duration: 0.9, ease: [0.2, 0.9, 0.2, 1], times: [0, 0.7, 1] } : { duration: 0.4 }}>
        <motion.div className="shuffle-flip" initial={false} animate={{ rotateY: dealing || !scale ? 0 : 180 }} transition={{ duration: scale ? 0.8 : 0, delay: scale ? 0.15 : 0, ease: [0.2, 0.9, 0.2, 1] }}>
          <TwistCardFace className="shuffle-face" title={p.dealt.title} text={p.dealt.text} cardKey={p.dealt.key} kicker="YOUR TWIST" style={{ width: 290 }} scale={1.06} />
          <TwistCardBack className="shuffle-back" style={{ width: 290 }} />
        </motion.div>
      </motion.div>
    </div>
  )
}
