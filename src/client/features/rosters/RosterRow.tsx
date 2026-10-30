import { Link } from '@tanstack/react-router'
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  EllipsisVertical,
  Eye,
  EyeOff,
  GitBranchPlus,
  Link2,
  Lock,
  LockOpen,
  Pencil,
  Printer,
  QrCode,
  Trash2,
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
import { useNativeShare } from '../../nativeBridge'
import { shareButtonLabel } from '../../useShareLink'
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

/** A list on its own is a card; a base shares its card with its variants, which are the slim rows beneath it. */
export const rosterRowFrame: Record<RosterRowLayout, string> = {
  card: 'border border-edge bg-panel hover:border-info hover:bg-raised',
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
  updates,
  showVisibility = true,
  onNeedsAccount,
}: {
  roster: SavedRoster
  layout?: RosterRowLayout
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
  updates?: RosterUpdates
  /** A visitor's list on this device, whose account-only actions ask them to sign up instead. */
  onNeedsAccount?: (reason: AccountReason) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const title = rosterTitle(roster, faction, label)
  const items = { roster, title, actions, origin, onEdit, onDelete, onNeedsAccount }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <article
            data-roster={title}
            data-variant={layout === 'variant' || undefined}
            className={`flex items-center gap-2 p-2 ${rosterRowFrame[layout]}`}
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
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`} />}>
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem className={MENU_ITEM} render={<Link to="/rosters/$id" params={{ id: roster.id }} target="_blank" />}>
              <Eye /> View
            </DropdownMenuItem>
            <RosterActionItems Item={DropdownMenuItem} Separator={DropdownMenuSeparator} showPrivacy {...items} />
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
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
  actions,
  origin,
  onEdit,
  onDelete,
  onNeedsAccount,
  showPrivacy = false,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator
  roster: SavedRoster
  /** What the library calls this list, so an export and a share sheet say the same. */
  title: string
  actions: RosterActions
  origin: string
  onEdit: () => void
  onDelete: () => void
  onNeedsAccount?: (reason: AccountReason) => void
  /** Only the overflow menu offers making a list private again; the row menu is shorter. */
  showPrivacy?: boolean
}) {
  const feedback = actions.shareFeedback?.id === roster.id ? actions.shareFeedback.result : null
  const nativeShare = useNativeShare()
  const orAccount = (reason: AccountReason, action: () => void) => (onNeedsAccount ? () => onNeedsAccount(reason) : action)
  return (
    <>
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
      <Separator />
      <Item
        className={MENU_ITEM}
        disabled={!origin || actions.access.isPending}
        onClick={orAccount('share', () => void actions.share(roster, title))}
      >
        <Link2 />
        {roster.visibility === 'private' ? (
          <span>
            <span className="block">{nativeShare ? 'Make unlisted and share' : 'Make unlisted and copy link'}</span>
            <span className="block text-xs text-dim">Anyone with the link can read this roster.</span>
          </span>
        ) : (
          <span>{shareButtonLabel(feedback, nativeShare, 'link')}</span>
        )}
      </Item>
      {showPrivacy && roster.visibility !== 'private' ? (
        <Item
          className={MENU_ITEM}
          disabled={actions.access.isPending}
          onClick={() => actions.access.mutate({ id: roster.id, visibility: 'private' })}
        >
          <EyeOff /> Make private
        </Item>
      ) : null}
      <Item className={MENU_ITEM} disabled={actions.take.isPending} onClick={() => actions.take.mutate({ roster, title })}>
        <Download /> Export text
      </Item>
      <Item className={MENU_ITEM} disabled={actions.exchange.isPending} onClick={() => actions.exchange.mutate({ roster, title })}>
        <QrCode /> Exchange code
      </Item>
      <Item className={MENU_ITEM} onClick={() => actions.print(roster.id)}>
        <Printer /> Print
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
