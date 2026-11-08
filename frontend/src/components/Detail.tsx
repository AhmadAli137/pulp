import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useShowDetail, useView } from '../stores/view'

/** Secondary content: rendered in Full detail, or after "Show full detail" on this page in Simple view. */
export function Detail({ children }: { children: ReactNode }) {
  return useShowDetail() ? <>{children}</> : null
}

/** The single button at the end of a page in Simple view. */
export function ShowFullDetail({ what = 'the rest of this page' }: { what?: string }) {
  const show = useShowDetail()
  const reveal = useView((s) => s.reveal)
  if (show) return null
  return (
    <div className="show-full">
      <button type="button" className="show-full-btn" onClick={reveal}>
        Show full detail <ChevronDown size={16} aria-hidden="true" />
      </button>
      <span>Everything else on {what} is one click away.</span>
    </div>
  )
}
