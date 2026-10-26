import { Bookmark, EllipsisVertical, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { RosterPick } from '../../../../core/roster'
import { loadoutNoun, type PickerLoadout } from './pickerRows'
import { PointsChip } from './PointsChip'

type Props = {
  loadout: PickerLoadout
  /** The datasheet's name, absent when this rules version does not offer it. */
  datasheet: string | null
  /** The datasheet of each unit in an attached unit, which stands as a row of its own rather than under one datasheet. */
  members?: readonly string[]
  addable: boolean
  unavailableReason: string | null
  onPreview: (entryId: string, name: string) => void
  onApply: (picks: readonly RosterPick[]) => void
  onRename: (loadout: PickerLoadout) => void
  onDelete: (loadout: PickerLoadout) => void
}

/** A saved loadout, laid out like the datasheet row it sits under so both read and tab the same way. */
export const LoadoutRow = memo(function LoadoutRow({
  loadout,
  datasheet,
  members,
  addable,
  unavailableReason,
  onPreview,
  onApply,
  onRename,
  onDelete,
}: Props) {
  const noun = loadoutNoun(loadout)
  const Icon = members ? Users : Bookmark
  const name = (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-faint" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-xs leading-tight font-semibold tracking-wide uppercase">{loadout.name}</span>
        {members ? <span className="mt-0.5 block text-2xs text-dim">{members.join(' · ')}</span> : null}
        {unavailableReason ? <span className="mt-1 block text-2xs font-normal normal-case text-discarded">{unavailableReason}</span> : null}
      </span>
    </span>
  )
  return (
    <div
      data-saved-loadout={loadout.name}
      className={`flex flex-wrap items-center gap-1.5 border border-edge bg-card px-2.5 py-1.5 ${members ? '' : 'ml-3 border-l-2 border-l-info'}`}
    >
      {datasheet ? (
        <button
          type="button"
          className="flex min-w-12 flex-1 items-center text-left hover:text-info"
          aria-label={`View ${datasheet} datasheet for saved ${noun} ${loadout.name}`}
          onClick={() => onPreview(loadout.picks[0].entryId, datasheet)}
        >
          {name}
        </button>
      ) : (
        <span className="flex min-w-12 flex-1">{name}</span>
      )}
      <span className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Saved ${noun} actions for ${loadout.name}`}
                className="size-6 text-faint hover:text-bone"
              />
            }
          >
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem className="text-xs font-semibold uppercase" onClick={() => onRename(loadout)}>
              <Pencil className="size-3.5" /> Rename {noun}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" className="text-xs font-semibold uppercase" onClick={() => onDelete(loadout)}>
              <Trash2 className="size-3.5" /> Delete {noun}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <PointsChip points={loadout.points} />
        <Button
          size="sm"
          className="shrink-0 px-2"
          aria-label={`Add saved ${noun} ${loadout.name}`}
          disabled={!addable}
          onClick={() => onApply(loadout.picks)}
        >
          <Plus className="size-3" />
          Add
        </Button>
      </span>
    </div>
  )
})
