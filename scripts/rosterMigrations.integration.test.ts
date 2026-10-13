import fs from 'node:fs'
import { expect, it } from 'vitest'
import { currentPick, currentDetachmentId, currentRosterIds } from '../src/core/retiredCatalogueIds'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'
import { loadCatalogue } from '../src/server/catalogueIndex'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { buildUnit } from '../src/core/roster'
import { unavailableRosterSelections } from '../src/core/rosterSelections'
import type { RosterPick } from '../src/core/roster'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
let loadedCatalogue: LoadedCatalogue | undefined
const catalogue = () => (loadedCatalogue ??= loadCatalogue(directory)!)
const picks: RosterPick[] = [
  { entryId: '3c0a-10a9-8f84-26a3', choices: { 'd0cd-b8dc-82e-5eb8/34be-35f8-9966-c99f/fe9c-f9ed-2182-bd33': '3372-7d35-b60e-24a9' } },
  {
    entryId: 'e1ac-1406-1081-8ea3',
    choices: {
      'b342-4005-baec-3598/6545-a196-d075-bf4e': 'd208-29d5-5f5f-917d',
      'd445-3ac1-64d5-fd4a/3771-6c3c-4035-70fa': 'd865-b3ae-72eb-73e3',
      'f227-6107-836d-3fee/ef39-2ca8-0396-efc9/3b1a-9e16-a44b-b70a': 'ef7c-6497-d952-88a9',
    },
  },
  { entryId: '8b71-580f-ad19-83d7', choices: { '692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': 'b440-75d0-9e95-486a' } },
]

it.skipIf(!fs.existsSync(directory))('builds every migrated loadout against the pinned source, where the old paths fail', () => {
  const loaded = catalogue()
  const unavailable = (pick: RosterPick) => {
    const unit = buildUnit(pick.entryId, loaded.index, pick.models, pick.choices)
    return unavailableRosterSelections([pick], unit ? [{ ...unit, key: 0 }] : [])
  }
  expect(picks.map((pick) => [unavailable(pick).length, unavailable(currentPick(pick)).length])).toEqual([
    [1, 0],
    [3, 0],
    [1, 0],
  ])
})

it.skipIf(!fs.existsSync(directory))('equips migrated optional Land Raider weapons instead of silently restoring defaults', () => {
  const loaded = catalogue()
  const pick = currentPick({
    entryId: '2b9d-9c13-9277-d157',
    spreads: { '785c-4575-4fc1-fe2a': { 'fda7-4dfc-d586-8c51': 1, 'aa40-6725-eb70-f48f': 1, '478f-f6a0-3bd4-0853': 1 } },
  })
  const built = buildUnit(pick.entryId, loaded.index, pick.models, pick.choices, { spreads: pick.spreads })!
  expect(
    built.choices.find((choice) => choice.key === '376d-e493-b439-19f4')?.options.map((option) => [option.name, option.count]),
  ).toEqual([
    ['Hunter-killer missile', 1],
    ['Multi-melta', 1],
    ['Storm bolter', 1],
  ])
})

it.skipIf(!fs.existsSync(directory))('resolves each migrated detachment wrapper to its current faction option', () => {
  const loaded = catalogue()
  const mappings = [
    ['4029-9237-e8db-af55', 'profile-detachment-option-a603-5039-f08d-e841-79a8-da59-2007-87b0', 'Gauntlet Task Force'],
    ['470a-6daa-9014-12df', 'profile-detachment-option-470a-6daa-9014-12df-1074-ee64-b992-ce44', 'Ironstorm Spearhead'],
    ['470a-6daa-9014-12df', 'profile-detachment-option-470a-6daa-9014-12df-fb20-be3c-55aa-0512', 'Stormlance Task Force'],
    ['470a-6daa-9014-12df', 'profile-detachment-option-470a-6daa-9014-12df-f261-3980-2765-e3be', 'Assault Brethren'],
    ['470a-6daa-9014-12df', 'profile-detachment-option-470a-6daa-9014-12df-d4d1-aae4-327e-1a9f', 'Tacticus Attack Force'],
    ['470a-6daa-9014-12df', 'profile-detachment-option-470a-6daa-9014-12df-ceec-b79b-0b83-92b6', 'Ironclad Champions'],
    ['94bb-3284-ee14-57a1', 'profile-detachment-option-94bb-3284-ee14-57a1-aa9e-3e30-26a9-2302', 'Terminator Storm Force'],
    ['94bb-3284-ee14-57a1', 'profile-detachment-option-94bb-3284-ee14-57a1-0fa7-f692-c564-45b9', 'Gravis Siege Force'],
    ['94bb-3284-ee14-57a1', 'profile-detachment-option-94bb-3284-ee14-57a1-f261-3980-2765-e3be', 'Assault Brethren'],
  ]
  expect(
    mappings.map(
      ([catalogueId, detachmentId]) =>
        loaded.detachments.get(catalogueId!)?.options.find((option) => option.id === currentDetachmentId(detachmentId!))?.name,
    ),
  ).toEqual(mappings.map(([, , name]) => name))
})

it.skipIf(!fs.existsSync(directory))(
  'restores a 1000-point Dark Angels army with its original enhancement and Scout equipment',
  () => {
    const roster = {
      catalogueId: '470a-6daa-9014-12df',
      detachmentIds: ['9d23-833a-17cb-2d7d'],
      disposition: 'priority-assets',
      limit: 1000,
      picks: [
        { entryId: 'f6b9-ebd3-b25d-5ea8', toggles: { 'f9b4-af73-c499-66ce': 1 }, attachedTo: 6 },
        { entryId: 'b62e-cd23-d338-8142', attachedTo: 4 },
        {
          entryId: 'ce90-be8f-9f47-6641',
          models: 5,
          spreads: { '39ae-d203-80cc-60d4': { 'a5d5-538c-a88f-e7ea': 3, '971f-f659-e4b7-e127': 1 } },
        },
        { entryId: '1b37-d674-f2ef-6d3b', models: 3 },
        { entryId: 'bb86-bce3-6729-371a', models: 6 },
        {
          entryId: '3c0a-10a9-8f84-26a3',
          models: 5,
          choices: picks[0]!.choices,
          spreads: { 'd0cd-b8dc-82e-5eb8': { '1008-b543-bfc2-4959': 1, '5173-cc7b-b53a-514': 2, '428c-bf14-96d3-4692': 1 } },
        },
        { entryId: 'bc4e-8331-8179-255b', models: 5 },
        {
          entryId: 'e1ac-1406-1081-8ea3',
          choices: { 'f227-6107-836d-3fee/131c-8a56-d003-b9a9/d95f-e1f7-815e-ec69': 'e487-31e6-b956-c818' },
          attachedTo: 9,
        },
        { entryId: '7dff-dd08-e80c-9117', attachedTo: 9 },
        { entryId: 'da66-4d12-2b43-4360' },
      ] as RosterPick[],
    }
    const migrated = currentRosterIds(roster)
    const loaded = catalogue()
    const versions = catalogueEditionLoaders(
      directory,
      () => loaded,
      () => null,
    )
    const price = calculateRosterPrice(savedRosterPriceInput(migrated), versions.catalogueFor(migrated.catalogueId), null)!
    expect({
      points: price.points,
      errors: price.errors,
      detachmentError: price.detachmentError,
      unavailable: unavailableRosterSelections(migrated.picks, price.units),
      enhancements: price.units[7]!.enhancements,
      knives: price.units[5]!.wargear.find((piece) => piece.name === 'Combat Knife')?.count,
    }).toEqual({ points: 1000, errors: [], detachmentError: null, unavailable: [], enhancements: ['Lord of the Ravenwing'], knives: 2 })
  },
  30_000,
)

it.skipIf(!fs.existsSync(directory))(
  'retains archived profile prices instead of joining a different datacard revision',
  () => {
    const versions = catalogueEditionLoaders(directory, catalogue, () => null)
    const catalogueId = 'legacy-profiles~a603-5039-f08d-e841'
    const loaded = versions.catalogueFor(catalogueId)!
    const input = savedRosterPriceInput({
      catalogueId,
      detachmentIds: [],
      disposition: null,
      limit: 1000,
      picks: [{ entryId: 'profile-unit-e0af-67df-9d63-8fb8-7648-0a7c-895d-1d9a', catalogueId }],
    })
    expect({
      original: calculateRosterPrice(input, loaded, null)?.points,
      mismatchedCard: calculateRosterPrice(input, { ...loaded, datacardExcludedCatalogueIds: undefined }, null)?.points,
    }).toEqual({ original: 95, mismatchedCard: 100 })
  },
  30_000,
)
