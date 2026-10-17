import { expect, it } from 'vitest'
import { OWN_SEARCH_BATTLES, ownSearchLists, prepareReferenceSearch, searchReference, type GlobalSearchIndex } from './referenceSearch'
import { rosterLabel } from './rosterLabel'

const datasheet = (name: string) => ({
  targetId: name,
  allied: false,
  name,
  fields: { name, keywords: ['Infantry'], abilities: [], weapons: [], weaponKeywords: [], wargear: [] },
  result: {
    id: `datasheet:${name}`,
    group: 'Datasheets' as const,
    label: name,
    detail: 'Necrons',
    href: `/factions/necrons/datasheets/${name}`,
  },
})
const index = (count: number): GlobalSearchIndex => ({
  factions: [],
  detachments: [],
  datasheets: Array.from({ length: count }, (_, at) => datasheet(`Warrior ${at}`)),
  missions: [],
  rules: [],
})

it('prepares a large index in idle-sized slices', () => {
  expect([...prepareReferenceSearch(index(450))]).toHaveLength(2)
})

it('finds the same results after preparing the index', () => {
  const prepared = index(3)
  const before = searchReference('warrior 2', index(3))
  for (const _ of prepareReferenceSearch(prepared));
  expect(searchReference('warrior 2', prepared)).toEqual(before)
})

const battle = (token: string) => ({ token, status: 'active', players: ['Alice'], armies: [null], mission: null })

it('offers a player’s most recent battles to search, up to the limit the service searches', () => {
  const battles = Array.from({ length: OWN_SEARCH_BATTLES + 5 }, (_, at) => battle(`b${at}`))
  expect(ownSearchLists([], battles, []).battles.map((entry) => entry.token)).toEqual(
    battles.slice(0, OWN_SEARCH_BATTLES).map((entry) => entry.token),
  )
})

it('offers a battle loaded on two pages once', () => {
  expect(ownSearchLists([], [battle('a'), battle('a'), battle('b')], []).battles.map((entry) => entry.token)).toEqual(['a', 'b'])
})

it('labels a roster with its faction, detachments and points', () => {
  const factions = [{ id: 'necrons', displayName: 'Necrons', detachments: [{ id: 'awakened', name: 'Awakened Dynasty' }] }]
  const roster = { id: 'army', name: 'Army', limit: 2000, catalogueId: 'necrons', detachmentIds: ['awakened'] }
  expect(ownSearchLists([roster], [], factions).rosters[0]?.label).toBe(
    rosterLabel({ factionName: 'Necrons', detachmentNames: ['Awakened Dynasty'], limit: 2000 }),
  )
})
