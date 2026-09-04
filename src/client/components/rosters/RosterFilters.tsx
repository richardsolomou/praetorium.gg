import { ArrowDownUp, ListFilter } from 'lucide-react'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { GAME_SIZES } from '../../../core/battle'
import type { RosterVisibility } from '../../../core/savedRoster'
import { SearchableSelect, type SearchableGroup } from '../SearchableSelect'
import type { RosterSort } from './rosterSort'

export type RosterFilterState = {
  limit?: number
  faction?: string
  visibility?: RosterVisibility
  sort: RosterSort
}

const BATTLE_SIZE_GROUPS: SearchableGroup[] = [
  {
    label: '',
    items: [
      { label: 'All battle sizes', value: 'all' },
      ...GAME_SIZES.map((size) => ({
        label: `${size.name.replace(` (${size.limit})`, '')} · ${size.limit} points`,
        value: String(size.limit),
      })),
    ],
  },
]
const SHARING_GROUPS: SearchableGroup[] = [
  {
    label: '',
    items: [
      { label: 'Any sharing status', value: 'all' },
      { label: 'Private', value: 'private' },
      { label: 'Unlisted', value: 'unlisted' },
      { label: 'Public', value: 'public' },
    ],
  },
]
const SORT_GROUPS: { label: string; items: { label: string; value: RosterSort }[] }[] = [
  {
    label: 'Created',
    items: [
      { label: 'Recently created', value: 'created-desc' },
      { label: 'Least recently created', value: 'created-asc' },
    ],
  },
  {
    label: 'Updated',
    items: [
      { label: 'Recently updated', value: 'updated-desc' },
      { label: 'Least recently updated', value: 'updated-asc' },
    ],
  },
  {
    label: 'Name',
    items: [
      { label: 'A to Z', value: 'name-asc' },
      { label: 'Z to A', value: 'name-desc' },
    ],
  },
  {
    label: 'Battle size',
    items: [
      { label: 'Low to high', value: 'size-asc' },
      { label: 'High to low', value: 'size-desc' },
    ],
  },
]

/**
 * The two controls the library is narrowed and ordered by.
 *
 * One pair of buttons at every width: four side-by-side comboboxes cannot fit a
 * phone, and a second set of them for narrow screens would be a second copy of
 * every control and label.
 */
export function RosterFilters({
  value,
  factionGroups,
  onChange,
}: {
  value: RosterFilterState
  /** The library's factions, without the entry that clears the choice. */
  factionGroups: SearchableGroup[]
  onChange: (next: RosterFilterState) => void
}) {
  const active = [value.limit, value.faction, value.visibility].filter((entry) => entry !== undefined).length
  const sortLabel = SORT_GROUPS.flatMap((group) => group.items).find((item) => item.value === value.sort)?.label ?? ''

  return (
    <div className="mx-auto mt-4 flex max-w-5xl flex-wrap items-center gap-2 px-3 sm:px-4" aria-label="Roster filters">
      <Dialog>
        <DialogTrigger render={<Button variant="outline" size="lg" className="rounded-none border-edge bg-sunken uppercase" />}>
          <ListFilter />
          Filter
          {active ? <span className="chip readout">{active}</span> : null}
        </DialogTrigger>
        <DialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
          <DialogHeader>
            <DialogTitle className="uppercase">Filter rosters</DialogTitle>
            <DialogDescription className="text-dim">Narrow the library to the lists you want to see.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field
              label="Battle size"
              value={value.limit ? String(value.limit) : 'all'}
              groups={BATTLE_SIZE_GROUPS}
              onChange={(chosen) => onChange({ ...value, limit: chosen === 'all' ? undefined : Number(chosen) })}
            />
            <Field
              label="Faction"
              value={value.faction ?? 'all'}
              groups={[{ label: '', items: [{ label: 'All factions', value: 'all' }] }, ...factionGroups]}
              onChange={(chosen) => onChange({ ...value, faction: chosen === 'all' ? undefined : chosen })}
            />
            <Field
              label="Sharing"
              value={value.visibility ?? 'all'}
              groups={SHARING_GROUPS}
              onChange={(chosen) => onChange({ ...value, visibility: chosen === 'all' ? undefined : (chosen as RosterVisibility) })}
            />
          </div>
          <DialogFooter className="rounded-none border-edge bg-sunken">
            <Button
              variant="ghost"
              disabled={!active}
              onClick={() => onChange({ sort: value.sort })}
              className="uppercase sm:mr-auto sm:ml-0"
            >
              Clear filters
            </Button>
            <DialogClose render={<Button variant="outline" className="rounded-none border-edge uppercase" />}>Done</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="lg"
              aria-label={`Sort: ${sortLabel}`}
              className="rounded-none border-edge bg-sunken uppercase"
            />
          }
        >
          <ArrowDownUp />
          {sortLabel}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 rounded-none border border-edge bg-panel text-bone">
          <DropdownMenuRadioGroup value={value.sort} onValueChange={(chosen) => onChange({ ...value, sort: chosen as RosterSort })}>
            {SORT_GROUPS.map((group) => (
              <Fragment key={group.label}>
                <DropdownMenuLabel className="eyebrow text-faint">{group.label}</DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuRadioItem key={item.value} value={item.value} closeOnClick className="rounded-none">
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </Fragment>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function Field({
  label,
  value,
  groups,
  onChange,
}: {
  label: string
  value: string
  groups: SearchableGroup[]
  onChange: (value: string) => void
}) {
  return (
    <div>
      <Label className="eyebrow block">{label}</Label>
      <SearchableSelect
        ariaLabel={label}
        groups={groups}
        value={value}
        onValueChange={onChange}
        placeholder={label}
        className="mt-1 h-9 rounded-none border-edge bg-sunken text-xs font-semibold uppercase"
      />
    </div>
  )
}
