import { useEffect, useState } from 'react'
import type { MathParams } from '../../services/api'
import { useMotionScale } from './shared'

/* The sponsor's formula, revealed line by line like someone writing it out. */
export default function MathVisual({ p }: { p: MathParams }) {
  const scale = useMotionScale()
  const [shown, setShown] = useState(scale ? 0 : p.lines.join('\n').length)
  const full = p.lines.join('\n')
  useEffect(() => {
    if (!scale) { setShown(full.length); return }
    setShown(0)
    let i = 0
    const id = setInterval(() => { i += 2; setShown(i); if (i >= full.length) clearInterval(id) }, 18)
    return () => clearInterval(id)
  }, [full, scale])
  const text = full.slice(0, shown)
  return (
    <div className="stage-math" role="img" aria-label="Show the math">
      <pre>{text}<span className="stage-caret">▍</span></pre>
    </div>
  )
}
