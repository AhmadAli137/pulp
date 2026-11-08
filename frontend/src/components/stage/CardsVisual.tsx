import { motion } from 'framer-motion'
import type { CardsParams } from '../../services/api'
import { useMotionScale } from './shared'

/* The judge's twist cards, fanned out. Clicking one sends `twist:<key>` back through the stage. */
export default function CardsVisual({ p, onAction }: { p: CardsParams; onAction?: (message: string) => void }) {
  const scale = useMotionScale()
  const n = p.cards.length
  return (
    <div className="stage-cards" role="group" aria-label="Twist cards">
      {p.cards.map((c, i) => {
        const rot = (i - (n - 1) / 2) * 7
        return (
          <motion.button key={c.key} className={`stage-card ${c.key}`} onClick={() => onAction?.(`twist:${c.key}`)}
            initial={scale ? { y: 160, opacity: 0, rotate: 0 } : false} animate={{ y: 0, opacity: 1, rotate: rot }} whileHover={{ y: -14, rotate: 0, scale: 1.04 }}
            transition={{ delay: 0.15 * i, type: 'spring', stiffness: 200, damping: 18 }} style={{ transformOrigin: 'bottom center' }}>
            <span className="stage-card-kicker">{c.key === 'random' ? 'DRAW' : 'TWIST'}</span>
            <strong>{c.title}</strong>
            <p>{c.text}</p>
          </motion.button>
        )
      })}
    </div>
  )
}
