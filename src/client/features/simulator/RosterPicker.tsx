import { useQuery } from '@tanstack/react-query'
import type { ComponentProps, ReactNode } from 'react'
import { ScrollText } from 'lucide-react'
import { SearchableSelect, type SearchableGroup } from '../../components/SearchableSelect'
import { FactionMark } from '../../components/FactionMark'
import { factionIndexQuery } from '../../queries'
import { useRosterSearch } from './rosterSearch'

/** `found` marks a roster a search found elsewhere, which the typed text need not match by name. */
export type RosterOption = { id: string; label: string; catalogueId?: string; icon?: ReactNode; description?: string; found?: boolean }
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
          description: option.description,
          found: option.found,
          icon: faction ? (
            <FactionMark faction={faction} size="sm" />
          ) : (
            (option.icon ?? <ScrollText className="size-4 text-info" aria-hidden />)
          ),
        }
      }),
    }))
}

/** Chooses a roster by name, and with `searchListed` also searches other players' rosters, leaving out the listed ones. */
export function RosterPicker({
  groups,
  searchListed,
  ...props
}: Omit<ComponentProps<typeof SearchableSelect>, 'groups' | 'placeholder'> & {
  groups: readonly RosterGroup[]
  searchListed?: ReadonlySet<string>
}) {
  const search = useRosterSearch(searchListed ?? NOTHING_LISTED, Boolean(searchListed))
  return (
    <SearchableSelect
      {...props}
      placeholder="Choose a roster"
      groups={useRosterGroups([...groups, ...search.groups])}
      {...(searchListed ? search.props : {})}
    />
  )
}

export const NOTHING_LISTED: ReadonlySet<string> = new Set()
