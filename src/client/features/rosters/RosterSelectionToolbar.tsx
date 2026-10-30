import { Archive, ArchiveRestore, EllipsisVertical, EyeOff, Link2, Lock, LockOpen, type LucideIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { RosterBatchAction } from '../../../core/rosterLibrary'
import { MENU_ITEM } from '../../components/MenuSection'
import { Problem } from '../../components/Problem'
import { countLabel } from '../../text'
import type { SavedRoster } from './rosterLibrary'

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
}: {
  selected: SavedRoster[]
  pending: boolean
  error: unknown
  onChange: (action: RosterBatchAction, ids: string[]) => void
  onDelete: () => void
}) {
  const ids = (applies: (roster: SavedRoster) => boolean) => selected.filter(applies).map((roster) => roster.id)
  const choices = (
    [
      { action: 'archive', label: 'Archive', icon: Archive, ids: ids((roster) => !roster.archived) },
      { action: 'unarchive', label: 'Unarchive', icon: ArchiveRestore, ids: ids((roster) => roster.archived) },
      { action: 'lock', label: 'Lock', icon: Lock, ids: ids((roster) => !roster.locked) },
      { action: 'unlock', label: 'Unlock', icon: LockOpen, ids: ids((roster) => roster.locked) },
      { action: 'unlisted', label: 'Make unlisted', icon: Link2, ids: ids((roster) => roster.visibility === 'private') },
      { action: 'private', label: 'Make private', icon: EyeOff, ids: ids((roster) => roster.visibility !== 'private') },
    ] satisfies Choice[]
  ).filter((choice) => choice.ids.length)
  // A count only where the action reaches part of the selection, such as unlocking the one locked roster of three.
  const label = (choice: Choice) => (choice.ids.length === selected.length ? choice.label : `${choice.label} (${choice.ids.length})`)

  return (
    <div
      role="toolbar"
      aria-label="Selected rosters"
      className="sticky top-(--app-header) z-10 mt-2 flex flex-wrap items-center gap-2 border border-edge bg-sunken px-3 py-2"
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
              <DropdownMenuSeparator />
              <DropdownMenuItem className={MENU_ITEM} variant="destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
      {error ? <Problem error={error} className="w-full" /> : null}
    </div>
  )
}
