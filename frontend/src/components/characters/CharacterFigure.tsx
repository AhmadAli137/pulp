/* The Shock Dealer's cast, drawn as quiet line art: one forest stroke at 1.5px, one small accent in brand orange.
   Every figure shares the same head and shoulders; the prop says who they are. Keyed by the backend character id. */
import type { ReactNode } from 'react'

const INK = '#183B2D'
const ACCENT = '#E86A0C'

function Base({ children, hair }: { children?: ReactNode; hair?: ReactNode }) {
  return (
    <>
      <circle cx="40" cy="30" r="11" />
      {hair}
      <path d="M18 86c0-19 9-30 22-30s22 11 22 30" />
      <path d="M34 57l6 8 6-8" />
      {children}
    </>
  )
}

const FIGURES: Record<string, ReactNode> = {
  manager: <Base><path d="M40 65l-3 6 3 12 3-12z" stroke={ACCENT} /><rect x="64" y="52" width="18" height="24" rx="2" /><path d="M68 59h10M68 64h10M68 69h6" stroke={ACCENT} /></Base>,
  client: <Base hair={<path d="M29 27c2-9 20-11 22 0" />}><rect x="62" y="64" width="24" height="17" rx="2" /><path d="M69 64v-4h10v4" /><path d="M62 71h24" stroke={ACCENT} /></Base>,
  landlord: <Base hair={<path d="M28 24h24M32 24c0-6 16-6 16 0" />}><path d="M64 70l10-9 10 9v13H64z" /><circle cx="74" cy="56" r="0" /><path d="M71 83v-6h6v6" stroke={ACCENT} /><circle cx="70" cy="44" r="3" stroke={ACCENT} /><path d="M73 44h8M78 44v3" stroke={ACCENT} /></Base>,
  technician: <Base hair={<path d="M28 26c1-8 23-8 24 0" />}><path d="M66 80l14-14" /><path d="M80 66c-1-4 2-8 6-7l-3 3 1 3 3 1 3-3c1 4-3 7-7 6" stroke={ACCENT} /><path d="M28 64v22" /></Base>,
  mechanic: <Base hair={<path d="M28 25h24M30 25c1-8 19-8 20 0M52 25h6" stroke={ACCENT} />}><circle cx="75" cy="72" r="11" /><circle cx="75" cy="72" r="4" stroke={ACCENT} /></Base>,
  doctor: <Base><path d="M30 60c0 10 4 16 10 16s10-6 10-16" stroke={ACCENT} /><circle cx="40" cy="78" r="3" stroke={ACCENT} /><path d="M66 58h16v24H66zM74 64v12M68 70h12" /></Base>,
  dentist: <Base hair={<path d="M29 33h22" />}><path d="M67 58c3-3 7-2 8 0 1-2 5-3 8 0 3 4 0 10-2 13l-1 10c0 2-3 2-3 0l-2-7-2 7c0 2-3 2-3 0l-1-10c-2-3-5-9-2-13z" stroke={ACCENT} /></Base>,
  vet: <Base hair={<path d="M29 27c3-8 19-8 22 0" />}><circle cx="75" cy="74" r="6" stroke={ACCENT} /><circle cx="67" cy="64" r="2.6" /><circle cx="73" cy="60" r="2.6" /><circle cx="80" cy="60" r="2.6" /><circle cx="85" cy="65" r="2.6" /></Base>,
  midwife: <Base hair={<path d="M28 30c0-12 24-12 24 0v6" />}><path d="M62 70c4-8 18-8 22 0-4 8-18 8-22 0z" /><circle cx="69" cy="70" r="4" stroke={ACCENT} /></Base>,
  banker: <Base><path d="M40 65v18" /><path d="M62 60l12-7 12 7zM64 62v14M70 62v14M78 62v14M84 62v14M62 78h24" /><circle cx="74" cy="47" r="0" /><path d="M71 69h6" stroke={ACCENT} /></Base>,
  meter_reader: <Base hair={<path d="M28 24h24M30 24c1-7 19-7 20 0" />}><circle cx="75" cy="69" r="12" /><path d="M75 69l6-6" stroke={ACCENT} /><path d="M66 69h3M75 60v3M84 69h-3" /></Base>,
  recruiter: <Base><rect x="33" y="68" width="14" height="10" rx="1.5" stroke={ACCENT} /><circle cx="72" cy="62" r="8" /><path d="M78 68l8 8" /></Base>,
  relative: <Base hair={<path d="M29 25c3-6 19-6 22 0" />}><circle cx="76" cy="50" r="7" /><path d="M64 86c0-13 5-21 12-21s12 8 12 21" /><path d="M54 44c-2-4 3-7 5-3 2-4 7-1 5 3l-5 5z" stroke={ACCENT} /></Base>,
}

Object.assign(FIGURES, {
  // a hard hat and a flame: issues the evacuation order
  emergency_official: <Base hair={<path d="M27 27c0-9 26-9 26 0M25 27h30M40 18v-3" stroke={ACCENT} />}><path d="M75 84c-8 0-11-6-9-12 2-5 6-6 6-12 5 3 9 8 9 14 0-2 1-4 3-5 1 7-1 15-9 15z" stroke={ACCENT} /></Base>,
  // spectacles and a falling chart line
  economist: <Base><path d="M33 30h5M42 30h5M38 30h4" /><rect x="62" y="56" width="24" height="26" rx="2" /><path d="M65 62l6 6 5-3 7 12" stroke={ACCENT} /></Base>,
  // a microphone
  reporter: <Base hair={<path d="M29 26c2-8 20-9 22 0" />}><rect x="70" y="52" width="9" height="14" rx="4.5" stroke={ACCENT} /><path d="M66 63c0 6 4 9 8.5 9s8.5-3 8.5-9M74.5 72v10M69 82h11" /></Base>,
  // a cross on a clipboard
  health_officer: <Base hair={<path d="M29 25h22" />}><rect x="62" y="56" width="22" height="28" rx="2" /><path d="M73 62v12M67 68h12" stroke={ACCENT} /></Base>,
})

export const CHARACTER_IDS = Object.keys(FIGURES)

export default function CharacterFigure({ id, size = 96, title }: { id: string; size?: number; title?: string }) {
  const art = FIGURES[id] ?? <Base />
  return (
    <svg className="character-figure" width={size} height={size} viewBox="0 0 96 96" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}
      aria-label={title} fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {art}
    </svg>
  )
}
