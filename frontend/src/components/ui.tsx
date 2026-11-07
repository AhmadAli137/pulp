import type { ReactNode } from 'react'

export const fmt = {
  money: (v: number | null | undefined, digits = 0) =>
    v == null || Number.isNaN(v) ? '—' : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v),
  signed: (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt.money(Math.abs(v))}`,
  pct: (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`),
  pct100: (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${v.toFixed(digits)}%`),
  months: (v: number | null | undefined, digits = 1) => (v == null ? '—' : `${v.toFixed(digits)} mo`),
  num: (v: number | null | undefined, digits = 1) => (v == null ? '—' : v.toFixed(digits)),
  int: (v: number | null | undefined) => (v == null ? '—' : new Intl.NumberFormat('en-CA').format(Math.round(v))),
}

export function Tip({ text }: { text: string }) {
  return (
    <span className="tip" tabIndex={0} aria-label={text}>
      <span className="i" aria-hidden>i</span>
      <span className="box" role="tooltip">{text}</span>
    </span>
  )
}

export function Tile({ label, value, sub, tip, accent, gold }: { label: string; value: ReactNode; sub?: ReactNode; tip?: string; accent?: boolean; gold?: boolean }) {
  return (
    <div className={`tile${accent ? ' accent' : ''}${gold ? ' gold' : ''}`}>
      <div className="label">{label}{tip && <Tip text={tip} />}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Card({ title, right, children, className = '', soft, dark }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; soft?: boolean; dark?: boolean }) {
  return (
    <section className={`card${soft ? ' soft' : ''}${dark ? ' dark' : ''} ${className}`}>
      {(title || right) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function Chip({ children, tone = '' }: { children: ReactNode; tone?: '' | 'gold' | 'danger' | 'gray' | 'outline' }) {
  return <span className={`chip ${tone}`}>{children}</span>
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />
}

export function ErrorBox({ msg }: { msg: string | null }) {
  return msg ? <div className="err" role="alert">{msg}</div> : null
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Toggle({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { key: string; label: string }[] }) {
  return (
    <div className="toggle" role="group">
      {options.map((o) => (
        <button key={o.key} className={o.key === value ? 'on' : ''} onClick={() => onChange(o.key)} aria-pressed={o.key === value}>{o.label}</button>
      ))}
    </div>
  )
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function DataTable({ headers, rows, caption, highlight }: { headers: string[]; rows: (ReactNode | number | string)[][]; caption?: string; highlight?: number }) {
  return (
    <table className="data">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr>{headers.map((h, i) => <th key={h} className={i > 0 ? 'num' : ''}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={highlight === i ? 'hl' : ''}>
            {r.map((c, j) => <td key={j} className={j > 0 ? 'num' : ''}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
