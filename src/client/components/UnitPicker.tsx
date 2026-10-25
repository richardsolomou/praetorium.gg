import { useQuery } from '@tanstack/react-query'
import type { ComponentProps } from 'react'
import type { combatUnits } from '../functions'
import { factionIndexQuery } from '../queries'
import { FactionMark } from './FactionMark'
import { SearchableSelect, type SearchableGroup } from './SearchableSelect'

const noExtraGroups: SearchableGroup[] = []

/** Datasheets grouped by army, each marked with its faction. */
export function UnitPicker({
  index,
  extraGroups = noExtraGroups,
  ...props
}: Omit<ComponentProps<typeof SearchableSelect>, 'groups' | 'virtualized'> & {
  index: Awaited<ReturnType<typeof combatUnits>>
  extraGroups?: SearchableGroup[]
}) {
  const factions = useQuery(factionIndexQuery())
  return (
    <SearchableSelect
      {...props}
      virtualized
      groups={[
        ...extraGroups,
        ...index
          .filter((book) => book.units.length)
          .map((book) => {
            const faction = factions.data?.factions.find((entry) => entry.id === book.catalogueId)
            return {
              label: book.name,
              items: book.units.map((unit) => ({
                value: JSON.stringify([book.catalogueId, unit.id]),
                label: unit.name,
                detail: unit.points === null ? undefined : `${unit.points} pts`,
                icon: faction ? <FactionMark faction={faction} size="sm" /> : undefined,
              })),
            }
          }),
      ]}
    />
  )
}
