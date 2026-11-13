import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { summarySides } from '../../battleSummary'
import { useDateFormatting } from '../../dates'
import { myDraftsQuery } from '../../queries'
import { formatList } from '../../text'

/**
 * The newest draft you have done something with, offered back as one row: drafts stay out of every battle list, and
 * New battle reuses an untouched one anyway.
 */
export function DraftResume() {
  const { data: drafts } = useQuery(myDraftsQuery())
  const { date } = useDateFormatting()
  const draft = drafts?.find((candidate) => candidate.players.length > 1 || candidate.armies.some(Boolean))
  if (!draft) return null
  const sides = summarySides(draft).map((side) => formatList(side.armies.length ? side.armies : side.players))
  return (
    <Link
      to="/battles/$token"
      params={{ token: draft.token }}
      data-draft-resume
      className="flex min-h-14 items-center gap-3 part px-4 py-2.5 transition-colors hover:border-runner-hi hover:bg-raised"
    >
      <span className="chip shrink-0 text-dim">Draft</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">Continue your draft</span>
        <span className="block truncate text-xs text-dim">
          {sides.length > 1 ? sides.join(' vs ') : `${sides[0]} · no opponent yet`} · {date(draft.lastActivity)}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-parchment" aria-hidden />
    </Link>
  )
}
