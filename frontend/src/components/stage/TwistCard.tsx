import { ArrowUpRight, Baby, Boxes, Briefcase, Car, Clock, Coins, Flame, PawPrint, Shuffle, Thermometer, Wrench } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

/* The twist cards, designed like board-game chance cards: cream card stock with a fine border, a forest title band,
   one line icon per card key, and a patterned orange back carrying the PULP wordmark. Used by the shuffle and the fan. */

function House({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" />
    </svg>
  )
}
function Tooth({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5.5c-1.6-1.4-3.8-1.9-5.6-.9C4.2 5.8 3.6 8.3 4.3 10.6c.6 2 1.4 3.8 1.9 6.1.3 1.5.6 3.3 1.8 3.3 1.3 0 1.5-2.2 2.2-3.6.4-.9 1.1-1.4 1.8-1.4s1.4.5 1.8 1.4c.7 1.4.9 3.6 2.2 3.6 1.2 0 1.5-1.8 1.8-3.3.5-2.3 1.3-4.1 1.9-6.1.7-2.3.1-4.8-2.1-6-1.8-1-4-.5-5.6.9Z" />
    </svg>
  )
}

export function cardIcon(key: string, size = 56): ReactNode {
  switch (key) {
    case 'layoff': return <Briefcase size={size} strokeWidth={1.6} />
    case 'furnace': return <Flame size={size} strokeWidth={1.6} />
    case 'combined': return <span className="twist-icon-pair"><Briefcase size={size * 0.72} strokeWidth={1.6} /><House size={size * 0.72} /></span>
    case 'hours_cut': return <Clock size={size} strokeWidth={1.6} />
    case 'rent_up': return <span className="twist-icon-pair"><House size={size * 0.8} /><ArrowUpRight size={size * 0.5} strokeWidth={2} /></span>
    case 'bills_inflation': return <Coins size={size} strokeWidth={1.6} />
    case 'car_repair': return <span className="twist-icon-pair"><Car size={size * 0.78} strokeWidth={1.6} /><Wrench size={size * 0.5} strokeWidth={1.8} /></span>
    case 'dental': return <Tooth size={size} />
    case 'vet': return <PawPrint size={size} strokeWidth={1.6} />
    case 'sick_leave': return <Thermometer size={size} strokeWidth={1.6} />
    case 'parental': return <Baby size={size} strokeWidth={1.6} />
    case 'moving': return <Boxes size={size} strokeWidth={1.6} />
    case 'random': return <Shuffle size={size} strokeWidth={1.6} />
    default: return <Briefcase size={size} strokeWidth={1.6} />
  }
}

export function TwistCardFace({ title, text, cardKey, kicker = 'TWIST', className = '', style, scale = 1 }: { title: string; text?: string; cardKey: string; kicker?: string; className?: string; style?: CSSProperties; scale?: number }) {
  return (
    <div className={`twist-card ${className}`} style={{ ...style, fontSize: `${scale}em` }}>
      <div className="twist-card-inner">
        <header className="twist-card-band"><span>{kicker}</span><strong>{title}</strong></header>
        <div className="twist-card-art">{cardIcon(cardKey, 64)}</div>
        {text && <p className="twist-card-text">{text}</p>}
        <footer className="twist-card-foot"><i /><span>PULP · what comes next</span><i /></footer>
      </div>
    </div>
  )
}

export function TwistCardBack({ className = '', style, label }: { className?: string; style?: CSSProperties; label?: string }) {
  return (
    <div className={`twist-card twist-card-back ${className}`} style={style} aria-hidden="true">
      <div className="twist-card-back-inner">
        <span className="twist-back-mark">PULP<i>.</i></span>
        {label && <span className="twist-back-label">{label}</span>}
      </div>
    </div>
  )
}
