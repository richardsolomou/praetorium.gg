import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { reduceBattle } from '../src/core/battle'
import { ALICE, builtRoster, log, PLAYERS } from '../src/core/battle.fixtures'
import { buildUnit } from '../src/core/roster'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/** Each datasheet's default loadout as the official app prints it, which the default patches in `catalogue/patches/definitions` correct. */
describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('default loadouts the app prints', () => {
  let loaded: LoadedCatalogue

  beforeAll(() => {
    ;({ catalogue: loaded } = loadSnapshot(directory))
  })

  /** What a new unit holds in a group, or with `floor`, what a unit saved before the printed default won holds. */
  const chosen = (entryId: string, group: string, alongside?: string, floor?: true) => {
    const catalogueId = loaded.factions.find((faction) => loaded.index.datasheets.get(faction.id)?.has(entryId))!.id
    const choice = buildUnit(entryId, loaded.index, undefined, {}, { primaryCatalogueId: catalogueId, floor })!.choices.find(
      (candidate) => candidate.name === group && (!alongside || candidate.options.some((option) => option.name === alongside)),
    )!
    return choice.options.find((option) => option.count > 0)?.name
  }

  it.each([
    ['Captain', '91e3-a419-8c58-98f5', 'Melee Weapon', 'Master-crafted power weapon'],
    ['Wolf Guard Battle Leader', '5d5e-cd7a-4443-abfb', 'Replace Storm Shield', 'Plasma pistol'],
    ['Redemptor Dreadnought', 'fcb6-80ca-22a-4771', 'Weapon Option 3', 'Fragstorm Grenade Launchers'],
    ['Lokhust Heavy Destroyers', '654f-6cb0-c27a-2e73', '1-3 Heavy Destroyers', 'Destroyer w/ gauss destructor'],
    ['Decimus Kill Team', 'd41f-7e7c-18f1-4b98', 'Weapon', 'Infernus heavy bolter'],
    ['Wulfen with Storm Shields', 'a947-7113-3284-4248', 'Wulfen', 'Wulfen w/Auto-launcher'],
    ['Corsair Voidreavers', '94d7-39fb-35da-3a39', '4-9 Voidreavers', 'Voidreaver with sword and pistol'],
  ])('gives the %s its app default', (_, entryId, group, expected) => expect(chosen(entryId, group)).toBe(expected))

  it.each([
    ['Leman Russ Battle Tank', '4071-d276-4b66-b186', 'Lascannon', 'Lascannon', undefined],
    ['Achilles Ridgerunners', '977e-7c17-5a03-746b', 'Heavy Mining Laser', 'Heavy mining laser', undefined],
    ['Ravager', 'db8-7a89-3b82-c492', 'Weapon Option', 'Dark Lance', undefined],
    ['Repulsor Executioner', '6d49-e23e-978b-7160', 'Turret Weapon', 'Heavy Laser Destroyer', undefined],
    ['Desolation Sergeant', 'd7cd-4833-9dc7-6857', 'Weapon Option', 'Superfrag Rocket Launcher', 'Vengor launcher'],
    ['Chaos Rhino (Death Guard)', 'a0fc-8a48-f51e-f81b', 'Pintle weapon', 'Combi-bolter', undefined],
    ['Ynnari Wyches', '5ac0-062e-cca4-558b', 'Pistol Choice', 'Splinter Pistol', undefined],
    ['Einhyr Hearthguard', '70ac-ee9a-7ee4-b58a', 'Exchange melee weapon for hammer', 'Concussion gauntlet', undefined],
  ])('starts a new %s on the wargear its card prints, whatever it costs', (_, entryId, group, expected, alongside) =>
    expect(chosen(entryId, group, alongside)).toBe(expected),
  )

  it('keeps a Leman Russ saved before the printed default won on its cheapest sponson', () =>
    expect(chosen('4071-d276-4b66-b186', 'Lascannon', undefined, true)).toBe('Heavy bolter'))

  /** The sponson a Leman Russ fielded in a battle is rebuilt with, from the picks the battle's log holds. */
  const fieldedSponson = (printedDefaults?: true) => {
    const command = builtRoster('Astra Militarum', ['Leman Russ Battle Tank'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected built roster')
    command.roster.built.picks = [{ entryId: '4071-d276-4b66-b186' }]
    if (printedDefaults) command.roster.built.printedDefaults = printedDefaults
    const [pick] = reduceBattle(PLAYERS, log([ALICE, command])).players[0]!.roster!.built!.picks!
    const catalogueId = loaded.factions.find((faction) => loaded.index.datasheets.get(faction.id)?.has(pick!.entryId))!.id
    const unit = buildUnit(pick!.entryId, loaded.index, undefined, {}, { primaryCatalogueId: catalogueId, floor: pick!.floor })!
    return unit.choices.find((choice) => choice.name === 'Lascannon')!.options.find((option) => option.count > 0)?.name
  }

  it('rebuilds a Leman Russ fielded before the printed default won on its cheapest sponson', () =>
    expect(fieldedSponson()).toBe('Heavy bolter'))

  it('rebuilds a Leman Russ fielded since on its printed lascannon', () => expect(fieldedSponson(true)).toBe('Lascannon'))
})
