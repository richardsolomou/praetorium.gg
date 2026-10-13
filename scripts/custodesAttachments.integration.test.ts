import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { attachmentErrors, attachmentOf } from '../src/core/attach'
import { nameOf } from '../src/core/catalogue'
import { loadCatalogue, type LoadedCatalogue } from '../src/server/catalogueIndex'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { datasheetIn } from '../src/shared/catalogue'

const source = path.join(process.env.CATALOGUE_DIR ?? 'catalogue-data', 'editions', 'custodes-11e')
const guards = ['Custodian Guard Sodality', 'Sentinel Guard Sodality', 'Custodian Wardens']
const terminators = [
  'Allarus Custodians',
  'Aquilon Terminators with Solarite Power Gauntlets',
  'Aquilon Terminators with Solarite Power Talons',
]
// The rule wording lives on the preview fork branch; the digest pins it without copying it here.
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

describe.skipIf(!fs.existsSync(source))('Custodes preview corrections', () => {
  let loaded: LoadedCatalogue
  let catalogueId: string
  const unit = (name: string) =>
    [...loaded.index.datasheets.get(catalogueId)!]
      .map((id) => loaded.index.definitions.get(id)!)
      .find((entry) => nameOf(entry, loaded.index.definitions) === name)!

  beforeAll(() => {
    const edition = readCatalogueComposition(path.resolve('catalogue'))!.editions.find(
      ({ edition: candidate }) => candidate.id === 'custodes-11e',
    )!.edition
    loaded = loadCatalogue(source, edition)!
    catalogueId = `custodes-11e~${edition.catalogueIds[0]}`
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

  it('includes Anathema Psykana in the preview army rules', () => {
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

  it.each(attachments)('keeps $name reference attachments in the preview rules version', ({ name, kind, targets }) => {
    expect(
      datasheetIn(loaded, catalogueId, unit(name).id)!.attachments.map((entry) => [entry.kind, entry.name, entry.route?.catalogueId]),
    ).toEqual(targets.map((target) => [kind, target, catalogueId]))
  })

  it.each(attachments.flatMap(({ name, targets }) => targets.map((target) => ({ name, target }))))(
    'accepts $name attached to $target and exposes the inverse reference',
    ({ name, target }) => {
      const leader = unit(name)
      const host = unit(target)
      const reference = datasheetIn(loaded, catalogueId, host.id)!
      expect({
        errors: attachmentErrors([{ entryId: leader.id, attachedTo: 1 }, { entryId: host.id }], loaded.index),
        inverse: [...reference.leaders, ...reference.supporters].some(
          (entry) => entry.name === name && entry.route?.catalogueId === catalogueId,
        ),
      }).toEqual({ errors: [], inverse: true })
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
})
