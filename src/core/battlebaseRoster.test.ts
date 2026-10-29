import { expect, it } from 'vitest'
import { type BattlebaseNames, type BattlebaseRoster, battlebaseTextRoster, importDetachment, namedArmy } from './battlebaseRoster'
import { IMPORT_FACTIONS } from './battlebaseBattle.fixtures'

const names: BattlebaseNames = {
  factions: { necrons: 'Necrons' },
  datasheets: { overlord: 'Overlord', warriors: 'Necron Warriors' },
  models: { overlord: 'Overlord', warrior: 'Necron Warrior' },
  wargear: { gauss: 'Gauss flayer', reaper: 'Gauss reaper', glaive: 'Voidscythe' },
  enhancements: { veil: 'Veil of Darkness' },
  detachments: { cursed: 'Cursed Legion' },
  forceDispositions: { purge: 'Purge the Foe' },
  stratagems: [],
}

const roster = (): BattlebaseRoster => ({
  title: 'Tomb World',
  factionId: 'necrons',
  detachmentIds: ['cursed'],
  forceDispositionId: 'purge',
  units: [
    { id: 'u1', datasheetId: 'overlord' },
    { id: 'u2', datasheetId: 'warriors' },
  ],
  unitModels: [
    { id: 'm1', unitId: 'u1', count: 1, modelId: 'overlord', isWarlord: true },
    { id: 'm2', unitId: 'u2', count: 10, modelId: 'warrior' },
  ],
  unitWargear: [],
  unitModelWargear: [
    { unitModelId: 'm1', count: 1, wargearEditSetWargearItemId: 'glaive' },
    { unitModelId: 'm2', count: 7, wargearEditSetWargearItemId: 'gauss' },
    { unitModelId: 'm2', count: 3, wargearEditSetWargearItemId: 'reaper' },
  ],
  unitEnhancements: [],
  unitModelEnhancements: [{ unitModelId: 'm1', enhancementId: 'veil' }],
  unitAttachments: [{ attachedUnitId: 'u1', targetUnitId: 'u2' }],
})

it('reads a BattleBase roster as the list importer reads army text', () => {
  expect(battlebaseTextRoster(roster(), names, 2000)).toEqual({
    name: 'Tomb World',
    faction: 'Necrons',
    detachment: 'Cursed Legion',
    disposition: 'Purge the Foe',
    limit: 2000,
    units: [
      {
        name: 'Overlord',
        selections: [
          { name: 'Voidscythe', count: 1, model: 'Overlord' },
          { name: 'Veil of Darkness', count: 1 },
        ],
        leading: null,
        models: 1,
        entry: 1,
        attachedToEntry: 2,
        warlord: true,
      },
      {
        name: 'Necron Warriors',
        selections: [
          { name: 'Gauss flayer', count: 7, model: 'Necron Warrior' },
          { name: 'Gauss reaper', count: 3, model: 'Necron Warrior' },
        ],
        leading: null,
        models: 10,
        entry: 2,
        warlord: false,
      },
    ],
  })
})

it('reads nothing from a roster naming a choice the data does not, rather than dropping the choice', () => {
  const unknown = roster()
  unknown.unitModelWargear.push({ unitModelId: 'm2', count: 1, wargearEditSetWargearItemId: 'retired' })
  expect(battlebaseTextRoster(unknown, names, 2000)).toBeNull()
})

it('names detachments through a misspelt faction prefix and a promotional suffix', () => {
  expect(
    [
      ['detachment-necons-cursed-legion', IMPORT_FACTIONS[0]!],
      ['detachment-deathwatch-black-spear-task-force-grotmas', IMPORT_FACTIONS[1]!],
    ].map(([id, faction]) => importDetachment(id as string, faction as (typeof IMPORT_FACTIONS)[number], IMPORT_FACTIONS)),
  ).toEqual(['Cursed Legion', 'Black Spear Task Force'])
})

it('names a detachment the catalogue does not hold from the faction it is filed under', () => {
  expect(importDetachment('detachment-space-marines-hammer-of-avernii', null, IMPORT_FACTIONS)).toBe('Hammer of Avernii')
})

it('fields the base catalogue rather than another rules version of the same army', () => {
  const variant = { ...IMPORT_FACTIONS[0]!, id: 'older~necrons-catalogue' }
  const army = namedArmy({ faction: 'faction-necrons', detachments: [] }, null, [variant, ...IMPORT_FACTIONS], 2000, 'revision')
  expect(army.built?.catalogueId).toBe('necrons-catalogue')
})
