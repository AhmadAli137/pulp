/* The Stage 1 report: what PULP learned before anyone spoke, in plain language or in technical detail.
   Data: GET /api/report/stage1?account_id= (deterministic, no model). Works without an account (dataset only). */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, FileText, Printer } from 'lucide-react'
import { api, type ReportSection, type Stage1Report } from '../services/api'
import { useApp } from '../stores/useApp'
import { DataTable, ErrorBox, Spinner, Toggle } from '../components/ui'

type Mode = 'plain' | 'technical'
const DATASET_FIRST: Record<Mode, string> = { plain: 'What we looked at', technical: 'Data sources and coverage' }

const slug = (mode: Mode, i: number, h: string) =>
  `s1r-${mode}-${i}-${h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)}`

/** **bold** inside a line of text. */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>))
}

/** Paragraphs and "- " bullet lists, the only markdown the report uses in bodies. */
function Body({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) { blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(' '))}</p>); para = [] }
    if (list.length) { blocks.push(<ul key={`u${blocks.length}`}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = [] }
  }
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) { flush(); continue }
    if (t.startsWith('- ')) { if (para.length) flush(); list.push(t.slice(2)) }
    else { if (list.length) flush(); para.push(t) }
  }
  flush()
  return <>{blocks}</>
}

function toMarkdown(r: Stage1Report): string {
  const cell = (c: unknown) => String(c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const out: string[] = []
  for (const half of [r.plain, r.technical]) {
    out.push(`# ${half.title}`, '', half.summary, '')
    for (const s of half.sections) {
      out.push(`## ${s.heading}`, '', s.body, '')
      if (s.table) {
        out.push(`| ${s.table.headers.map(cell).join(' | ')} |`, `|${'---|'.repeat(s.table.headers.length)}`)
        for (const row of s.table.rows) out.push(`| ${row.map(cell).join(' | ')} |`)
        out.push('')
      }
    }
  }
  out.push(`_Generated ${r.generated_at} by PULP. Deterministic; no model._`)
  return out.join('\n') + '\n'
}

function download(r: Stage1Report) {
  const blob = new Blob([toMarkdown(r)], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = r.account_id ? `pulp-stage1-report-${r.account_id}.md` : 'pulp-stage1-report.md'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Section({ s, id, n }: { s: ReportSection; id: string; n: number }) {
  return (
    <section className="s1r-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}><span className="s1r-num" aria-hidden="true">{n}</span>{s.heading}</h2>
      <div className="s1r-body"><Body text={s.body} /></div>
      {s.table && <DataTable headers={s.table.headers} rows={s.table.rows} caption={s.heading} />}
    </section>
  )
}

export default function Report() {
  const accountId = useApp((s) => s.accountId)
  const [mode, setMode] = useState<Mode>(() => {
    try { return (localStorage.getItem('pulp.report.mode') as Mode) === 'technical' ? 'technical' : 'plain' } catch { return 'plain' }
  })
  const [report, setReport] = useState<Stage1Report | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true); setErr(null)
    api.stage1Report(accountId)
      .then((r) => { if (live) setReport(r) })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [accountId])

  const change = (m: string) => {
    setMode(m as Mode)
    try { localStorage.setItem('pulp.report.mode', m) } catch { /* private window */ }
  }

  const half = report ? report[mode] : null
  const ids = useMemo(() => (half ? half.sections.map((s, i) => slug(mode, i, s.heading)) : []), [half, mode])
  // Account sections come first; the dataset part always opens with the data-sources section.
  const accountCount = useMemo(() => {
    if (!half || !report?.account_id) return 0
    const first = half.sections.findIndex((s) => s.heading === DATASET_FIRST[mode])
    return first > 0 ? first : 0
  }, [half, report, mode])

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <article className="s1r" aria-busy={loading}>
      <style>{CSS}</style>
      <header className="s1r-head card">
        <div className="s1r-head-text">
          <span className="editorial-label"><FileText size={14} aria-hidden="true" /> Stage 1 report · From records to a person</span>
          <h1>{half?.title ?? 'What PULP learned'}</h1>
          {half && <p className="s1r-summary">{half.summary}</p>}
          <p className="small muted">
            {report ? <>Generated {new Date(report.generated_at).toLocaleString()} · {report.account_id ? `account ${report.account_id} plus the whole dataset` : 'whole dataset (load an account to add its own section)'} · deterministic, no AI model</> : 'Loading…'}
          </p>
        </div>
        <div className="s1r-toolbar">
          <Toggle value={mode} onChange={change} options={[{ key: 'plain', label: 'Plain language' }, { key: 'technical', label: 'Technical' }]} />
          <div className="s1r-actions">
            <button type="button" className="bank-button" onClick={() => report && download(report)} disabled={!report}><Download size={15} aria-hidden="true" /> Download as Markdown</button>
            <button type="button" className="bank-button" onClick={() => window.print()} disabled={!report}><Printer size={15} aria-hidden="true" /> Print</button>
          </div>
        </div>
      </header>

      <ErrorBox msg={err} />
      {loading && !report && <p className="s1r-loading"><Spinner /> Building the report…</p>}

      {half && (
        <div className="s1r-layout">
          <nav className="s1r-toc card" aria-label="Report contents">
            <strong>Contents</strong>
            <ol>
              {half.sections.map((s, i) => (
                <li key={ids[i]} className={i < accountCount ? 's1r-toc-acct' : ''}>
                  <button type="button" onClick={() => jump(ids[i])}>{s.heading}</button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="s1r-doc card">
            {half.sections.map((s, i) => (
              <Fragment key={ids[i]}>
                {i === 0 && accountCount > 0 && <p className="s1r-part">This account</p>}
                {i === accountCount && <p className="s1r-part">{accountCount > 0 ? 'The whole dataset' : 'The dataset'}</p>}
                <Section s={s} id={ids[i]} n={i + 1} />
              </Fragment>
            ))}
            <p className="small muted s1r-foot">
              Data: PKDD'99 Discovery Challenge Financial dataset, CTU Prague Relational Dataset Repository. Amounts in CAD.
              Every number is computed by PULP's engine from the records; personas are fictional.
            </p>
          </div>
        </div>
      )}
    </article>
  )
}

const CSS = `
.s1r { display: grid; gap: 16px; }
.s1r-head { display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; align-items: flex-start; }
.s1r-head-text { flex: 1 1 420px; min-width: 0; }
.s1r-head h1 { font-family: var(--font-head); font-size: clamp(1.5rem, 2.6vw, 2.1rem); margin: 6px 0 8px; color: var(--forest); }
.s1r-head .editorial-label { display: inline-flex; gap: 6px; align-items: center; }
.s1r-summary { font-size: 1.05rem; line-height: 1.55; max-width: 72ch; margin: 0 0 8px; }
.s1r-toolbar { display: grid; gap: 10px; justify-items: end; }
.s1r-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.s1r-actions .bank-button { display: inline-flex; gap: 6px; align-items: center; }
.s1r-loading { display: flex; gap: 10px; align-items: center; }
.s1r-layout { display: grid; grid-template-columns: minmax(200px, 250px) minmax(0, 1fr); gap: 16px; align-items: start; }
.s1r-toc { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow: auto; font-size: .9rem; }
.s1r-toc ol { margin: 8px 0 0; padding-left: 1.3em; display: grid; gap: 2px; }
.s1r-toc li::marker { color: var(--gray-2); }
.s1r-toc li.s1r-toc-acct::marker { color: var(--orange); }
.s1r-toc button { display: block; width: 100%; background: none; border: 0; padding: 3px 0; text-align: left; cursor: pointer; color: var(--charcoal); font: inherit; line-height: 1.35; }
.s1r-toc button:hover, .s1r-toc button:focus-visible { color: var(--orange-text); text-decoration: underline; }
.s1r-doc { min-width: 0; padding: clamp(16px, 3vw, 36px); }
.s1r-part { font-family: var(--font-head); text-transform: uppercase; letter-spacing: .08em; font-size: .75rem; font-weight: 700;
  color: var(--orange-text); border-bottom: 2px solid var(--orange-soft); padding-bottom: 6px; margin: 8px 0 4px; }
.s1r-section { padding: 18px 0 22px; border-bottom: 1px solid var(--line); scroll-margin-top: 16px; }
.s1r-section:last-of-type { border-bottom: 0; }
.s1r-section h2 { font-family: var(--font-head); font-size: 1.2rem; color: var(--forest); margin: 0 0 10px; display: flex; gap: 10px; align-items: baseline; }
.s1r-num { flex: none; display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%;
  background: var(--orange-soft); color: var(--orange-text); font-size: .78rem; font-weight: 700; }
.s1r-body { max-width: 78ch; line-height: 1.6; }
.s1r-body p { margin: 0 0 10px; }
.s1r-body ul { margin: 0 0 10px; padding-left: 1.2em; display: grid; gap: 6px; }
.s1r-section .table-scroll { margin-top: 8px; }
.s1r-section table.data td, .s1r-section table.data th { vertical-align: top; text-align: left; }
.s1r-section table.data td:first-child { font-weight: 600; color: var(--forest); }
.s1r-foot { margin-top: 18px; }
@media (max-width: 860px) {
  .s1r-layout { grid-template-columns: 1fr; }
  .s1r-toc { position: static; max-height: none; }
  .s1r-toolbar { justify-items: start; }
}
@media print {
  .bank-header, .bank-nav-band, .bank-page-heading, .bank-skip, .pulp-launcher, .pulp-panel, .s1r-toolbar, .s1r-toc { display: none !important; }
  .bank-main, .bank-width { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .s1r-layout { display: block; }
  .s1r-doc, .s1r-head { box-shadow: none !important; border: 0 !important; padding: 0 !important; }
  .s1r-section { break-inside: avoid-page; }
  .s1r-section h2 { break-after: avoid; }
  .table-scroll { overflow: visible !important; }
  table.data { font-size: 9pt; }
  body { background: #fff !important; }
}
`
