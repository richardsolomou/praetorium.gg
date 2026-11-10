import { Link } from '@tanstack/react-router'
import {
  Archive,
  ArchiveRestore,
  Copy,
  EllipsisVertical,
  Eye,
  GitBranchPlus,
  HandHelping,
  Lock,
  LockOpen,
  Pencil,
  Share2,
  Download,
  Swords,
  Trash2,
  Unlink,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MENU_ITEM } from '../../components/MenuSection'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { NamedRosterDifferences } from '../../../core/rosterDifferences'
import { VISIBILITY_ICON, VISIBILITY_NAME } from './visibility'
import type { RosterActions, SavedRoster } from './rosterLibrary'
import type { AccountReason } from './AccountPrompt'
import {
  type RosterProblem,
  RosterSummary,
  type RosterSummaryFaction,
  type RosterUpdates,
  RosterVariantSummary,
  rosterTitle,
} from './RosterSummary'

export type RosterRowLayout = 'card' | 'base' | 'variant'

/** A row's checkbox while the library is choosing rosters to archive or unarchive together. */
type RosterRowSelection = { checked: boolean; disabled: boolean; onCheckedChange: (checked: boolean) => void }

/** A list on its own is a card; a base shares its card with its variants, which are the slim rows beneath it. */
export const rosterRowFrame: Record<RosterRowLayout, string> = {
  card: 'part hover:border-runner-hi hover:bg-raised',
  base: 'hover:bg-raised',
  variant: 'border-t border-edge py-1.5 pl-3 hover:bg-raised',
}

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
  onEdit,
  onShare,
  onLend,
  onStartBattle,
  onDelete,
  points,
  label,
  dispositionName,
  factionLoading,
  pointsLoading,
  problem,
  differences,
  updates,
  showVisibility = true,
  onNeedsAccount,
  selection,
}: {
  roster: SavedRoster
  layout?: RosterRowLayout
  /** What a variant changes from its base, arriving with the points. */
  differences?: NamedRosterDifferences | null
  /** A variant names its visibility only when it differs from the base's. */
  showVisibility?: boolean
  faction?: RosterSummaryFaction
  actions: RosterActions
  onEdit: () => void
  onShare: () => void
  onLend: () => void
  onStartBattle: () => void
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
  updates?: RosterUpdates
  /** A visitor's list on this device, whose account-only actions ask them to sign up instead. */
  onNeedsAccount?: (reason: AccountReason) => void
  selection?: RosterRowSelection
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const title = rosterTitle(roster, faction, label)
  const items = { roster, title, grouped: layout !== 'card', actions, onEdit, onShare, onLend, onStartBattle, onDelete, onNeedsAccount }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <article
            data-roster={title}
            data-variant={layout === 'variant' || undefined}
            data-selected={selection?.checked || undefined}
            className={`relative flex items-center gap-2 p-2 ${rosterRowFrame[layout]} data-selected:bg-raised`}
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
              updates={updates}
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
              differences={differences}
              updates={updates}
            />
          )}
        </Link>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`} className={selection ? 'invisible' : undefined} />
            }
          >
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-max">
            <DropdownMenuItem className={MENU_ITEM} render={<Link to="/rosters/$id" params={{ id: roster.id }} target="_blank" />}>
              <Eye /> View
            </DropdownMenuItem>
            <RosterActionItems Item={DropdownMenuItem} Separator={DropdownMenuSeparator} {...items} />
          </DropdownMenuContent>
        </DropdownMenu>
        {selection ? (
          // Covers the whole row so a tap selects rather than opens it, with the box where the menu sat so nothing moves.
          <label className="absolute inset-0 flex cursor-pointer items-center justify-end pr-3 has-disabled:cursor-not-allowed">
            <input
              type="checkbox"
              className="size-5 accent-parchment"
              aria-label={`Select ${title}`}
              checked={selection.checked}
              disabled={selection.disabled}
              onChange={(event) => selection.onCheckedChange(event.target.checked)}
            />
          </label>
        ) : null}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-max">
        <RosterActionItems Item={ContextMenuItem} Separator={ContextMenuSeparator} {...items} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** The actions themselves, in whichever menu asked for them. */
function RosterActionItems({
  Item,
  Separator,
  roster,
  title,
  grouped,
  actions,
  onEdit,
  onShare,
  onLend,
  onStartBattle,
  onDelete,
  onNeedsAccount,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator
  roster: SavedRoster
  title: string
  /** Whether the list shares a card with its variants, so it can be taken out to stand on its own. */
  grouped: boolean
  actions: RosterActions
  onEdit: () => void
  onShare: () => void
  onLend: () => void
  onStartBattle: () => void
  onDelete: () => void
  onNeedsAccount?: (reason: AccountReason) => void
}) {
  const orAccount = (reason: AccountReason, action: () => void) => (onNeedsAccount ? () => onNeedsAccount(reason) : action)
  const VisibleIcon = VISIBILITY_ICON[roster.visibility]
  return (
    <>
      <Item className={MENU_ITEM} disabled={!roster.unitCount} onClick={orAccount('battle', onStartBattle)}>
        <Swords /> Start a battle
      </Item>
      <Separator />
      <Item className={MENU_ITEM} disabled={roster.locked} onClick={onEdit}>
        <Pencil /> Edit roster setup
      </Item>
      <Separator />
      <Item className={MENU_ITEM} disabled={actions.variant.isPending} onClick={orAccount('variant', () => actions.variant.mutate(roster))}>
        <GitBranchPlus /> Create variant
      </Item>
      <Item
        className={MENU_ITEM}
        disabled={actions.duplicate.isPending}
        onClick={orAccount('another-roster', () => actions.duplicate.mutate(roster))}
      >
        <Copy /> Duplicate
      </Item>
      {grouped ? (
        <Item className={MENU_ITEM} disabled={actions.split.isPending} onClick={() => actions.split.mutate(roster.id)}>
          <Unlink /> Make its own roster
        </Item>
      ) : null}
      <Separator />
      <Item className={MENU_ITEM} onClick={onShare}>
        <Share2 /> Share…
        <span className="ml-auto flex items-center gap-1 pl-4 text-2xs text-faint normal-case">
          <VisibleIcon className="size-3" /> {VISIBILITY_NAME[roster.visibility]}
        </span>
      </Item>
      <Item className={MENU_ITEM} disabled={actions.take.isPending} onClick={() => actions.take.mutate({ roster, title })}>
        <Download /> Export text
      </Item>
      <Item className={MENU_ITEM} onClick={orAccount('lend', onLend)}>
        <HandHelping /> Lend to a friend
      </Item>
      <Separator />
      <Item
        className={MENU_ITEM}
        disabled={actions.lock.isPending}
        onClick={orAccount('lock', () => actions.lock.mutate({ id: roster.id, locked: !roster.locked }))}
      >
        {roster.locked ? (
          <>
            <LockOpen /> Unlock roster
          </>
        ) : (
          <>
            <Lock /> Lock roster
          </>
        )}
      </Item>
      <Item
        className={MENU_ITEM}
        disabled={actions.archive.isPending}
        onClick={orAccount('archive', () => actions.archive.mutate({ id: roster.id, archived: !roster.archived }))}
      >
        {roster.archived ? (
          <>
            <ArchiveRestore /> Unarchive
          </>
        ) : (
          <>
            <Archive /> Archive
          </>
        )}
      </Item>
      <Separator />
      <Item className={MENU_ITEM} variant="destructive" disabled={actions.remove.isPending} onClick={onDelete}>
        <Trash2 /> Delete
      </Item>
    </>
  )
}
