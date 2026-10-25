import { expect, it } from 'vitest'
import type { FactionDatasheet } from '../../../../contracts/catalogue'
import { filterDatasheets, keywordOptions } from './datasheetFilters'

const sheet = (id: string, keywords: string[], nonMatchedPlay?: FactionDatasheet['nonMatchedPlay']) =>
  ({ id, keywords, ...(nonMatchedPlay ? { nonMatchedPlay } : {}) }) as FactionDatasheet

const units = [
  sheet('warriors', ['Faction: Necrons', 'Infantry', 'Battleline', 'Necron Warriors']),
  sheet('immortals', ['Faction: Necrons', 'Infantry', 'Battleline', 'Immortals']),
  sheet('overlord', ['Faction: Necrons', 'Infantry', 'Character', 'Overlord']),
  sheet('stalker', ['Faction: Necrons', 'Vehicle', 'Walker', 'Tomb Stalker'], 'legends'),
]

it('offers only keywords that narrow the list without naming a single datasheet', () => {
  expect(keywordOptions(units)).toEqual([
    { keyword: 'Battleline', count: 2 },
    { keyword: 'Infantry', count: 3 },
  ])
})

it('keeps datasheets that carry every chosen keyword from a shown source', () => {
  const shown = filterDatasheets(units, { hidden: new Set(['legends']), keywords: new Set(['Infantry', 'Battleline']), only: [] })
  expect(shown.map((unit) => unit.id)).toEqual(['warriors', 'immortals'])
})
