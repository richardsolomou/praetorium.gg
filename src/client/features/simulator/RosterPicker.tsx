import { useQuery } from '@tanstack/react-query'
import type { ComponentProps, ReactNode } from 'react'
import { ScrollText } from 'lucide-react'
import { SearchableSelect, type SearchableGroup } from '../../components/SearchableSelect'
import { FactionMark } from '../../components/FactionMark'
import { factionIndexQuery } from '../../queries'

export type RosterOption = { id: string; label: string; catalogueId?: string; icon?: ReactNode }
export type RosterGroup = { label: string; options: readonly RosterOption[] }

/** Each option marked with its faction; an option without one shows its own icon. */
export function useRosterGroups(groups: readonly RosterGroup[]): SearchableGroup[] {
  const factions = useQuery(factionIndexQuery())
  return groups
    .filter((group) => group.options.length)
    .map((group) => ({
      label: group.label,
      items: group.options.map((option) => {
        const faction = factions.data?.factions.find((entry) => entry.id === option.catalogueId)
        return {
          value: option.id,
          label: option.label,
          icon: faction ? (
            <FactionMark faction={faction} size="sm" />
          ) : (
            (option.icon ?? <ScrollText className="size-4 text-info" aria-hidden />)
          ),
        }
      }),
    }))
}

/** Chooses a roster by name. */
export function RosterPicker({
  groups,
  ...props
}: Omit<ComponentProps<typeof SearchableSelect>, 'groups' | 'placeholder'> & { groups: readonly RosterGroup[] }) {
  return <SearchableSelect {...props} placeholder="Choose a roster" groups={useRosterGroups(groups)} />
}
