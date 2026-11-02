import { Archive, ArchiveRestore, ChevronDown, EllipsisVertical, Eye, Lock, LockOpen, type LucideIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { RosterBatchAction } from '../../../core/rosterLibrary'
import { ROSTER_VISIBILITIES } from '../../../core/savedRoster'
import { MENU_ITEM } from '../../components/MenuSection'
import { Problem } from '../../components/Problem'
import { countLabel } from '../../text'
import type { SavedRoster } from './rosterLibrary'
import { VISIBILITY_ICON, VISIBILITY_NAME, VISIBILITY_REACH } from './visibility'

type Choice = { action: RosterBatchAction; label: string; icon: LucideIcon; ids: string[] }

/**
 * What can be done to the rosters ticked in the library, each action offered only when it would change one of them.
 * Phones get the same actions in one menu so the bar stays a single line.
 */
export function RosterSelectionToolbar({
  selected,
  pending,
  error,
  onChange,
  onDelete,
  allSelected,
  onSelectAll,
}: {
  selected: SavedRoster[]
  pending: boolean
  error: unknown
  onChange: (action: RosterBatchAction, ids: string[]) => void
  onDelete: () => void
  allSelected: boolean
  onSelectAll: (all: boolean) => void
}) {
  const ids = (applies: (roster: SavedRoster) => boolean) => selected.filter(applies).map((roster) => roster.id)
  const choices = (
    [
      { action: 'archive', label: 'Archive', icon: Archive, ids: ids((roster) => !roster.archived) },
      { action: 'unarchive', label: 'Unarchive', icon: ArchiveRestore, ids: ids((roster) => roster.archived) },
      { action: 'lock', label: 'Lock', icon: Lock, ids: ids((roster) => !roster.locked) },
      { action: 'unlock', label: 'Unlock', icon: LockOpen, ids: ids((roster) => roster.locked) },
    ] satisfies Choice[]
  ).filter((choice) => choice.ids.length)
  // A count only where the action reaches part of the selection, such as unlocking the one locked roster of three.
  const label = (choice: Choice) => (choice.ids.length === selected.length ? choice.label : `${choice.label} (${choice.ids.length})`)
  // Every level is always offered, so the selection can be set to any of them; one already true of all is disabled.
  const visibilities = ROSTER_VISIBILITIES.map((visibility) => ({
    action: visibility,
    label: VISIBILITY_NAME[visibility],
    icon: VISIBILITY_ICON[visibility],
    ids: ids((roster) => roster.visibility !== visibility),
  })) satisfies Choice[]
  const visibilityItems = visibilities.map((choice) => (
    <DropdownMenuItem
      key={choice.action}
      className={MENU_ITEM}
      disabled={!choice.ids.length}
      onClick={() => onChange(choice.action, choice.ids)}
    >
      <choice.icon />
      <span>
        <span className="block">{choice.ids.length ? label(choice) : `Already ${choice.label.toLowerCase()}`}</span>
        <span className="block text-xs font-normal tracking-normal normal-case text-dim">{VISIBILITY_REACH[choice.action]}</span>
      </span>
    </DropdownMenuItem>
  ))

  return (
    <div
      role="toolbar"
      aria-label="Selected rosters"
      className="sticky top-(--app-header) z-10 mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-sunken px-3 py-2"
    >
      <output className="mr-auto text-sm text-dim">
        {selected.length ? `${countLabel(selected.length, 'roster')} selected` : 'Choose rosters to change together.'}
      </output>
      {selected.length ? (
        <>
          <div className="hidden flex-wrap justify-end gap-2 sm:flex">
            {choices.map((choice) => (
              <Button
                key={choice.action}
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onChange(choice.action, choice.ids)}
              >
                <choice.icon /> {label(choice)}
              </Button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>
                <Eye /> Visibility <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {visibilityItems}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="destructive" disabled={pending} onClick={onDelete}>
              <Trash2 /> Delete
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="sm:hidden" disabled={pending} />}>
              <EllipsisVertical /> Actions
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {choices.map((choice) => (
                <DropdownMenuItem key={choice.action} className={MENU_ITEM} onClick={() => onChange(choice.action, choice.ids)}>
                  <choice.icon /> {label(choice)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className={MENU_ITEM}>
                  <Eye /> Visibility
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-72">{visibilityItems}</DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={MENU_ITEM} variant="destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => onSelectAll(!allSelected)}>
        {allSelected ? 'Clear' : 'Select all'}
      </Button>
      {error ? <Problem error={error} className="w-full" /> : null}
    </div>
  )
}
