import { motion } from 'framer-motion'
import type { ActionsParams, Horizon } from '../../services/api'
import { useMotionScale } from './shared'

const HORIZON_LABEL: Record<Horizon, string> = { now: 'now', 'this month': 'this month', 'this year': 'this year', later: 'later on' }
const SOURCE_LABEL: Record<string, string> = { grid: 'from the engine', strategist: 'the Strategist’s idea', habit: 'about a habit', future: 'for later' }

/* What you can actually do: a short list of decisions, each sliding in like a note on a napkin. */
export default function ActionsVisual({ p }: { p: ActionsParams }) {
  const scale = useMotionScale()
  const items = p.actions.slice(0, 4)
  return (
    <div className="stage-actions" role="list" aria-label={p.headline}>
      <motion.h3 className="stage-actions-head" initial={scale ? { opacity: 0, y: -10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>{p.headline}</motion.h3>
      <div className={`stage-actions-list n${items.length}`}>
        {items.map((a, i) => (
          <motion.article key={i} className={`stage-action ${a.horizon.replace(' ', '-')}`} role="listitem"
            initial={scale ? { opacity: 0, x: -40, rotate: -2 } : false} animate={{ opacity: 1, x: 0, rotate: (i % 2 ? 1 : -1) * 0.6 }}
            transition={{ delay: 0.35 + i * 0.45, type: 'spring', stiffness: 160, damping: 20 }}>
            <span className={`stage-action-when ${a.horizon.replace(' ', '-')}`}>{HORIZON_LABEL[a.horizon] ?? a.horizon}</span>
            <strong>{a.title}</strong>
            <p>{a.how}</p>
            <footer><b>{a.effect}</b><i>{SOURCE_LABEL[a.source] ?? a.source}</i></footer>
          </motion.article>
        ))}
      </div>
    </div>
  )
}
