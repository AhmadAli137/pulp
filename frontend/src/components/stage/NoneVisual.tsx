import { Tangerine } from '../PulpMascot'

/* Caption-only beat: Pulp, large, on a soft glow. */
export default function NoneVisual({ mood = 'idle' }: { mood?: 'idle' | 'thinking' | 'listening' }) {
  return (
    <div className="stage-none" aria-hidden="true">
      <div className="stage-glow" />
      <Tangerine className="stage-mascot-large" mood={mood} />
    </div>
  )
}
