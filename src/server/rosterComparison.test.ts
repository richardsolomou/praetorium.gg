import { expect, it, vi } from 'vitest'
import { resolveCombatRequest, type CombatRequest } from '../core/combatMatchup'
import { bookOf } from './catalogue.fixtures'

const characteristics = (values: Record<string, string>) => Object.entries(values).map(([name, $text]) => ({ name, $text }))
const model = (id: string, stats: Record<string, string>, weapon?: Record<string, string>) => ({
  id,
  name: id,
  type: 'model' as const,
  profiles: [
    { id: `${id}-stats`, name: id, typeName: 'Unit', characteristics: characteristics(stats) },
    ...(weapon ? [{ id: `${id}-gun`, name: 'Gun', typeName: 'Ranged Weapons', characteristics: characteristics(weapon) }] : []),
  ],
})
const book = bookOf({
  selectionEntries: [
    model('gunner', { T: '4', Sv: '3+', W: '2' }, { A: '2', BS: '3+', S: '4', AP: '0', D: '1' }),
    model('trooper', { T: '4', Sv: '3+', W: '2' }),
    model('beast', { T: '8', Sv: '3+', W: '12' }),
  ],
})
vi.mock('./app', () => ({
  app: () => ({
    catalogueFor: async (id: string) => (id === 'cat' ? book : null),
    rulesFor: async () => null,
    factionsFor: async () => ({ factions: [] }),
    factionFor: async () => null,
  }),
}))
vi.mock('./publishedTextFiles', () => ({ serverWords: async () => () => null }))
// Calculations against the beast never finish, as a slow pairing would not before the table's time limit.
vi.mock('./combatCalculationPool', () => ({
  combatCalculationPool: {
    calculate: (request: CombatRequest, signal: AbortSignal) =>
      JSON.stringify(request).includes('"toughness":8')
        ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
        : Promise.resolve(resolveCombatRequest(request)),
  },
}))

import { compareRosters } from './rosterComparison'

const roster = (entryIds: string[], catalogueId = 'cat') => ({
  name: '',
  catalogueId,
  detachmentIds: [],
  disposition: null,
  borrowedDetachmentId: null,
  limit: 2_000,
  pointsBudget: null,
  picks: entryIds.map((entryId) => ({ entryId })),
  waivedRules: [],
  optionalRules: [],
  prep: null,
  visibility: 'private' as const,
  source: 'editable' as const,
})

it('keeps the finished pairings when the table stops early and claims no best beside an unfinished one', async () => {
  const result = await compareRosters(
    { attacker: roster(['gunner']), defender: roster(['trooper', 'beast']), phases: ['shooting'], rankBy: 'expectedWoundsLost' },
    AbortSignal.timeout(200),
  )
  expect(result.structuredContent).toMatchObject({
    status: 'partial',
    stoppedBy: 'The table reached its time limit.',
    calculated: 1,
    shooting: { cells: [[expect.any(Array), null]], bestTargetOf: [[]], bestAttackerOf: [[0], []] },
    notCalculated: [{ phase: 'shooting', reason: 'Not finished before the table stopped.', pairings: [[0, 1]] }],
  })
})

it('names an unknown catalogueId instead of calling the army data unavailable', async () => {
  const result = await compareRosters(
    { attacker: roster(['gunner']), defender: roster(['trooper'], 'not-an-army'), rankBy: 'expectedWoundsLost' },
    AbortSignal.timeout(1_000),
  )
  expect(result.content[0]?.text).toBe(
    "No army uses the defending roster's catalogueId not-an-army. Take it from import_roster, get_my_roster or list_units.",
  )
})
