import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { attachmentErrors, attachmentOf } from '../src/core/attach'
import { nameOf } from '../src/core/catalogue'
import { battleSizeSelection, rosterLimit } from '../src/core/evaluate'
import { loadCatalogue, type LoadedCatalogue } from '../src/server/catalogueIndex'
import { factionsFromDatacards } from '../src/server/datacardFactions'
import { loadDatacards } from '../src/server/datacards'
import { routeSlug } from '../src/core/slug'
import { datasheetIn } from '../src/shared/catalogue'
import { isMatchedPlayDatasheet } from '../src/shared/catalogueUnit'
import { rosterDetachments } from '../src/shared/rosterDetachments'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const catalogueId = '1f19-6509-d906-ca10'
// Current rules route references by faction rather than book.
const route = 'adeptus-custodes'
const guards = ['Custodian Guard Sodality', 'Sentinel Guard Sodality', 'Custodian Wardens']
const terminators = [
  'Allarus Custodians',
  'Aquilon Terminators with Solarite Power Gauntlets',
  'Aquilon Terminators with Solarite Power Talons',
]
// The rule wording lives on the codex fork branch; the digest pins it without copying it here.
const anathemaPsykana = 'b4bb5c2717920f4ba1a3b9c806931629d594874b97bbed315898bc8143a7df4f'
const digest = (text: string | null | undefined) => text && createHash('sha256').update(text).digest('hex')
const attachments = [
  { name: 'Trajann Valoris', kind: 'leader', targets: [...guards, ...terminators] },
  { name: 'Shield-Captain', kind: 'leader', targets: guards },
  { name: 'Blade Champion', kind: 'leader', targets: guards },
  { name: 'Shield-Captain in Allarus Terminator Armour', kind: 'leader', targets: terminators },
  { name: 'Shield-Captain on Dawneagle Jetbike', kind: 'leader', targets: ['Vertus Praetors', 'Gyrfalcon Jetbike Sodality'] },
  { name: 'Knight-Centura', kind: 'support', targets: ['Prosecutor Squad', 'Vigilator Squad', 'Witchseeker Squad'] },
] as const

describe.skipIf(!fs.existsSync(source))('Custodes codex', () => {
  let loaded: LoadedCatalogue
  const unit = (name: string) =>
    [...loaded.index.datasheets.get(catalogueId)!]
      .map((id) => loaded.index.definitions.get(id)!)
      .find((entry) => nameOf(entry, loaded.index.definitions) === name)!

  beforeAll(() => {
    loaded = loadCatalogue(source)!
  })

  it.each([
    ['Trajann Valoris', '40mm'],
    ['Shield-Captain', '40mm'],
    ['Shield-Captain in Allarus Terminator Armour', '40mm'],
    ['Shield-Captain on Dawneagle Jetbike', '75 x 42mm'],
    ['Blade Champion', '40mm'],
    ['Sentinel Guard Sodality', null],
    ['Custodian Guard Sodality', '40mm'],
    ['Custodian Wardens', '40mm'],
    ['Allarus Custodians', '40mm'],
    ['Aquilon Terminators with Solarite Power Gauntlets', '50mm'],
    ['Aquilon Terminators with Solarite Power Talons', null],
    ['Venatari with Kinetic Destroyers', null],
    ['Venatari with Verutum Lances', '40mm'],
    ['Telemon Heavy Dreadnought', '100mm'],
    ['Contemptor-Galatus Dreadnought', '60mm'],
    ['Contemptor-Achillus Dreadnought', '60mm'],
    ['Vertus Praetors', '75 x 42mm'],
    ['Gyrfalcon Jetbike Sodality', '60mm flying base'],
    ['Pallas Grav-Attack', '105 x 70mm'],
    ['Coronus Grav-Carrier', 'Use model'],
    ['Caladius Grav-Tank', '170 x 109mm'],
    ['Caladius Annihilator Grav-Tank', null],
    ['Knight-Centura', '32mm'],
    ['Prosecutor Squad', '32mm'],
    ['Vigilator Squad', '32mm'],
    ['Witchseeker Squad', '32mm'],
    ['Anathema Psykana Rhino', 'Use model'],
  ])('shows the sourced base size for %s without inferring missing sizes', (name, baseSize) => {
    expect(datasheetIn(loaded, catalogueId, unit(name).id)!.baseSize).toBe(baseSize)
  })

  it.each(['Knight-Centura', 'Prosecutor Squad', 'Vigilator Squad', 'Witchseeker Squad', 'Anathema Psykana Rhino'])(
    'shows the Anathema Psykana inclusion and muster restrictions on %s',
    (name) => {
      expect(
        digest(
          datasheetIn(loaded, catalogueId, unit(name).id)!.abilities.find((ability) => ability.name === 'Anathema Psykana')?.description,
        ),
      ).toBe(anathemaPsykana)
    },
  )

  it('includes Anathema Psykana in the army rules', () => {
    expect(
      digest(
        [...loaded.factionContents.values()]
          .find((content) => content.name === 'Adeptus Custodes')!
          .armyRules.find((rule) => rule.name === 'Anathema Psykana')?.description,
      ),
    ).toBe(anathemaPsykana)
  })

  it.each(attachments)('offers exactly the accepted $kind targets for $name', ({ name, kind, targets }) => {
    expect(attachmentOf(unit(name), loaded.index)).toEqual({ kind, targets })
  })

  it.each(attachments)('keeps $name reference attachments in the current rules version', ({ name, kind, targets }) => {
    expect(
      datasheetIn(loaded, catalogueId, unit(name).id)!.attachments.map((entry) => [entry.kind, entry.name, entry.route?.catalogueId]),
    ).toEqual(targets.map((target) => [kind, target, route]))
  })

  it.each(attachments.flatMap(({ name, targets }) => targets.map((target) => ({ name, target }))))(
    'accepts $name attached to $target and exposes the inverse reference',
    ({ name, target }) => {
      const leader = unit(name)
      const host = unit(target)
      const reference = datasheetIn(loaded, catalogueId, host.id)!
      expect({
        errors: attachmentErrors([{ entryId: leader.id, attachedTo: 1 }, { entryId: host.id }], loaded.index),
        inverse: [...reference.leaders, ...reference.supporters].some((entry) => entry.name === name && entry.route?.catalogueId === route),
      }).toEqual({ errors: [], inverse: true })
    },
  )

  it.each([
    ['Trajann Valoris', 2000, 1],
    ['Allarus Custodians', 1000, 2],
    ['Allarus Custodians', 2000, 3],
    ['Custodian Guard Sodality', 1000, 4],
    ['Custodian Guard Sodality', 2000, 6],
    ['Anathema Psykana Rhino', 2000, 6],
    ['Prosecutor Squad', 2000, 3],
  ] as const)('limits %s to the MFM unit limit at %i points', (name, size, limit) => {
    expect(
      rosterLimit(unit(name), loaded.index, {
        primaryCatalogueId: catalogueId,
        mustering: true,
        roster: [battleSizeSelection(loaded.index, size)!],
      }),
    ).toBe(limit)
  })

  it.each([
    [1000, 4],
    [2000, 6],
  ])('gives Prosecutor Squads the Battleline unit limit under Null Maiden Vigil at %i points', (size, limit) => {
    const vigil = [...loaded.index.definitions.values()].find((entry) => entry.name === 'Null Maiden Vigil')!
    const roster = [battleSizeSelection(loaded.index, size)!, ...rosterDetachments(loaded, catalogueId, [vigil.id]).selections]
    expect(rosterLimit(unit('Prosecutor Squad'), loaded.index, { primaryCatalogueId: catalogueId, mustering: true, roster })).toBe(limit)
  })

  it.each([
    ['Aleya [Legends]', ['Prosecutor Squad', 'Vigilator Squad', 'Witchseeker Squad']],
    ['Valerian [Legends]', ['Custodian Guard Sodality', 'Custodian Wardens', 'Sentinel Guard Sodality']],
  ])('lets %s lead the codex units MFM 1.6 lists', (name, targets) => {
    expect(attachmentOf(unit(name), loaded.index)?.targets).toEqual(targets)
  })

  it.each(['Aleya [Legends]', 'Valerian [Legends]', 'Venerable Contemptor Dreadnought [Legends]', 'Venerable Land Raider [Legends]'])(
    'keeps %s out of matched play',
    (name) => {
      expect(isMatchedPlayDatasheet(loaded.index, unit(name))).toBe(false)
    },
  )

  it('refuses Trajann joining Venatari', () => {
    expect(
      attachmentErrors(
        [{ entryId: unit('Trajann Valoris').id, attachedTo: 1 }, { entryId: unit('Venatari with Verutum Lances').id }],
        loaded.index,
      ),
    ).toEqual([
      { entryId: unit('Trajann Valoris').id, entryName: 'Trajann Valoris', message: 'cannot be attached to Venatari with Verutum Lances' },
    ])
  })

  it('requires the Knight-Centura to join a Bodyguard unit', () => {
    expect(attachmentErrors([{ entryId: unit('Knight-Centura').id }], loaded.index)).toEqual([
      { entryId: unit('Knight-Centura').id, entryName: 'Knight-Centura', message: 'must be attached to a Bodyguard unit' },
    ])
  })

  it('refuses two Knight-Centuras supporting the same squad', () => {
    const knight = unit('Knight-Centura')
    expect(
      attachmentErrors(
        [{ entryId: knight.id, attachedTo: 2 }, { entryId: knight.id, attachedTo: 2 }, { entryId: unit('Witchseeker Squad').id }],
        loaded.index,
      ),
    ).toEqual([
      {
        entryId: knight.id,
        entryName: 'Knight-Centura',
        message: 'cannot support Witchseeker Squad, which is already supported by Knight-Centura',
      },
    ])
  })

  it.each([
    ['Superhuman Focus', 'Emperor’s Chosen', 'either', undefined],
    ['In Auramite Clad', 'Emperor’s Chosen', 'opponent-turn', ['shooting', 'fight']],
    ['Vigil Unending', 'Lions of the Emperor', 'opponent-turn', ['shooting', 'fight']],
    ['Gilded Champion', 'Auric Champions', 'either', undefined],
  ])('offers %s from %s in battle with its printed timing', (name, detachment, turn, phases) => {
    const pools = factionsFromDatacards(loadDatacards(path.join(source, 'datacards', '11th', 'gdc')), source).byDetachment
    const card = pools
      .get('adeptus-custodes')
      ?.get(routeSlug(detachment))
      ?.find((stratagem) => stratagem.name === name)
    expect(card && { turn: card.turn, phases: card.phases }).toEqual({ turn, phases })
  })

  it('keeps Honoured Interred out of battle while one turn cannot express its timing', () => {
    const pools = factionsFromDatacards(loadDatacards(path.join(source, 'datacards', '11th', 'gdc')), source).byDetachment
    expect(
      pools
        .get('adeptus-custodes')
        ?.get(routeSlug('Might of the Moritoi'))
        ?.map((stratagem) => stratagem.name),
    ).not.toContain('Honoured Interred')
  })
})
