/* Pip, the PULP tangerine mascot. Pure SVG so it scales and animates anywhere. */
export type Mood = 'happy' | 'thinking' | 'worried' | 'cheer'

export default function Mascot({ size = 96, mood = 'happy', className = '' }: { size?: number; mood?: Mood; className?: string }) {
  const eyeY = mood === 'thinking' ? 46 : 48
  return (
    <svg className={`mascot mood-${mood} ${className}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`Pip the tangerine, ${mood}`}>
      <defs>
        <radialGradient id="pipBody" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FFA14A" />
          <stop offset="70%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#D85A0B" />
        </radialGradient>
      </defs>
      {/* arms */}
      <g className="arm arm-l" stroke="#B9480A" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d={mood === 'cheer' ? 'M24 62 C 12 54, 10 40, 18 30' : 'M24 66 C 14 70, 10 80, 14 88'} />
      </g>
      <g className="arm arm-r" stroke="#B9480A" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d={mood === 'cheer' ? 'M96 62 C 108 54, 110 40, 102 30' : mood === 'thinking' ? 'M96 66 C 104 60, 100 48, 86 50' : 'M96 66 C 106 70, 110 80, 106 88'} />
      </g>
      {/* body */}
      <circle cx="60" cy="64" r="42" fill="url(#pipBody)" />
      <g opacity="0.18" fill="#7a2e00">
        <circle cx="34" cy="50" r="1.6" /><circle cx="42" cy="86" r="1.4" /><circle cx="86" cy="80" r="1.5" /><circle cx="80" cy="42" r="1.2" /><circle cx="60" cy="98" r="1.3" />
      </g>
      {/* stem and leaf */}
      <rect x="57" y="16" width="6" height="10" rx="3" fill="#6B4A1E" />
      <path className="leaf" d="M62 22 C 70 8, 88 10, 92 20 C 82 26, 70 28, 62 22 Z" fill="#2F7A5B" />
      <path d="M64 21 C 72 16, 82 15, 90 19" stroke="#1F5A42" strokeWidth="1.5" fill="none" />
      {/* face */}
      <g className="eyes">
        <ellipse cx="46" cy={eyeY} rx="4.5" ry={mood === 'worried' ? 6 : 5.5} fill="#252920" />
        <ellipse cx="74" cy={eyeY} rx="4.5" ry={mood === 'worried' ? 6 : 5.5} fill="#252920" />
        <circle cx="47.5" cy={eyeY - 2} r="1.5" fill="#fff" />
        <circle cx="75.5" cy={eyeY - 2} r="1.5" fill="#fff" />
      </g>
      {mood === 'worried' && <g stroke="#252920" strokeWidth="2.5" strokeLinecap="round"><path d="M40 38 L 50 41" /><path d="M80 38 L 70 41" /></g>}
      {mood === 'thinking' && <g stroke="#252920" strokeWidth="2.5" strokeLinecap="round"><path d="M40 37 L 50 39" /><path d="M70 36 L 80 34" /></g>}
      <circle cx="38" cy="66" r="5" fill="#FFB27A" opacity="0.8" />
      <circle cx="82" cy="66" r="5" fill="#FFB27A" opacity="0.8" />
      {mood === 'worried'
        ? <path d="M50 76 Q 60 70, 70 76" stroke="#252920" strokeWidth="3" fill="none" strokeLinecap="round" />
        : mood === 'thinking'
          ? <path d="M52 75 L 68 75" stroke="#252920" strokeWidth="3" strokeLinecap="round" />
          : <path d="M48 72 Q 60 84, 72 72" stroke="#252920" strokeWidth="3" fill="none" strokeLinecap="round" />}
      {mood === 'cheer' && <path d="M50 72 Q 60 86, 70 72 Z" fill="#7a2e00" opacity="0.5" />}
    </svg>
  )
}
