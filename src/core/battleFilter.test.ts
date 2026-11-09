import { expect, test } from 'vitest'
import { matchesBattle, type BattleFilter } from './battleFilter'
import { facetText, parseFacet, periodBounds } from './listFilter'

const faction = (slug: string) => ({ slug, displayName: slug.toUpperCase(), icon: null, edition: null })

const battle = {
  status: 'finished' as const,
  players: ['Ana', 'Ben', 'Cy', 'Di'],
  playerIds: ['ana', 'ben', 'cy', 'di'],
  sides: [0, 0, 1, 1],
  armies: ['Waaagh', 'Green Tide', 'Silent King', 'Tomb'],
  factions: [faction('orks'), faction('orks'), faction('necrons'), faction('tau')],
  detachments: [['Horde'], [], ['Hypercrypt'], []],
  scores: [80, 0, 60, 0],
  result: { reason: 'completed' as const, concededBy: null },
  mission: { name: 'Take and Hold' },
  deploymentId: 'dawn',
  lastActivity: 1_000,
  settings: { limit: 2000, missionPackId: 'pack', manual: false },
  playerDetails: [
    { id: 'ana', name: 'ana', automated: false },
    { id: 'ben', name: 'ben', automated: false },
    { id: 'cy', name: 'cy', automated: false },
    { id: 'di', name: 'di', automated: false },
  ],
}
const matches = (filter: BattleFilter, viewer: string | null = null, at = 1_000) => matchesBattle(battle, filter, viewer, at, 1_000)

test('excluding an army drops a battle any matching side fielded it in', () => {
  expect(matches({ faction: { in: [], out: ['orks', 'necrons'] } })).toBe(false)
})

test('a matchup needs the two armies on opposite sides', () => {
  expect(matches({ faction: { in: ['necrons'], out: [] }, against: { in: ['tau'], out: [] } })).toBe(false)
})

test('a matchup reads either side for a spectator', () => {
  expect(matches({ faction: { in: ['necrons'], out: [] }, against: { in: ['orks'], out: [] } })).toBe(true)
})

test('a seated viewer filters by their own side', () => {
  expect(matches({ faction: { in: ['necrons'], out: [] } }, 'ana')).toBe(false)
})

test('a result follows the viewer, not the first seat', () => {
  expect(matches({ result: { in: ['lost'], out: [] } }, 'cy')).toBe(true)
})

test('a result never matches a battle the viewer did not sit in', () => {
  expect(matches({ result: { in: ['won'], out: [] } })).toBe(false)
})

test('search words can land on different players and armies', () => {
  expect(matches({ q: 'ana silent' })).toBe(true)
})

test('a custom period includes the whole of its last day', () => {
  const end = Date.parse('2026-11-03T23:59:00Z')
  expect(matches({ from: '2026-11-01', to: '2026-11-03' }, null, end)).toBe(true)
})

test('a period excludes a battle before it starts', () => {
  expect(matches({ from: '2026-11-01' }, null, Date.parse('2026-10-31T23:00:00Z'))).toBe(false)
})

test('a relative period starts at the top of a UTC day so its cache key holds all day', () => {
  expect(periodBounds({ period: '7d' }, Date.parse('2026-11-09T15:00:00Z')).from).toBe(Date.parse('2026-11-02T00:00:00Z'))
})

test('address values survive a comma in a value', () => {
  expect(parseFacet(facetText({ in: ['a,b'], out: ['c'] }))).toEqual({ in: ['a,b'], out: ['c'] })
})

test('a link from before multiple choices reads as one value', () => {
  expect(parseFacet('orks')).toEqual({ in: ['orks'], out: [] })
})

test('a lone number stays a number so the address has no quotes', () => {
  expect(facetText({ in: ['2000'], out: [] })).toBe(2000)
})
