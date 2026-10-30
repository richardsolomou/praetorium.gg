import { useQuery } from '@tanstack/react-query'
import type { ComponentProps, ReactNode } from 'react'
import { factionIndexQuery } from '../queries'
import { FactionMark } from './FactionMark'
import { SearchableSelect } from './SearchableSelect'

type UnitBook = { catalogueId: string; name: string; units: { id: string; name: string; points: number | null }[] }

const noBooks: (UnitBook & { icon?: ReactNode })[] = []

const unitValue = (catalogueId: string, entryId: string) => JSON.stringify([catalogueId, entryId])

/** Datasheets grouped by army, each marked with its faction. */
export function UnitPicker({
  index,
  extraBooks = noBooks,
  selected,
  onUnitChange,
  ...props
}: Omit<ComponentProps<typeof SearchableSelect>, 'groups' | 'virtualized' | 'value' | 'onValueChange'> & {
  index: UnitBook[]
  /** Listed before the index, each with its own icon. */
  extraBooks?: (UnitBook & { icon?: ReactNode })[]
  selected?: { catalogueId: string; entryId: string }
  onUnitChange: (catalogueId: string, entryId: string) => void
}) {
  const factions = useQuery(factionIndexQuery())
  const books = [
    ...extraBooks,
    ...index.map((book) => {
      const faction = factions.data?.factions.find((entry) => entry.id === book.catalogueId)
      return { ...book, icon: faction ? <FactionMark faction={faction} size="sm" /> : undefined }
    }),
  ]
  return (
    <SearchableSelect
      {...props}
      virtualized
      value={selected ? unitValue(selected.catalogueId, selected.entryId) : ''}
      onValueChange={(value) => {
        const [catalogueId, entryId] = JSON.parse(value) as [string, string]
        onUnitChange(catalogueId, entryId)
      }}
      groups={books
        .filter((book) => book.units.length)
        .map((book) => ({
          label: book.name,
          items: book.units.map((unit) => ({
            value: unitValue(book.catalogueId, unit.id),
            label: unit.name,
            detail: unit.points === null ? undefined : `${unit.points} pts`,
            icon: book.icon,
          })),
        }))}
    />
  )
}
