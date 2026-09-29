import { Link } from '@tanstack/react-router'
import { Copy, Download, EllipsisVertical, Eye, GitBranchPlus, Link2, Lock, Pencil, Printer, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { NamedRosterDifferences } from '../../../core/rosterDifferences'
import type { RosterActions, SavedRoster } from './rosterLibrary'
import { type RosterProblem, RosterSummary, type RosterSummaryFaction, RosterVariantSummary, rosterTitle } from './RosterSummary'

/**
 * One saved list in the library: what it is, what it costs, and what can be done to it.
 *
 * The actions are offered twice — an overflow button and a right-click menu — because
 * a library is read on a phone as well as a desktop. Both are drawn from one list.
 */
export function RosterRow({
  roster,
  layout = 'card',
  faction,
  actions,
  origin,
  onEdit,
  onDelete,
  points,
  label,
  dispositionName,
  factionLoading,
  pointsLoading,
  problem,
  differences,
  showVisibility = true,
}: {
  roster: SavedRoster
  /**
   * A list on its own is a card; a base shares its card with its variants, which
   * are the slim rows beneath it.
   */
  layout?: 'card' | 'base' | 'variant'
  /** What a variant changes from its base, arriving with the points. */
  differences?: NamedRosterDifferences | null
  /** A variant names its visibility only when it differs from the base's. */
  showVisibility?: boolean
  faction?: RosterSummaryFaction
  actions: RosterActions
  origin: string
  onEdit: () => void
  onDelete: () => void
  /** Priced with every other list in the library, so a row asks for nothing of its own. */
  points?: number | null
  /** What an unnamed list is called, folded from its units beside its total. */
  label?: string
  dispositionName?: string
  factionLoading?: boolean
  pointsLoading?: boolean
  /** Why the current army data says this list cannot be fielded, judged beside the totals. */
  problem?: RosterProblem | null
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const title = rosterTitle(roster, faction, label)
  const items = { roster, title, actions, origin, onEdit, onDelete }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <article
            data-roster={title}
            data-variant={layout === 'variant' || undefined}
            className={`flex items-center gap-2 p-2 ${
              layout === 'card' ? 'border border-edge bg-panel hover:border-azure' : 'hover:bg-raised'
            } ${layout === 'variant' ? 'border-t border-edge py-1.5 pl-3' : ''}`}
          />
        }
      >
        <Link to="/rosters/$id" params={{ id: roster.id }} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 p-1">
          {layout === 'variant' ? (
            <RosterVariantSummary
              roster={roster}
              faction={faction}
              points={points}
              label={label}
              dispositionName={dispositionName}
              pointsLoading={pointsLoading}
              problem={problem}
              differences={differences}
              showVisibility={showVisibility}
            />
          ) : (
            <RosterSummary
              roster={roster}
              faction={faction}
              points={points}
              label={label}
              dispositionName={dispositionName}
              factionLoading={factionLoading}
              pointsLoading={pointsLoading}
              problem={problem}
            />
          )}
        </Link>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`} />}>
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem render={<Link to="/rosters/$id" params={{ id: roster.id }} target="_blank" />}>
              <Eye /> View
            </DropdownMenuItem>
            <RosterActionItems Item={DropdownMenuItem} showPrivacy {...items} />
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <RosterActionItems Item={ContextMenuItem} {...items} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** The actions themselves, in whichever menu asked for them. */
function RosterActionItems({
  Item,
  roster,
  title,
  actions,
  origin,
  onEdit,
  onDelete,
  showPrivacy = false,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  roster: SavedRoster
  /** What the library calls this list, so an export and a share sheet say the same. */
  title: string
  actions: RosterActions
  origin: string
  onEdit: () => void
  onDelete: () => void
  /** Only the overflow menu offers making a list private again; the row menu is shorter. */
  showPrivacy?: boolean
}) {
  const feedback = actions.shareFeedback?.id === roster.id ? actions.shareFeedback.result : null
  return (
    <>
      <Item onClick={() => actions.print(roster.id)}>
        <Printer /> Print
      </Item>
      <Item disabled={!origin || actions.access.isPending} onClick={() => void actions.share(roster, title)}>
        <Link2 /> {feedback === 'shared' ? 'Link shared' : feedback === 'copied' ? 'Link copied' : 'Share link'}
      </Item>
      {showPrivacy && roster.visibility !== 'private' ? (
        <Item disabled={actions.access.isPending} onClick={() => actions.access.mutate({ id: roster.id, visibility: 'private' })}>
          <Lock /> Make private
        </Item>
      ) : null}
      <Item disabled={actions.take.isPending} onClick={() => actions.take.mutate({ roster, title })}>
        <Download /> Export GW text
      </Item>
      <Item onClick={onEdit}>
        <Pencil /> Edit setup
      </Item>
      <Item disabled={actions.variant.isPending} onClick={() => actions.variant.mutate(roster)}>
        <GitBranchPlus /> New variant
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
