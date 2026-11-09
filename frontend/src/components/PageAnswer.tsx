import type { ReactNode } from 'react'

/** The one-sentence answer to a tab's question (the page's h1), built from this account's own numbers. It is the
 *  strongest thing on the page; everything after it is supporting detail. `pending` mutes it while there is no answer
 *  yet (still loading, or nothing to answer); `busy` marks only the real loading states for assistive technology. The
 *  sentence is a polite live region, so a new answer (after a shock runs, say) is read out once it is ready. */
export default function PageAnswer({ children, pending = false, busy = false }: { children: ReactNode; pending?: boolean; busy?: boolean }) {
  return <p className={`page-answer${pending ? ' is-pending' : ''}`} aria-live="polite" aria-busy={busy || undefined}>{children}</p>
}

/** A figure inside the answer sentence. */
export function Num({ children }: { children: ReactNode }) {
  return <b className="page-answer-num">{children}</b>
}
