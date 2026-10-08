import { beforeEach, expect, it, vi } from 'vitest'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import { decodeSimulatorState } from '../contracts/simulatorState'
import { bookOf, categories } from './catalogue.fixtures'
import { combatUnitsFor } from './combatUnits'
import type { ReferenceCorpus } from './referenceCorpus'

const profile = (id: string, name: string, typeName: string, values: Record<string, string>) => ({
  id,
  name,
  typeName,
  characteristics: Object.entries(values).map(([characteristic, $text]) => ({ name: characteristic, $text })),
})
const sizes = (min: number, max: number) => [
  { id: 'min', type: 'min' as const, value: min, field: 'selections', scope: 'parent' },
  { id: 'max', type: 'max' as const, value: max, field: 'selections', scope: 'parent' },
]
const loaded = bookOf({
  selectionEntries: [
    {
      id: 'squad',
      name: 'Squad',
      type: 'unit',
      selectionEntries: [
        {
          id: 'trooper',
          name: 'Trooper',
          type: 'model',
          constraints: sizes(5, 10),
          profiles: [
            profile('trooper-stats', 'Trooper', 'Unit', { T: '4', Sv: '3+', W: '2' }),
            profile('rifle', 'Rifle', 'Ranged Weapons', { A: '2', BS: '3+', S: '4', AP: '-1', D: '1' }),
            profile('knife', 'Knife', 'Melee Weapons', { A: '1', WS: '3+', S: '4', AP: '0', D: '1' }),
          ],
        },
      ],
    },
    {
      id: 'leader',
      name: 'Leader',
      type: 'model',
      categoryLinks: categories('Character'),
      profiles: [
        profile('leader-stats', 'Leader', 'Unit', { T: '4', Sv: '3+', W: '5' }),
        profile('pistol', 'Pistol', 'Ranged Weapons', { A: '1', BS: '2+', S: '5', AP: '-1', D: '2' }),
        profile('leader-rule', 'Leader', 'Abilities', { Description: 'This model can be attached to the following units:\n■ Squad' }),
      ],
    },
    {
      id: 'beast',
      name: 'Beast',
      type: 'model',
      profiles: [
        profile('beast-stats', 'Beast', 'Unit', { T: '8', Sv: '3+', W: '12' }),
        profile('claws', 'Claws', 'Melee Weapons', { A: '6', WS: '3+', S: '8', AP: '-2', D: 'D6+2' }),
      ],
    },
  ],
})
const canonical = (id: string, name: string) => ({
  id,
  slug: name.toLowerCase(),
  name,
  catalogueId: 'cat',
  faction: 'Test',
  referenceRoute: { catalogueId: 'test', slug: name.toLowerCase() },
})
const document = (name: string) => ({
  id: `datasheet:test:${name.toLowerCase()}`,
  kind: 'datasheet' as const,
  title: name,
  faction: 'Test',
  url: `/factions/test/datasheets/${name.toLowerCase()}`,
  sections: [],
  revisions: { datacards: 'revision' },
  attribution: ['Community data'],
})
const documents = ['Squad', 'Leader', 'Beast'].map(document)
const corpus: ReferenceCorpus = {
  catalogue: {
    format: 'praetorium.canonical-catalogue.v1',
    compilerVersion: 1,
    revisions: { datacards: 'revision' },
    datasheets: [canonical('squad', 'Squad'), canonical('leader', 'Leader'), canonical('beast', 'Beast')],
    detachments: [],
    ruleDocuments: [],
    issues: [],
  } as unknown as CanonicalCatalogue,
  documents,
  byId: new Map(documents.map((entry) => [entry.id, entry])),
  revision: 'snapshot',
}

const { reference } = vi.hoisted(() => ({ reference: { corpus: null as ReferenceCorpus | null } }))
vi.mock('./referenceApi', () => ({ activeReferenceCorpus: async () => reference.corpus }))
vi.mock('./app', () => ({
  app: () => ({
    catalogueFor: async () => loaded,
    rulesFor: async () => null,
    combatUnitsFor: async () => combatUnitsFor(loaded, null),
  }),
}))

import { simulateCombat } from './combatTools'

beforeEach(() => {
  reference.corpus = corpus
})

const squad = { faction: 'test', unit: 'squad' }
const beast = { faction: 'Test', unit: 'Beast' }

it('estimates each phase and the sequence for an attached unit and cites both datasheets', async () => {
  const result = await simulateCombat({ attacker: { ...squad, models: 10, attached: [{ unit: 'Leader' }] }, defender: beast })
  expect(result.structuredContent).toMatchObject({
    attacker: {
      units: [
        { name: 'Squad', models: 10, url: '/factions/test/datasheets/squad', referenceId: 'datasheet:test:squad' },
        { name: 'Leader', models: 1, url: '/factions/test/datasheets/leader' },
      ],
    },
    defender: { units: [{ name: 'Beast', models: 1 }], models: 1 },
    shooting: {
      status: 'estimated',
      weapons: [
        { name: 'Rifle', count: 10 },
        { name: 'Pistol', count: 1 },
      ],
    },
    melee: { status: 'estimated' },
    shootingThenMelee: { status: 'estimated' },
    attribution: ['Community data'],
  })
})

it('reports the chance of destroying at least each number of models', async () => {
  const result = await simulateCombat({ attacker: beast, defender: { ...squad, models: 5 } })
  const melee = (result.structuredContent as { melee: { atLeastModelsDestroyedChance: number[] } }).melee
  expect(melee.atLeastModelsDestroyedChance).toHaveLength(6)
})

it('reports a phase without weapons as having no attacks', async () => {
  const result = await simulateCombat({ attacker: beast, defender: squad })
  expect(result.structuredContent).toMatchObject({ shooting: { status: 'no attacks' } })
})

it('links to the simulator page with the same matchup', async () => {
  const result = await simulateCombat({ attacker: { ...squad, models: 6 }, defender: beast, modifiers: { all: { cover: true } } })
  const url = (result.structuredContent as { simulatorUrl: string }).simulatorUrl
  expect(decodeSimulatorState(new URL(url, 'https://praetorium.gg').searchParams.get('s') ?? undefined)).toMatchObject({
    sides: [
      { catalogueId: 'cat', pick: { entryId: 'squad', models: 6 } },
      { catalogueId: 'cat', pick: { entryId: 'beast' } },
    ],
    matchup: { adjustments: { all: { cover: true } } },
  })
})

it('refuses an unknown unit and faction, naming each', async () => {
  const result = await simulateCombat({ attacker: { faction: 'test', unit: 'Ghost' }, defender: { faction: 'nowhere', unit: 'Beast' } })
  expect(result).toMatchObject({
    isError: true,
    structuredContent: { refused: ['Test has no simulated unit named Ghost.', 'Faction not found: nowhere.'] },
  })
})

it('refuses a unit size the datasheet cannot field', async () => {
  const result = await simulateCombat({ attacker: { ...squad, models: 12 }, defender: beast })
  expect(result).toMatchObject({ isError: true, structuredContent: { refused: ['Squad cannot field 12 models.'] } })
})

it('refuses an attachment the datasheets do not allow', async () => {
  const result = await simulateCombat({ attacker: { ...beast, attached: [{ unit: 'Leader' }] }, defender: squad })
  expect(result.structuredContent).toEqual({ refused: ['Leader: cannot be attached to Beast.'] })
})

it('refuses an attack larger than the server calculation bound', async () => {
  const result = await simulateCombat({
    attacker: { ...squad, models: 10, attached: [{ unit: 'Leader' }] },
    defender: { ...squad, models: 10, attached: [{ unit: 'Leader' }] },
    modifiers: { weapons: { all: { attacks: 10, damage: 10, sustained: { dice: 1, sides: 6, bonus: 0 }, devastating: true } } },
  })
  expect(result).toMatchObject({
    isError: true,
    structuredContent: { refused: ['This attack is too large to simulate. Select fewer weapons or models.'] },
  })
})

it('refuses while reference data is unavailable', async () => {
  reference.corpus = null
  expect(await simulateCombat({ attacker: squad, defender: beast })).toMatchObject({ isError: true })
})
