/* One endpoint, rendered from the OpenAPI snapshot plus the curated note (summary, example request and response). */
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { EndpointNote } from '../../docs/endpoints'
import { CodeBlock } from './CodeBlock'

type Schema = { type?: string; anyOf?: Schema[]; $ref?: string; items?: Schema; enum?: unknown[]; pattern?: string;
  minimum?: number; maximum?: number; default?: unknown; description?: string; title?: string; properties?: Record<string, Schema>; required?: string[] }
export type Operation = { summary?: string; description?: string; parameters?: { name: string; in: string; required?: boolean; schema?: Schema; description?: string }[];
  requestBody?: { content?: Record<string, { schema?: Schema }> } }
export type Components = Record<string, Schema>

export function typeOf(s: Schema | undefined, comps: Components): string {
  if (!s) return 'any'
  if (s.$ref) return s.$ref.split('/').pop() ?? 'object'
  if (s.anyOf) {
    const parts = s.anyOf.filter((x) => x.type !== 'null').map((x) => typeOf(x, comps))
    const nullable = s.anyOf.some((x) => x.type === 'null')
    return parts.join(' | ') + (nullable ? ' | null' : '')
  }
  if (s.type === 'array') return `${typeOf(s.items, comps)}[]`
  return s.type ?? 'object'
}

function constraint(s: Schema | undefined): string {
  if (!s) return ''
  const inner = s.anyOf?.find((x) => x.type !== 'null') ?? s
  const bits: string[] = []
  if (inner.minimum != null) bits.push(`≥ ${inner.minimum}`)
  if (inner.maximum != null) bits.push(`≤ ${inner.maximum}`)
  if (inner.pattern) bits.push(inner.pattern.replace(/^\^\(?|\)?\$$/g, '').split('|').join(' | '))
  if (inner.enum) bits.push(inner.enum.join(' | '))
  return bits.join(', ')
}

type Row = { name: string; where: string; type: string; required: boolean; def: string; desc: string }

function rows(op: Operation, comps: Components): Row[] {
  const out: Row[] = (op.parameters ?? []).map((p) => ({
    name: p.name, where: p.in, type: typeOf(p.schema, comps), required: !!p.required,
    def: p.schema?.default != null ? JSON.stringify(p.schema.default) : '', desc: [p.description ?? p.schema?.description ?? '', constraint(p.schema)].filter(Boolean).join(' · '),
  }))
  const ref = op.requestBody?.content?.['application/json']?.schema?.$ref
  const body = ref ? comps[ref.split('/').pop() ?? ''] : undefined
  if (body?.properties) {
    for (const [name, s] of Object.entries(body.properties)) {
      out.push({ name, where: 'body', type: typeOf(s, comps), required: (body.required ?? []).includes(name),
        def: s.default != null ? JSON.stringify(s.default) : '', desc: [s.description ?? '', constraint(s)].filter(Boolean).join(' · ') })
    }
  }
  return out
}

const METHOD_CLASS: Record<string, string> = { get: 'get', post: 'post', delete: 'delete', put: 'put', patch: 'put' }

export function EndpointCard({ method, path, op, note, comps, defaultOpen }: { method: string; path: string; op: Operation; note?: EndpointNote; comps: Components; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const summary = note?.summary ?? (op.description ? op.description.split('\n\n')[0].replace(/\s+/g, ' ') : op.summary ?? '')
  const params = rows(op, comps)
  const id = `ep-${method}-${path.replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase()
  const example = note?.request ?? (method === 'get' ? `curl "https://askpulp.com${path.replace('{account_id}', '47788').replace('{change_id}', '<change_id>')}"` : undefined)
  return (
    <article className="docs-endpoint" id={id}>
      <button type="button" className="docs-endpoint-head" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((v) => !v)}>
        <span className={`docs-method ${METHOD_CLASS[method] ?? ''}`}>{method.toUpperCase()}</span>
        <code className="docs-path">{path}</code>
        <span className="docs-endpoint-summary">{summary}</span>
        <ChevronDown className="docs-chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="docs-endpoint-body" id={`${id}-body`}>
          {params.length > 0 ? (
            <div className="docs-table-wrap">
              <table className="docs-table">
                <caption className="docs-sr">Parameters for {method.toUpperCase()} {path}</caption>
                <thead><tr><th scope="col">Name</th><th scope="col">In</th><th scope="col">Type</th><th scope="col">Default</th><th scope="col">Notes</th></tr></thead>
                <tbody>
                  {params.map((r) => (
                    <tr key={`${r.where}-${r.name}`}>
                      <td><code>{r.name}</code>{r.required && <span className="docs-req" title="required">required</span>}</td>
                      <td>{r.where}</td><td><code>{r.type}</code></td><td>{r.def && <code>{r.def}</code>}</td><td>{r.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="docs-muted">No parameters.</p>}
          {example && <CodeBlock label="Request" code={example} />}
          {note?.response && <CodeBlock label="Response (trimmed)" code={note.response} />}
          {note?.note && <p className="docs-callout">{note.note}</p>}
        </div>
      )}
    </article>
  )
}
