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
const gear = (id: string, name: string, values: Record<string, string>) => ({
  id: `${id}-gear`,
  name,
  type: 'upgrade' as const,
  constraints: sizes(1, 1),
  profiles: [profile(id, name, 'Ranged Weapons', values)],
})
const CARD_TOKEN = '⟦0123abcd:plain:0123456789abcdef⟧'
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
        categoryLinks: categories('Infantry'),
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
        selectionEntryGroups: [
          {
            id: 'enhancements',
            name: 'Enhancements',
            constraints: [{ id: 'enhancement-max', type: 'max' as const, value: 1, field: 'selections', scope: 'parent' }],
            selectionEntries: [
              {
                id: 'keen-eye',
                name: 'Keen Eye',
                type: 'upgrade',
                profiles: [
                  profile('keen-eye-rule', 'Keen Eye', 'Abilities', {
                    Description: 'Each time a model in this unit makes an attack, add 1 to the Hit roll.',
                  }),
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'banner',
        name: 'Banner',
        type: 'model',
        profiles: [
          profile('banner-stats', 'Banner', 'Unit', { T: '4', Sv: '3+', W: '3' }),
          profile('banner-aura', 'Rallying Banner (Aura)', 'Abilities', {
            Description:
              'While a friendly Infantry unit is within 6" of this model, each time a model in that unit makes an attack, add 1 to the Hit roll.',
          }),
        ],
      },
      {
        id: 'duellist',
        name: 'Duellist',
        type: 'model',
        profiles: [
          profile('duellist-stats', 'Duellist', 'Unit', { T: '4', Sv: '3+', W: '5' }),
          profile('claw', 'Claw', 'Melee Weapons', { A: '4', WS: '3+', S: '4', AP: '0', D: '1' }),
          profile('harvester', 'Harvester', 'Melee Weapons', { A: '3', WS: '3+', S: '10', AP: '-3', D: '3' }),
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
        id: 'sentinel',
        name: 'Sentinel',
        type: 'model',
        profiles: [
          profile('sentinel-stats', 'Sentinel', 'Unit', { T: '4', Sv: '3+', W: '3' }),
          profile('halberd', 'Halberd', 'Melee Weapons', { A: '3', WS: '3+', S: '5', AP: '-1', D: '1' }),
          profile('sentinel-card', 'Card Rule', 'Abilities', { Description: CARD_TOKEN }),
          profile('sentinel-vengeful', 'Vengeful', 'Abilities', {
            Description:
              'While this unit is below its Starting Strength, each time a model in this unit makes an attack, add 1 to the Wound roll.',
          }),
        ],
      },
      {
        id: 'gunners',
        name: 'Gunners',
        type: 'unit',
        categoryLinks: categories('Infantry'),
        selectionEntryGroups: [
          {
            id: 'gunner-models',
            name: 'Models',
            defaultSelectionEntryId: 'gunner',
            constraints: sizes(3, 3),
            selectionEntries: [
              {
                id: 'gunner',
                name: 'Gunner',
                type: 'model',
                constraints: [{ id: 'gunner-max', type: 'max' as const, value: 3, field: 'selections', scope: 'parent' }],
                profiles: [profile('gunner-stats', 'Gunner', 'Unit', { T: '4', Sv: '3+', W: '2' })],
                selectionEntries: [gear('gun', 'Gun', { A: '2', BS: '3+', S: '4', AP: '0', D: '1' })],
              },
              {
                id: 'specialist',
                name: 'Specialist',
                type: 'model',
                constraints: [{ id: 'specialist-max', type: 'max' as const, value: 1, field: 'selections', scope: 'parent' }],
                profiles: [profile('specialist-stats', 'Specialist', 'Unit', { T: '4', Sv: '3+', W: '2' })],
                selectionEntries: [gear('plasma', 'Plasma gun', { A: '1', BS: '3+', S: '8', AP: '-3', D: '2' })],
              },
            ],
          },
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
const documents = ['Squad', 'Leader', 'Protector', 'Beast', 'Oddity', 'Wraith', 'Sentinel', 'Banner', 'Duellist'].map(document)
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
      canonical('sentinel', 'Sentinel'),
      canonical('banner', 'Banner'),
      canonical('duellist', 'Duellist'),
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

vi.mock('./publishedTextFiles', () => ({
  serverWords: async () => (text: string) =>
    text === CARD_TOKEN ? 'Each time a model in this unit makes an attack, add 1 to the Hit roll.' : null,
}))

import { optimizeCombatLoadout, simulateCombat } from './combatTools'
import { unitOptionsFor } from './rosterTools'

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

describe('the rules of a unit', () => {
  const rules = async () =>
    (
      (await simulateCombat({ attacker: { faction: 'test', unit: 'Sentinel' }, defender: beast })).structuredContent as {
        attacker: { rules: { name: string; options: { label: string }[] }[] }
      }
    ).attacker.rules

  it('calculates a rule published as a token from the words the snapshot holds', async () => {
    expect((await rules()).map((rule) => rule.name)).toContain('Card Rule')
  })

  it('withholds a choice label that quotes the rule', async () => {
    expect((await rules()).find((rule) => rule.name === 'Vengeful')?.options).toEqual([{ choice: 1, label: 'Condition the rule states' }])
  })
})

type Rules = { attacker: { rules: { name: string; options: { label: string }[] }[] } }

describe('an enhancement', () => {
  it("fields the enhancement's rules on the character that takes it", async () => {
    const result = await simulateCombat({
      attacker: { ...squad, attached: [{ unit: 'Leader', enhancement: 'Keen Eye' }] },
      defender: beast,
    })
    expect((result.structuredContent as Rules).attacker.rules.map((rule) => rule.name)).toContain('Keen Eye')
  })

  it('refuses one the unit cannot take, naming those it can', async () => {
    const result = await simulateCombat({
      attacker: { ...squad, attached: [{ unit: 'Leader', enhancement: 'Iron Will' }] },
      defender: beast,
    })
    expect(result.structuredContent).toEqual({
      refused: ['Leader cannot take an enhancement named Iron Will. Its enhancements are: Keen Eye.'],
    })
  })
})

it("offers a nearby unit's aura as a rule choice", async () => {
  const result = await simulateCombat({ attacker: { ...squad, nearby: [{ unit: 'Banner' }] }, defender: beast })
  expect((result.structuredContent as Rules).attacker.rules.find((rule) => rule.name === 'Rallying Banner (Aura)')?.options).toEqual([
    { choice: 1, label: 'Within 6"' },
  ])
})

describe('a model with a choice of melee weapons', () => {
  const melee = async (weaponModes?: Record<string, string>) =>
    (
      (await simulateCombat({ attacker: { faction: 'test', unit: 'Duellist' }, defender: beast, ...(weaponModes ? { weaponModes } : {}) }))
        .structuredContent as { melee: { weapons: { name: string }[] } }
    ).melee.weapons.map((weapon) => weapon.name)

  it('fights with the weapon that does most against the defender', async () => {
    expect(await melee()).toEqual(['Harvester'])
  })

  it('fights with the weapon the agent names', async () => {
    expect(await melee({ 'melee:0:weapon': 'claw' })).toEqual(['Claw'])
  })
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

describe('a loadout from a saved roster pick', () => {
  const gunners = { faction: 'test', unit: 'gunners', spreads: { 'gunner-models': { gunner: 2, specialist: 1 } } }
  const fielded = async () => (await simulateCombat({ attacker: gunners, defender: beast })).structuredContent as Record<string, unknown>

  it('names the wargear each unit fielded', async () => {
    expect(await fielded()).toMatchObject({
      attacker: { units: [{ name: 'Gunners', wargear: expect.arrayContaining([{ name: 'Plasma gun', count: 1 }]) }] },
    })
  })

  it('shoots with the chosen wargear', async () => {
    expect(await fielded()).toMatchObject({
      shooting: {
        weapons: [
          { name: 'Gun', count: 2 },
          { name: 'Plasma gun', count: 1 },
        ],
      },
    })
  })

  it('links to the simulator with the same loadout', async () => {
    const url = (await fielded()).simulatorUrl as string
    expect(decodeSimulatorState(new URL(url, 'https://praetorium.gg').searchParams.get('s') ?? undefined)?.sides[0]?.pick).toMatchObject({
      spreads: gunners.spreads,
    })
  })

  it('refuses an option the unit does not have, naming the unit', async () => {
    const result = await simulateCombat({ attacker: { ...gunners, spreads: { 'gunner-models': { veteran: 1 } } }, defender: beast })
    expect(result.structuredContent).toEqual({
      refused: ['Gunners cannot take these wargear choices: it has no option veteran under gunner-models.'],
    })
  })

  it('refuses more of an option than the unit allows', async () => {
    const result = await simulateCombat({
      attacker: { ...gunners, spreads: { 'gunner-models': { gunner: 1, specialist: 2 } } },
      defender: beast,
    })
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { refused: [expect.stringMatching(/^Gunners cannot take these wargear choices/)] },
    })
  })
})

describe('a damaged unit', () => {
  const structured = async (defender: Parameters<typeof simulateCombat>[0]['defender']) =>
    (await simulateCombat({ attacker: { ...squad, models: 10 }, defender })).structuredContent as {
      defender: { models: number; units: unknown[] }
      melee: { destroyedChance: number }
    }

  it('defends with the models it has left', async () => {
    expect((await structured({ ...squad, models: 5, modelsLost: 2 })).defender.models).toBe(3)
  })

  it('is destroyed more often with wounds already lost', async () => {
    const [fresh, wounded] = await Promise.all([structured(beast), structured({ ...beast, woundsLost: 10 })])
    expect(wounded.melee.destroyedChance).toBeGreaterThan(fresh.melee.destroyedChance)
  })

  it('refuses losing every wound of its wounded model', async () => {
    expect((await simulateCombat({ attacker: squad, defender: { ...beast, woundsLost: 12 } })).structuredContent).toEqual({
      refused: ['Beast has 12 wounds per model, so its wounded model cannot have lost 12.'],
    })
  })

  it('refuses losing models when its models carry different wargear', async () => {
    const defender = { faction: 'test', unit: 'gunners', spreads: { 'gunner-models': { gunner: 2, specialist: 1 } }, modelsLost: 1 }
    expect((await simulateCombat({ attacker: squad, defender })).structuredContent).toEqual({
      refused: ['Gunners cannot lose models: its models carry different wargear, so which ones fell is unknown.'],
    })
  })
})

describe('options for a roster pick', () => {
  it('gives the spread key and option ids of a squad that divides its models', async () => {
    const result = await unitOptionsFor({ faction: 'test', units: [{ unit: 'gunners' }], battleSize: 2_000 })
    expect(result.structuredContent).toMatchObject({
      units: [{ choices: [{ key: 'gunner-models', set: 'spreads', options: [{ id: 'gunner' }, { id: 'specialist', max: 1 }] }] }],
    })
  })
})

describe('the best loadout', () => {
  const gunners = { faction: 'test', unit: 'gunners' }
  const optimized = async () =>
    (await optimizeCombatLoadout({ attacker: gunners, defender: beast, mode: 'ranged' })).structuredContent as {
      exhaustive: boolean
      best: { units: { spreads: Record<string, Record<string, number>> }[]; outcome: unknown }
    }

  it('gives the specialist his plasma gun against a tough target', async () => {
    expect((await optimized()).best.units[0]!.spreads['gunner-models']).toMatchObject({ gunner: 2, specialist: 1 })
  })

  it('claims an optimum only after checking every loadout', async () => {
    expect((await optimized()).exhaustive).toBe(true)
  })

  it('scores the loadout it returns as simulate_combat does', async () => {
    const { best } = await optimized()
    const fielded = await simulateCombat({ attacker: { ...gunners, spreads: best.units[0]!.spreads }, defender: beast })
    expect((fielded.structuredContent as { shooting: Record<string, unknown> }).shooting).toMatchObject(
      best.outcome as Record<string, unknown>,
    )
  })
})
