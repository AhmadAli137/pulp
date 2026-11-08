import { Tangerine } from '../PulpMascot'

/* Caption-only beat: Pip, large, on a soft glow. */
export default function NoneVisual({ mood = 'idle' }: { mood?: 'idle' | 'thinking' | 'listening' }) {
  return (
    <div className="stage-none" aria-hidden="true">
      <div className="stage-glow" />
      <Tangerine className="stage-pip-large" mood={mood} />
    </div>
  )
}
