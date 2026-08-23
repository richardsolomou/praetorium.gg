import { Link } from '@tanstack/react-router'
import { Copy, Download, EllipsisVertical, Eye, Link2, Lock, Pencil, Printer, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { GAME_SIZES } from '../../../core/battle'
import { ROSTER_SOURCE_LABELS } from '../../../core/savedRoster'
import { formatDate } from '../../dates'
import { FactionLabel, type FactionPresentation } from '../FactionMark'
import type { RosterActions, SavedRoster } from './rosterLibrary'

type Faction = FactionPresentation & { detachments: { id: string; name: string }[] }

/**
 * One saved list in the library: what it is, what it costs, and what can be done to it.
 *
 * The actions are offered twice — an overflow button and a right-click menu — because
 * a library is read on a phone as well as a desktop. Both are drawn from one list.
 */
export function RosterRow({
  roster,
  faction,
  actions,
  origin,
  onEdit,
  onDelete,
  points,
}: {
  roster: SavedRoster
  faction?: Faction
  actions: RosterActions
  origin: string
  onEdit: () => void
  onDelete: () => void
  /** Priced with every other list in the library, so a row asks for nothing of its own. */
  points?: number | null
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const detachments = roster.detachmentIds.map((id) => faction?.detachments.find((entry) => entry.id === id)?.name).filter(Boolean)
  const size = GAME_SIZES.find((entry) => entry.limit === roster.limit)
  const items = { roster, actions, origin, onEdit, onDelete }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <article data-roster={roster.name} className="flex items-center gap-2 border border-edge bg-panel p-2 hover:border-azure" />
        }
      >
        <Link to="/rosters/$id" params={{ id: roster.id }} className="min-w-0 flex-1 p-1 text-left">
          <span className="block truncate font-bold uppercase">{roster.name}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {faction ? <FactionLabel faction={faction} chip /> : null}
            {detachments.map((name) => (
              <span key={name} className="chip">
                {name}
              </span>
            ))}
          </span>
          <span className="mt-1 block text-xs text-dim">
            11th edition · {size?.name ?? `${roster.limit} points`} · {roster.picks.length} units · {ROSTER_SOURCE_LABELS[roster.source]} ·
            updated {formatDate(roster.updatedAt)}
          </span>
        </Link>
        <span className="shrink-0 text-right">
          <span className="readout block text-lg font-bold">
            {points ?? '—'}/{roster.limit}
          </span>
          <span className="text-xs text-dim">{roster.visibility === 'private' ? 'Private' : 'Unlisted'}</span>
        </span>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${roster.name}`} />}>
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-none border border-edge bg-panel text-bone">
            <DropdownMenuItem render={<Link to="/rosters/$id" params={{ id: roster.id }} target="_blank" />}>
              <Eye /> View
            </DropdownMenuItem>
            <RosterActionItems Item={DropdownMenuItem} showPrivacy {...items} />
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent className="rounded-none border border-edge bg-panel text-bone">
        <RosterActionItems Item={ContextMenuItem} {...items} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** The actions themselves, in whichever menu asked for them. */
function RosterActionItems({
  Item,
  roster,
  actions,
  origin,
  onEdit,
  onDelete,
  showPrivacy = false,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  roster: SavedRoster
  actions: RosterActions
  origin: string
  onEdit: () => void
  onDelete: () => void
  /** Only the overflow menu offers making a list private again; the row menu is shorter. */
  showPrivacy?: boolean
}) {
  const copied = actions.copiedFor === roster.id
  return (
    <>
      <Item onClick={() => actions.print(roster.id)}>
        <Printer /> Print
      </Item>
      <Item disabled={!origin || actions.access.isPending} onClick={() => void actions.share(roster)}>
        <Link2 /> {copied ? 'Link copied' : roster.visibility === 'private' ? 'Share unlisted link' : 'Copy link'}
      </Item>
      {showPrivacy && roster.visibility === 'unlisted' ? (
        <Item disabled={actions.access.isPending} onClick={() => actions.access.mutate({ id: roster.id, visibility: 'private' })}>
          <Lock /> Make private
        </Item>
      ) : null}
      <Item disabled={actions.take.isPending} onClick={() => actions.take.mutate(roster)}>
        <Download /> Export GW text
      </Item>
      <Item onClick={onEdit}>
        <Pencil /> Edit setup
      </Item>
      <Item disabled={actions.duplicate.isPending} onClick={() => actions.duplicate.mutate(roster)}>
        <Copy /> Duplicate
      </Item>
      <Item variant="destructive" disabled={actions.remove.isPending} onClick={onDelete}>
        <Trash2 /> Delete
      </Item>
    </>
  )
}
