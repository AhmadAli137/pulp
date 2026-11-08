import { highlightNumbers } from './shared'

/* Pulp's words as ordinary chat text: paragraphs in the bubble's own font and size, questions ending with their own
   "?" inline. No display type, no decorative question mark. */
export default function PulpText({ text }: { text: string }) {
  const paragraphs = (text ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  if (!paragraphs.length) return null
  return <>{paragraphs.map((p, i) => <p key={i}>{highlightNumbers(p)}</p>)}</>
}
