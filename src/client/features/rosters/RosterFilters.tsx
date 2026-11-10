import type { FilterDimension } from '../../components/FilterBar'
import { ROSTER_POINTS_BANDS } from '../../../core/rosterDiscovery'
import { ArrowDownUp, Rows3 } from 'lucide-react'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { RosterGrouping } from '../../../core/rosterGrouping'
import type { RosterSort } from '../../../core/rosterSort'

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

const GROUPINGS: { label: string; value: RosterGrouping }[] = [
  { label: 'No grouping', value: 'none' },
  { label: 'By faction', value: 'faction' },
  { label: 'By detachment', value: 'detachment' },
  { label: 'By battle size', value: 'size' },
]

/** What a roster list is gathered under, each group keeping the chosen sort. */
export function RosterGroupMenu({ value, onChange }: { value: RosterGrouping; onChange: (grouping: RosterGrouping) => void }) {
  const label = GROUPINGS.find((item) => item.value === value)?.label ?? ''
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" aria-label={`Group: ${label}`} />}>
        <Rows3 />
        {value === 'none' ? 'Group' : label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuRadioGroup value={value} onValueChange={(chosen) => onChange(chosen as RosterGrouping)}>
          {GROUPINGS.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value} closeOnClick>
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The filters that need a roster's price, on every roster list. */
export const ROSTER_ASSESSMENT_DIMENSIONS: FilterDimension[] = [
  {
    key: 'legality',
    label: 'Legality',
    pinned: true,
    groups: [
      {
        label: '',
        items: [
          { label: 'Legal', value: 'legal' },
          { label: 'Over the points limit', value: 'over-limit' },
          { label: 'Not legal', value: 'not-legal' },
        ],
      },
    ],
  },
  { key: 'points', label: 'Points', groups: [{ label: '', items: ROSTER_POINTS_BANDS.map(({ label, value }) => ({ label, value })) }] },
]
