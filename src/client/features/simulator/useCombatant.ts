import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { loadoutDatasheetsQuery, priceQuery } from '../../queries'
import { useSettled } from '../../useSettled'
import { survivingUnits } from '../builder/pricePlaceholder'
import { pickEditor, usePicks } from '../builder/usePicks'

export function useCombatant() {
  const [faction, setFaction] = useState('')
  const picks = usePicks([])
  const settled = useSettled(picks.positioned)
  const entryId = picks.positioned[0]?.entryId
  const price = useQuery({
    ...priceQuery(faction, [], null, 2000, settled),
    enabled: Boolean(faction && settled.length),
    placeholderData: (previous, query) =>
      query?.queryKey[1] === faction && survivingUnits(query.queryKey.at(-1), picks.positioned)?.length === 1 ? previous : undefined,
  })
  const unit = price.data?.units[0]?.entryId === entryId ? price.data?.units[0] : undefined
  const sheets = useQuery({
    ...loadoutDatasheetsQuery(faction, entryId ?? '', [], settled, 0),
    enabled: Boolean(unit && unit.entryId === settled[0]?.entryId),
    placeholderData: (previous, query) => (query?.queryKey[1] === faction && query.queryKey[2] === entryId ? previous : undefined),
  })
  const ready = Boolean(
    unit &&
    sheets.data?.selected &&
    picks.positioned === settled &&
    !price.isFetching &&
    !sheets.isFetching &&
    !price.isPlaceholderData &&
    !sheets.isPlaceholderData &&
    !price.isError &&
    !sheets.isError,
  )
  return {
    faction,
    picks,
    price,
    unit,
    sheets,
    ready,
    snapshot:
      unit && sheets.data?.selected ? { sheet: sheets.data.selected, models: unit.size.models, carriers: sheets.data.carriers } : null,
    edit: pickEditor(picks.setPicks, { catalogueId: faction, units: price.data?.units ?? [] }, picks.allocateKey),
    selectFaction: (id: string) => {
      setFaction(id)
      picks.setPicks([])
    },
    selectUnit: (id: string) => picks.setPicks([{ entryId: id, catalogueId: faction, key: picks.allocateKey() }]),
  }
}

export type Combatant = ReturnType<typeof useCombatant>
