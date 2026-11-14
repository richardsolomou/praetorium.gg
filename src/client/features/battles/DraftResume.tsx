import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, EllipsisVertical, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { summarySides } from '../../battleSummary'
import { ContextMenuItem, DropdownMenuItem } from '../../components/Menu'
import { useDateFormatting } from '../../dates'
import { myDraftsQuery } from '../../queries'
import { formatList } from '../../text'
import type { Battle } from './battle'

/**
 * The newest draft you have done something with, offered back as one row: drafts stay out of every battle list, and
 * New battle reuses an untouched one anyway. Its creator deletes it from the row, as from a battle's card.
 */
export function DraftResume({ viewerId, onDelete }: { viewerId?: string; onDelete: (battle: Battle) => void }) {
  const { data: drafts } = useQuery(myDraftsQuery())
  const { date } = useDateFormatting()
  const draft = drafts?.find((candidate) => candidate.players.length > 1 || candidate.armies.some(Boolean))
  if (!draft) return null
  const sides = summarySides(draft).map((side) => formatList(side.armies.length ? side.armies : side.players))
  const canDelete = Boolean(viewerId && draft.playerIds[0] === viewerId)
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="group relative part transition-colors hover:border-runner-hi hover:bg-raised" />}>
        <Link
          to="/battles/$token"
          params={{ token: draft.token }}
          data-draft-resume
          className={`flex min-h-14 items-center gap-3 py-2.5 pl-4 ${canDelete ? 'pr-11' : 'pr-4'}`}
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
        {canDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-2 size-7 -translate-y-1/2 opacity-60 group-hover:opacity-100"
                  aria-label="Actions for your draft"
                />
              }
            >
              <EllipsisVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(draft)}>
                <Trash2 /> Delete battle
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem render={<Link to="/battles/$token" params={{ token: draft.token }} />}>
          <Eye /> Open battle
        </ContextMenuItem>
        {canDelete ? (
          <ContextMenuItem variant="destructive" onClick={() => onDelete(draft)}>
            <Trash2 /> Delete battle
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
