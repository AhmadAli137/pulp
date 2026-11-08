import type { Symbol } from './symbols'

/** A small symbol in a soft round tint, so a glance tells you what kind of item this is before reading it. */
export default function ItemIcon({ symbol, size = 18 }: { symbol: Symbol; size?: number }) {
  const { Icon, tone } = symbol
  return (
    <span className={`item-icon tone-${tone}`} aria-hidden="true" style={{ width: size + 14, height: size + 14 }}>
      <Icon size={size} strokeWidth={1.8} />
    </span>
  )
}
