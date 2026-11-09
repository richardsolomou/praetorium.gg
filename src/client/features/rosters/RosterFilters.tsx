import { ArrowDownUp } from 'lucide-react'
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
