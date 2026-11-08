import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** A code block that scrolls inside itself, with a copy button. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch { /* clipboard unavailable: the text stays selectable */ }
  }
  return (
    <div className="docs-code">
      <div className="docs-code-bar">
        <span>{label ?? 'shell'}</span>
        <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${label ?? 'code'}`}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre tabIndex={0}><code>{code}</code></pre>
    </div>
  )
}
