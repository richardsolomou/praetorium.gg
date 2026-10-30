import { ArrowDownUp, ListFilter } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { GAME_SIZES, battleSizeOptionLabel } from '../../../core/battle'
import type { RosterVisibility } from '../../../core/savedRoster'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/Dialog'
import { SearchableSelect, type SearchableGroup } from '../../components/SearchableSelect'
import type { RosterSort } from '../../../core/rosterSort'

export type RosterUpdateFilter = 'older' | 'changed'
export const ROSTER_UPDATE_FILTERS: readonly RosterUpdateFilter[] = ['older', 'changed']

type RosterFilterState = {
  limit?: number
  faction?: string
  visibility?: RosterVisibility
  updates?: RosterUpdateFilter
  sort: RosterSort
}

const BATTLE_SIZE_GROUPS: SearchableGroup[] = [
  {
    label: '',
    items: [
      { label: 'All battle sizes', value: 'all' },
      ...GAME_SIZES.map((size) => ({ label: battleSizeOptionLabel(size), value: String(size.limit) })),
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
const UPDATE_GROUPS: SearchableGroup[] = [
  {
    label: '',
    items: [
      { label: 'Any rules and data', value: 'all' },
      { label: 'Older rules', value: 'older' },
      { label: 'Changed by update', value: 'changed' },
    ],
  },
]
const SORT_GROUPS: { label: string; items: { label: string; value: RosterSort }[] }[] = [
  {
    label: 'Updated',
    items: [
      { label: 'Recently updated', value: 'updated-desc' },
      { label: 'Least recently updated', value: 'updated-asc' },
    ],
  },
  {
    label: 'Created',
    items: [
      { label: 'Recently created', value: 'created-desc' },
      { label: 'Least recently created', value: 'created-asc' },
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
      { label: 'High to low', value: 'size-desc' },
      { label: 'Low to high', value: 'size-asc' },
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
  const active = [value.limit, value.faction, value.visibility, value.updates].filter((entry) => entry !== undefined).length

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Roster filters">
      <FilterDialog
        active={active}
        description="Narrow the library to the lists you want to see."
        onClear={() => onChange({ sort: value.sort })}
      >
        <FilterField
          label="Battle size"
          value={value.limit ? String(value.limit) : 'all'}
          groups={BATTLE_SIZE_GROUPS}
          onChange={(chosen) => onChange({ ...value, limit: chosen === 'all' ? undefined : Number(chosen) })}
        />
        <FilterField
          label="Faction"
          value={value.faction ?? 'all'}
          groups={[{ label: '', items: [{ label: 'All factions', value: 'all' }] }, ...factionGroups]}
          onChange={(chosen) => onChange({ ...value, faction: chosen === 'all' ? undefined : chosen })}
        />
        <FilterField
          label="Sharing"
          value={value.visibility ?? 'all'}
          groups={SHARING_GROUPS}
          onChange={(chosen) => onChange({ ...value, visibility: chosen === 'all' ? undefined : (chosen as RosterVisibility) })}
        />
        <FilterField
          label="Rules and data"
          value={value.updates ?? 'all'}
          groups={UPDATE_GROUPS}
          onChange={(chosen) => onChange({ ...value, updates: chosen === 'all' ? undefined : (chosen as RosterUpdateFilter) })}
        />
      </FilterDialog>

      <RosterSortMenu value={value.sort} onChange={(sort) => onChange({ ...value, sort })} />
    </div>
  )
}

/** The order a roster list is shown in, for the library and the friends' and public rosters alike. */
export function RosterSortMenu({ value, onChange }: { value: RosterSort; onChange: (sort: RosterSort) => void }) {
  const label = SORT_GROUPS.flatMap((group) => group.items).find((item) => item.value === value)?.label ?? ''
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" aria-label={`Sort: ${label}`} />}>
        <ArrowDownUp />
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuRadioGroup value={value} onValueChange={(chosen) => onChange(chosen as RosterSort)}>
          {SORT_GROUPS.map((group) => (
            <Fragment key={group.label}>
              <DropdownMenuLabel className="eyebrow text-faint">{group.label}</DropdownMenuLabel>
              {group.items.map((item) => (
                <DropdownMenuRadioItem key={item.value} value={item.value} closeOnClick>
                  {item.label}
                </DropdownMenuRadioItem>
              ))}
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function FilterField({
  label,
  value,
  groups,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  groups: SearchableGroup[]
  onChange: (value: string) => void
  disabled?: boolean
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
        disabled={disabled}
        className="mt-1"
      />
    </div>
  )
}

/** Why a filtered list is empty, with the way back to all of it when there is one. */
export function NoFilterMatches({ children, onClear }: { children: ReactNode; onClear?: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 text-sm text-dim">
      {children}
      {onClear ? (
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </p>
  )
}

/** The filter button, counting the filters in use, and the dialog of `children` it opens. */
export function FilterDialog({
  active,
  description,
  onClear,
  children,
}: {
  active: number
  description: string
  onClear: () => void
  children: ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        <ListFilter />
        Filter
        {active ? <span className="chip readout">{active}</span> : null}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter rosters</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-3">{children}</DialogBody>
        <DialogFooter>
          <Button variant="ghost" disabled={!active} onClick={onClear} className="sm:mr-auto sm:ml-0">
            Clear filters
          </Button>
          <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
