import { highlightNumbers } from './shared'

export default function PulpText({ text }: { text: string }) {
  const questionEnd = text.lastIndexOf('?')
  if (questionEnd < 0) return text ? <p>{highlightNumbers(text)}</p> : null
  const beforeEnd = text.slice(0, questionEnd)
  const boundary = Math.max(beforeEnd.lastIndexOf('. '), beforeEnd.lastIndexOf('! '), beforeEnd.lastIndexOf('\n'))
  const start = boundary < 0 ? 0 : boundary + (beforeEnd[boundary] === '\n' ? 1 : 2)
  const lead = text.slice(0, start).trim()
  const question = text.slice(start, questionEnd + 1).trim()
  const tail = text.slice(questionEnd + 1).trim()
  return <>{lead && <p>{highlightNumbers(lead)}</p>}<div className="pulp-question"><span className="pulp-question-mark" aria-hidden="true">?</span><p>{highlightNumbers(question)}</p></div>{tail && <p>{highlightNumbers(tail)}</p>}</>
}
