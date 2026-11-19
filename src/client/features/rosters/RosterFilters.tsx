import type { FilterDimension } from '../../components/FilterBar'
import { ungrouped } from '../../components/SearchableSelect'
import { countBy } from '../../../core/collections'
import { ROSTER_POINTS_BANDS } from '../../../core/rosterDiscovery'
import { ArrowDownUp, Rows3 } from 'lucide-react'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { RosterGrouping } from '../../../core/rosterGrouping'
import type { RosterSort } from '../../../core/rosterSort'
import { DropdownMenuLabel, DropdownMenuRadioItem } from '../../components/Menu'
import { factionSelectGroups } from './builder/factions'

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
        <span className="max-sm:hidden">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuRadioGroup value={value} onValueChange={(chosen) => onChange(chosen as RosterSort)}>
          {SORT_GROUPS.map((group) => (
            <Fragment key={group.label}>
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
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
  { label: 'By play', value: 'play' },
]

/** What a roster list is gathered under, each group keeping the chosen sort. */
export function RosterGroupMenu({ value, onChange }: { value: RosterGrouping; onChange: (grouping: RosterGrouping) => void }) {
  const label = GROUPINGS.find((item) => item.value === value)?.label ?? ''
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" aria-label={`Group: ${label}`} />}>
        <Rows3 />
        <span className="max-sm:hidden">{value === 'none' ? 'Group' : label}</span>
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

export const ROSTER_POINTS_DIMENSION: FilterDimension = {
  key: 'points',
  label: 'Points',
  groups: [{ label: '', items: ROSTER_POINTS_BANDS.map(({ label, value }) => ({ label, value })) }],
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
  ROSTER_POINTS_DIMENSION,
]

type FilterableFaction = Parameters<typeof factionSelectGroups>[0][number] & {
  slug: string
  detachments: readonly { id: string; name: string }[]
}

/** The factions `rosters` are built for, each saying how many, chosen by slug. */
export function rosterFactionDimension<T extends FilterableFaction>(
  rosters: readonly { catalogueId: string }[],
  factions: readonly T[],
  favourites: ReadonlySet<string>,
): FilterDimension {
  const perFaction = countBy(rosters, (roster) => roster.catalogueId)
  return {
    key: 'faction',
    label: 'Faction',
    pinned: true,
    groups: factionSelectGroups(
      factions.filter((faction) => perFaction.has(faction.id)),
      favourites,
    ).map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        value: factions.find((faction) => faction.id === item.value)?.slug ?? item.value,
        detail: String(perFaction.get(item.value) ?? 0),
      })),
    })),
  }
}

/** The detachments `rosters` use, by name, each saying how many. */
export function rosterDetachmentDimension(
  rosters: readonly { detachmentIds: readonly string[] }[],
  factions: readonly FilterableFaction[],
): FilterDimension {
  const perDetachment = countBy(
    rosters.flatMap((roster) => roster.detachmentIds),
    (id) => id,
  )
  const detachmentNames = new Map(
    factions.flatMap((faction) => faction.detachments.map((detachment) => [detachment.id, detachment.name] as const)),
  )
  return {
    key: 'detachment',
    label: 'Detachment',
    pinned: true,
    groups: ungrouped(
      [...perDetachment]
        .map(([id, count]) => ({ label: detachmentNames.get(id) ?? id, value: id, detail: String(count) }))
        .toSorted((left, right) => left.label.localeCompare(right.label)),
    ),
  }
}
