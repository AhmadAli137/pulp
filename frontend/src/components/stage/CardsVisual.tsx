import { motion } from 'framer-motion'
import type { CardsParams } from '../../services/api'
import { useMotionScale } from './shared'
import { TwistCardBack, TwistCardFace } from './TwistCard'

/* The judge's twist cards, fanned out on the table. Hover lifts a card; clicking sends `twist:<key>` to the stage.
   The random card is the patterned back of the deck. */
export default function CardsVisual({ p, onAction }: { p: CardsParams; onAction?: (message: string) => void }) {
  const scale = useMotionScale()
  const n = p.cards.length
  return (
    <div className="stage-cards" role="group" aria-label="Twist cards">
      <div className="shuffle-table" />
      {p.cards.map((c, i) => {
        const rot = (i - (n - 1) / 2) * 6
        const lift = Math.abs(i - (n - 1) / 2) * 14
        return (
          <motion.button key={c.key} className="stage-card-btn" onClick={() => onAction?.(`twist:${c.key}`)} aria-label={`${c.title}: ${c.text}`}
            initial={scale ? { y: 220, opacity: 0, rotate: 0 } : false} animate={{ y: lift, opacity: 1, rotate: rot }} whileHover={{ y: lift - 26, rotate: 0, scale: 1.05, zIndex: 20 }}
            transition={{ delay: 0.12 * i, type: 'spring', stiffness: 190, damping: 18 }} style={{ transformOrigin: 'bottom center' }}>
            {c.key === 'random'
              ? <TwistCardBack style={{ width: 'min(220px, 21vw)' }} label="Shuffle the deck" />
              : <TwistCardFace title={c.title} text={c.text} cardKey={c.key} style={{ width: 'min(220px, 21vw)' }} scale={0.9} />}
          </motion.button>
        )
      })}
    </div>
  )
}
