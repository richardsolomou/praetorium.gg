import { useQuery } from '@tanstack/react-query'
import type { ComponentProps } from 'react'
import type { combatUnits } from '../../functions'
import { factionIndexQuery } from '../../queries'
import { FactionMark } from '../../components/FactionMark'
import { SearchableSelect, type SearchableGroup } from '../../components/SearchableSelect'

const noExtraGroups: SearchableGroup[] = []

export function CombatUnitPicker({
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
                icon: faction ? (
                  <FactionMark id={faction.slug} name={faction.displayName} edition={faction.edition} icon={faction.icon} size="sm" />
                ) : undefined,
              })),
            }
          }),
      ]}
    />
  )
}
