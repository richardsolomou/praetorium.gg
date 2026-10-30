import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import { decodeSimulatorState } from '../contracts/simulatorState'
import { categories, shelfOf } from './catalogue.fixtures'
import { combatUnitsFor } from '../shared/combatUnits'
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
const loaded = shelfOf(
  {
    sharedSelectionEntries: [
      {
        id: 'detachment-wrapper',
        name: 'Detachment',
        type: 'upgrade',
        selectionEntryGroups: [
          { id: 'detachments', name: 'Detachment', selectionEntries: [{ id: 'vanguard', name: 'Vanguard Spearhead', type: 'upgrade' }] },
        ],
      },
    ],
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
        id: 'protector',
        name: 'Protector',
        type: 'model',
        categoryLinks: categories('Character'),
        profiles: [
          profile('protector-stats', 'Protector', 'Unit', { T: '6', Sv: '4+', W: '6' }),
          profile('cleaver', 'Cleaver', 'Melee Weapons', { A: '4', WS: '3+', S: '6', AP: '-1', D: '2' }),
          profile('protector-rule', 'Loyal', 'Abilities', { Description: 'This model can be attached to the following unit:\n■ Leader' }),
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
      {
        id: 'wraith',
        name: 'Wraith',
        type: 'model',
        profiles: [profile('wraith-stats', 'Wraith', 'Unit', { T: 'X', Sv: '4+', W: '3' })],
      },
      {
        id: 'oddity',
        name: 'Oddity',
        type: 'model',
        profiles: [
          profile('oddity-stats', 'Oddity', 'Unit', { T: '4', Sv: '4+', W: '3' }),
          profile('warp-gun', 'Warp gun', 'Ranged Weapons', { A: '1', BS: '3+', S: '4', AP: '0', D: '1', Keywords: 'Unheard Of' }),
          profile('warp-blade', 'Warp blade', 'Melee Weapons', { A: '1', WS: '3+', S: '4', AP: '0', D: '1', Keywords: 'Unheard Of' }),
        ],
      },
    ],
  },
  // A chapter that fields its codex's units, as Ultramarines field Intercessors, and from its library
  // its own Beast, listed after the codex's like a chapter's own Watch Master.
  {
    name: 'Chapter',
    catalogueLinks: [
      { targetId: 'cat', importRootEntries: true },
      { targetId: 'cat-2', importRootEntries: true },
    ],
  },
  {
    name: 'Chapter library',
    library: true,
    selectionEntries: [
      {
        id: 'chapter-beast',
        name: 'Beast',
        type: 'model',
        profiles: [
          profile('chapter-beast-stats', 'Beast', 'Unit', { T: '8', Sv: '3+', W: '12' }),
          profile('chapter-claws', 'Claws', 'Melee Weapons', { A: '6', WS: '3+', S: '8', AP: '-2', D: 'D6+2' }),
        ],
      },
    ],
  },
)
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
const documents = ['Squad', 'Leader', 'Protector', 'Beast', 'Oddity', 'Wraith'].map(document)
const corpus: ReferenceCorpus = {
  catalogue: {
    format: 'praetorium.canonical-catalogue.v1',
    compilerVersion: 1,
    revisions: { datacards: 'revision' },
    datasheets: [
      canonical('squad', 'Squad'),
      canonical('leader', 'Leader'),
      canonical('protector', 'Protector'),
      canonical('beast', 'Beast'),
      canonical('oddity', 'Oddity'),
      canonical('wraith', 'Wraith'),
      {
        ...canonical('chapter-beast', 'Beast'),
        catalogueId: 'cat-1',
        faction: 'Chapter',
        referenceRoute: { catalogueId: 'chapter', slug: 'beast' },
      },
    ],
    detachments: [],
    ruleDocuments: [],
    issues: [],
  } as unknown as CanonicalCatalogue,
  documents,
  byId: new Map(documents.map((entry) => [entry.id, entry])),
  revision: 'snapshot',
}

const { reference } = vi.hoisted(() => ({ reference: { corpus: null as ReferenceCorpus | null } }))
vi.mock('./referenceApi', () => ({
  activeReferenceCorpus: async () => reference.corpus,
  currentFactionIds: async () => new Set(['cat', 'cat-1']),
}))
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

describe('a unit joined to an attached unit', () => {
  const chained = () => simulateCombat({ attacker: { ...squad, attached: [{ unit: 'Leader' }, { unit: 'Protector' }] }, defender: beast })

  it('estimates the whole unit', async () => {
    expect((await chained()).structuredContent).toMatchObject({
      attacker: { units: [{ name: 'Squad' }, { name: 'Leader' }, { name: 'Protector' }] },
      melee: { status: 'estimated', weapons: [{ name: 'Knife' }, { name: 'Cleaver' }] },
    })
  })

  it('links to the simulator with the unit it joined', async () => {
    const url = ((await chained()).structuredContent as { simulatorUrl: string }).simulatorUrl
    expect(decodeSimulatorState(new URL(url, 'https://praetorium.gg').searchParams.get('s') ?? undefined)?.sides[0]?.attached).toEqual([
      { entryId: 'leader', catalogueId: 'cat' },
      { entryId: 'protector', catalogueId: 'cat', attachedTo: 1 },
    ])
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

it("links a side's detachment so the simulator page fields the same rules", async () => {
  const result = await simulateCombat({ attacker: { ...squad, detachment: 'vanguard-spearhead' }, defender: beast })
  const url = (result.structuredContent as { simulatorUrl: string }).simulatorUrl
  expect(decodeSimulatorState(new URL(url, 'https://praetorium.gg').searchParams.get('s') ?? undefined)?.sides[0]).toMatchObject({
    detachmentIds: ['vanguard'],
  })
})

it('refuses a detachment the faction cannot take, naming those it can', async () => {
  const result = await simulateCombat({ attacker: { ...squad, detachment: 'Gladius' }, defender: beast })
  expect(result).toMatchObject({
    isError: true,
    structuredContent: { refused: ['This faction has no detachment named Gladius. Its detachments are: Vanguard Spearhead.'] },
  })
})

it('fields a codex unit for a chapter whose lists can take it, citing the codex datasheet', async () => {
  const result = await simulateCombat({ attacker: { faction: 'Chapter', unit: 'Squad' }, defender: beast })
  expect(result.structuredContent).toMatchObject({ attacker: { units: [{ name: 'Squad', referenceId: 'datasheet:test:squad' }] } })
})

it("fields a chapter's own unit over the codex unit of the same name", async () => {
  const result = await simulateCombat({ attacker: { faction: 'Chapter', unit: 'Beast' }, defender: squad })
  expect(result.structuredContent).toMatchObject({ attacker: { units: [{ name: 'Beast', referenceId: 'datasheet:chapter:beast' }] } })
})

it('refuses an unknown unit and faction as not found, suggesting similar units', async () => {
  const result = await simulateCombat({ attacker: { faction: 'test', unit: 'Squads' }, defender: { faction: 'nowhere', unit: 'Beast' } })
  expect(result).toMatchObject({
    isError: true,
    _meta: { 'gg.praetorium/errorType': 'not_found' },
    structuredContent: {
      refused: [
        'Test has no unit named Squads. Similar units: Squad. Use a unit name or id from list_units for this faction.',
        'No faction is named nowhere; use a name or id from list_factions.',
      ],
    },
  })
})

it('refuses a unit size the datasheet cannot field', async () => {
  const result = await simulateCombat({ attacker: { ...squad, models: 12 }, defender: beast })
  expect(result).toMatchObject({
    isError: true,
    _meta: { 'gg.praetorium/errorType': 'refused' },
    structuredContent: { refused: ['Squad cannot field 12 models; list_units gives its unit sizes.'] },
  })
})

it('refuses an attachment the datasheets do not allow', async () => {
  const result = await simulateCombat({ attacker: { ...beast, attached: [{ unit: 'Leader' }] }, defender: squad })
  expect(result.structuredContent).toEqual({ refused: ['Leader: cannot be attached to Beast.'] })
})

describe('a weapon ability the simulator cannot calculate', () => {
  const unsupported = () => simulateCombat({ attacker: { faction: 'test', unit: 'Oddity' }, defender: beast })

  it('is not a tool error', async () => {
    expect(await unsupported()).not.toHaveProperty('isError')
  })

  it('names the ability in each refused phase', async () => {
    expect((await unsupported()).structuredContent).toMatchObject({
      shooting: { status: 'refused', reasons: ['Warp gun: Unsupported: Unheard Of.'] },
      melee: { status: 'refused', reasons: ['Warp blade: Unsupported: Unheard Of.'] },
    })
  })
})

describe('a defender the simulator cannot build', () => {
  const unbuildable = () => simulateCombat({ attacker: squad, defender: { faction: 'test', unit: 'Wraith' } })
  const reason = 'This unit has missing or unsupported defensive characteristics.'

  it('is not a tool error', async () => {
    expect(await unbuildable()).not.toHaveProperty('isError')
  })

  it('names the defence problem in each phase', async () => {
    expect((await unbuildable()).structuredContent).toMatchObject({
      shooting: { status: 'refused', reasons: [reason] },
      melee: { status: 'refused', reasons: [reason] },
    })
  })
})

describe('an attack larger than the server calculation bound', () => {
  const oversized = () =>
    simulateCombat({
      attacker: { ...squad, models: 10, attached: [{ unit: 'Leader' }] },
      defender: { ...squad, models: 10, attached: [{ unit: 'Leader' }] },
      modifiers: { weapons: { all: { attacks: 10, damage: 10, sustained: { dice: 1, sides: 6, bonus: 0 }, devastating: true } } },
    })

  it('is not a tool error', async () => {
    expect(await oversized()).not.toHaveProperty('isError')
  })

  it('explains each phase it could not estimate', async () => {
    expect((await oversized()).structuredContent).toMatchObject({
      shooting: { status: 'refused', reasons: ['This attack is too large to simulate. Select fewer weapons or models.'] },
      melee: { status: 'refused', reasons: ['This attack is too large to simulate. Select fewer weapons or models.'] },
    })
  })

  it('explains why shooting then melee has no estimate', async () => {
    expect((await oversized()).structuredContent).toMatchObject({
      shootingThenMelee: { status: 'refused', reasons: ['This attack is too large to simulate. Select fewer weapons or models.'] },
    })
  })

  it('still links to the simulator', async () => {
    expect((await oversized()).structuredContent).toHaveProperty('simulatorUrl')
  })
})

it('refuses while reference data is unavailable', async () => {
  reference.corpus = null
  expect(await simulateCombat({ attacker: squad, defender: beast })).toMatchObject({ isError: true })
})
