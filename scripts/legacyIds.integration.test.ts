import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import bsdataRecords from '../catalogue/legacy-ids/bsdata-records.json' with { type: 'json' }
import missions from '../catalogue/legacy-ids/missions.json' with { type: 'json' }
import stratagems from '../catalogue/legacy-ids/stratagems.json' with { type: 'json' }
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import books from '../catalogue/legacy-ids/books.json' with { type: 'json' }
import units from '../catalogue/legacy-ids/units.json' with { type: 'json' }
import detachments from '../catalogue/legacy-ids/detachments.json' with { type: 'json' }
import enhancements from '../catalogue/legacy-ids/enhancements.json' with { type: 'json' }
import rawOptions from '../catalogue/legacy-ids/options.json' with { type: 'json' }
import { legacyOptionsSchema } from '../src/core/legacyIds'
import { type DefinitionKind, type VsDataDefinitions, vsDataConstructionSchema, vsDataDefinitions } from '../src/core/vsDataConstruction'
import { idsIn } from '../src/shared/vsDataPoints'
import { readVsDataRelease } from '../src/server/vsDataSummaries'
import { legacyImportIds } from '../src/server/legacyNames'
import { sharedSnapshot } from './lib/catalogueSnapshotLoad'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const releases = () =>
  fs
    .readdirSync(path.join(source, 'summaries'))
    .flatMap((file) => [readVsDataRelease(source, path.basename(file, '.json'))].filter((release) => release !== null))

describe.skipIf(!fs.existsSync(path.join(source, 'summaries')))('frozen Game Datacards IDs', () => {
  it('lead every saved mission card, battlefield and twist to the current pack', () => {
    const pack = readVsDataRelease(source)!.missionPacks.flatMap((entry) => [
      ...entry.primaries,
      ...entry.secondaries,
      ...entry.deployments,
      ...entry.layouts,
      ...entry.twists,
    ])
    const members = new Set(pack.map((member) => member.id))
    expect(Object.values(missions.ids).filter((id) => !members.has(id))).toEqual([])
  })

  it('lead every saved Stratagem to one a pinned release types', () => {
    const typed = new Set(releases().flatMap((release) => release.stratagems.map((stratagem) => stratagem.id)))
    expect(Object.values(stratagems.ids).filter((id) => !typed.has(id))).toEqual([])
  })

  it('lead every per-datasheet BSData entry to a record its rules version summarizes', () => {
    const summarized = new Map<string, Set<string>>()
    const missing = Object.entries(bsdataRecords.ids).filter(([key, record]) => {
      const edition = key.includes('~') ? key.slice(0, key.indexOf('~')) : ''
      if (!summarized.has(edition))
        summarized.set(edition, new Set(readVsDataRelease(source, edition || undefined)!.records.map((held) => `${held.kind}:${held.id}`)))
      return !summarized.get(edition)!.has(record)
    })
    expect(missing).toEqual([])
  })
})

describe.skipIf(!fs.existsSync(path.join(source, 'summaries')))('frozen BSData datasheet IDs', () => {
  it('read every datasheet as the unit its rules version’s release aliases it on', () => {
    const disagreements = fs
      .readdirSync(path.join(source, 'summaries'))
      .filter((file) => file.endsWith('.construction.json'))
      .flatMap((file) => {
        const edition = path.basename(file, '.construction.json')
        const summaries = JSON.parse(fs.readFileSync(path.join(source, 'summaries', `${edition}.json`), 'utf8')) as {
          entries: Record<string, string[] | undefined>
        }
        const definitions = vsDataDefinitions(
          vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(path.join(source, 'summaries', file), 'utf8'))),
        )
        const aliased = new Map(
          Object.entries(summaries.entries).flatMap(([key, aliases]) =>
            key.startsWith('unit:')
              ? (aliases ?? []).flatMap((alias) =>
                  alias.startsWith('bsdata.')
                    ? [[alias.slice('bsdata.'.length).replaceAll('.', '-'), key.slice('unit:'.length)] as const]
                    : [],
                )
              : [],
          ),
        )
        // A version's own key reads first, then the bare one, as its lists do; a retired unit reads as its replacement.
        return [...idsIn(units.ids, edition)].flatMap(([entry, unit]) => {
          const wanted = aliased.get(entry)
          return wanted && definitions.current(wanted) !== unit ? [`${edition} ${entry}: ${unit}, aliased on ${wanted}`] : []
        })
      })
    expect(disagreements).toEqual([])
  })

  it('give every implied allegiance as one its unit must take in each rules version', () => {
    const base = readCatalogueComposition(source)!.editions.find((entry) => entry.base)!.edition.id
    const wrong = fs
      .readdirSync(path.join(source, 'summaries'))
      .filter((file) => file.endsWith('.construction.json'))
      .flatMap((file) => {
        const edition = path.basename(file, '.construction.json')
        const definitions = vsDataDefinitions(
          vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(path.join(source, 'summaries', file), 'utf8'))),
        )
        // A version's own key reads first, then the bare one, as its lists do.
        const read = edition === base ? null : edition
        const unitOf = idsIn(units.ids, read)
        return [...idsIn(units.allegiances, read)].flatMap(([entry, allegiance]) => {
          const offers = definitions.get('unit', unitOf.get(entry) ?? '')?.data.allegiances ?? []
          return offers.some((offer) => offer.required && !offer.detachment && offer.choices.includes(allegiance))
            ? []
            : [`${edition} ${entry}: ${allegiance}`]
        })
      })
    expect(wrong).toEqual([])
  })

  it('read a datasheet under a book only as a unit an ally entry offers that book’s faction, or as its own unit', () => {
    const base = readCatalogueComposition(source)!.editions.find((entry) => entry.base)!.edition.id
    const wrong = fs
      .readdirSync(path.join(source, 'summaries'))
      .filter((file) => file.endsWith('.construction.json'))
      .flatMap((file) => {
        const edition = path.basename(file, '.construction.json')
        const definitions = vsDataDefinitions(
          vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(path.join(source, 'summaries', file), 'utf8'))),
        )
        const read = edition === base ? null : edition
        const factionOf = idsIn(books.ids, read)
        const unitOf = idsIn(units.ids, read)
        return [...unitOf].flatMap(([key, unit]) => {
          // A rules version that reads the datasheet as its own unit in the book says so under its own book key.
          if (!key.includes('/') || unitOf.get(key.slice(key.indexOf('/') + 1)) === unit) return []
          const faction = definitions.get('faction', factionOf.get(key.slice(0, key.indexOf('/'))) ?? '')
          return faction?.data.allies?.some((ally) => ally.units.includes(unit)) ? [] : [`${edition} ${key}: ${unit}`]
        })
      })
    expect(wrong).toEqual([])
  })
})

/**
 * Frozen values today's pinned releases define nothing for, as the test below reports them; only a value missing from
 * here fails. A retirement the construction file keeps no single successor for (a split, or another kind's) reads as a drop.
 */
const UNRESOLVED = new Set([
  // The current release names these units without defining them.
  'units 2053-6887-5344-5a84: chaos-daemons.daemonic-charioteer',
  'units 306-db45-d47c-f0e9: space-marines.fire-raptor-gunship',
  'units 3082-c9fe-b2b6-2594: space-marines.fire-raptor-gunship',
  'units 506c-80e8-14a1-616f: space-marines.fire-raptor-gunship',
  'units 5a24-5d3b-949f-984c: space-marines.fire-raptor-gunship',
  'units 6c3c-2a51-45a8-7dbf: aeldari-2.ghost-warrior',
  'units 736e-8d31-9f86-88b3: chaos-daemons.daemonic-charioteer',
  'units 921c-0798-f8ec-2975: chaos-daemons.daemonic-charioteer',
  'units 9dd6-bcba-6ec8-330f: imperial-agents.martial-agent',
  'units ad75-33ce-c532-c4b9: chaos-daemons.daemonic-charioteer',
  'units b6b0-9449-1f70-6cfe: space-marines.bike-squad',
  'units ba07-5f80-6b06-292c: chaos-daemons.immortal-champion',
  'units c3d1-a63d-b122-55a2: necrons.hyperscientist',
  'units d156-7d9b-583f-129e: imperial-agents.enthroned-agent',
  'units d5c7-8476-f068-925d: chaos-daemons.daemonic-charioteer',
  'units daec-96aa-c905-f9b0: chaos-daemons.immortal-champion',
  'units e343-a706-337b-ed54: chaos-daemons.immortal-champion',
  'units e87c-7137-de65-faeb: chaos-daemons.immortal-champion',
  'units e8a9-2c26-4e69-98dd: chaos-daemons.immortal-champion',
  'units f575-6924-86cd-8634: space-marines.fire-raptor-gunship',
  // legacy-profiles' identity retires these with no successor.
  'units legacy-profiles~35c-409a-cf8e-870a: space-marines.devastator-squad',
  'units legacy-profiles~453-8d3-1fbd-293e: space-marines.tactical-squad',
  'units legacy-profiles~dd1b-428a-9463-f1ee: space-marines.suppressor-squad',
  // legacy-marine-old's identity marks these Detachments absent.
  'detachments legacy-marine-old~profile-detachment-option-470a-6daa-9014-12df-0a98-b66e-13b6-13d4: space-marines.gravis-linebreaker-force',
  'detachments legacy-marine-old~profile-detachment-option-470a-6daa-9014-12df-0fa7-f692-c564-45b9: space-marines.gravis-siege-force',
  'detachments legacy-marine-old~profile-detachment-option-470a-6daa-9014-12df-1123-8770-3b67-9745: space-marines.phobos-shadow-force',
  'detachments legacy-marine-old~profile-detachment-option-470a-6daa-9014-12df-1f61-2b65-e778-d7ac: space-marines.phobos-shock-force',
  'detachments legacy-marine-old~profile-detachment-option-470a-6daa-9014-12df-79a8-da59-2007-87b0: space-marines.gauntlet-task-force',
  'detachments legacy-marine-old~profile-detachment-option-470a-6daa-9014-12df-9a90-8bc5-27d1-4d66: space-marines.tactical-brethren',
  'detachments legacy-marine-old~profile-detachment-option-470a-6daa-9014-12df-aa9e-3e30-26a9-2302: space-marines.terminator-storm-force',
  'detachments legacy-marine-old~profile-detachment-option-470a-6daa-9014-12df-c5db-4b91-a749-bbdb: space-marines.tacticus-firestorm-force',
  'detachments legacy-marine-old~profile-detachment-option-470a-6daa-9014-12df-f854-d78c-feef-7d1e: space-marines.devastator-brethren',
  // legacy-rosters names these Enhancements without a record.
  'enhancements legacy-rosters~dark-angels.darkflight-pursuit/b7d9-b94e-d472-8e4f: dark-angels.darkflight-pursuit.nightforged-battery-upgarde',
  'enhancements legacy-rosters~salamanders.forgefathers-seekers/a8c5-e17c-3843-2f0c: space-marines.forgefathers-seekers.adamantine-mantle',
  'enhancements legacy-rosters~space-marines.ironstorm-spearhead/b020-26ca-302f-e615: space-marines.ironstorm-spearhead.redoubtable-machine-spirit-upgrade',
  'enhancements legacy-rosters~space-marines.ironstorm-spearhead/f974-1fb3-2619-6a3a: space-marines.ironstorm-spearhead.gunnery-honours-upgrade',
  'enhancements legacy-rosters~space-marines.phobos-shadow-force/2593-dacd-b635-277b: space-marines.phobos-shadow-force.execute-and-redeploy',
])

describe.skipIf(!fs.existsSync(path.join(source, 'summaries')))('frozen VS Data IDs', () => {
  const constructions = new Map<string, VsDataDefinitions | null>()
  const releaseOf = (edition: string) => {
    const file = path.join(source, 'summaries', `${edition}.construction.json`)
    if (!constructions.has(edition))
      constructions.set(
        edition,
        fs.existsSync(file) ? vsDataDefinitions(vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))) : null,
      )
    return constructions.get(edition)!
  }
  // A saved unit reads as the one its retirement names, as `vsPointsIndex` reads it.
  const resolves = (definitions: VsDataDefinitions | null, kind: DefinitionKind, id: string) => {
    const read = kind === 'unit' ? (definitions?.current(id) ?? id) : id
    return definitions?.get(kind, read) !== undefined && !definitions.unavailable.has(read)
  }
  // A key names its rules version as `<rules version>~<ID>`, else it is the base's.
  const unresolved = (map: string, kind: DefinitionKind, ids: Readonly<Record<string, string>>) => {
    const base = readCatalogueComposition(source)!.editions.find((entry) => entry.base)!.edition.id
    return Object.entries(ids)
      .flatMap(([key, id]) => {
        const edition = key.includes('~') ? key.slice(0, key.indexOf('~')) : base
        return resolves(releaseOf(edition), kind, id) ? [] : [`${map} ${key}: ${id}`]
      })
      .filter((found) => !UNRESOLVED.has(found))
  }

  it('lead every saved book to a faction its rules version defines', () => {
    expect(unresolved('books', 'faction', books.ids)).toEqual([])
  })

  it('lead every saved datasheet, under its book or alone, to a unit its rules version defines or retires it to', () => {
    expect(unresolved('units', 'unit', units.ids)).toEqual([])
  })

  it('lead every saved Detachment to one its rules version defines', () => {
    expect(unresolved('detachments', 'detachment', detachments.ids)).toEqual([])
  })

  it('lead every saved Enhancement to one its rules version defines', () => {
    expect(unresolved('enhancements', 'enhancement', enhancements.ids)).toEqual([])
  })

  it('lead every saved choice to selections the current rules version defines', () => {
    const definitions = releaseOf(readCatalogueComposition(source)!.editions.find((entry) => entry.base)!.edition.id)
    const wrong = Object.entries(legacyOptionsSchema.parse(rawOptions).units).flatMap(([key, entry]) => {
      const named = [entry.base, ...Object.values(entry.choices)].flatMap((choice): [DefinitionKind, string][] => {
        if (!choice || choice === 'unmatched') return []
        if ('allegiance' in choice) return [['allegiance', choice.allegiance]]
        return Object.entries(choice.options).flatMap(([option, wargear]): [DefinitionKind, string][] => [
          ['roster-option', option],
          ...Object.keys(wargear).map((id): [DefinitionKind, string] => ['wargear', id]),
        ])
      })
      return [['unit', entry.unit] satisfies [DefinitionKind, string], ...named].flatMap(([kind, id]) =>
        resolves(definitions, kind, id) ? [] : [`options ${key}: ${kind} ${id}`],
      )
    })
    expect(wrong).toEqual([])
  })
})

describe.skipIf(!fs.existsSync(path.join(source, 'summaries')))('frozen BSData names', () => {
  // Imports read a datasheet or Detachment only by the names frozen for its ID (`scripts/freezeImportNames.ts`).
  it('name every datasheet and Detachment of the current rules version', () => {
    const { catalogue } = sharedSnapshot(source)
    const unnamed = [
      ...catalogue.factions.flatMap(({ id }) =>
        [...(catalogue.index.datasheets.get(id) ?? [])].filter((entry) => !legacyImportIds.datasheetNames.has(entry)),
      ),
      ...[...catalogue.detachments.values()].flatMap(({ options }) =>
        options.filter((option) => !legacyImportIds.detachmentNames.has(option.id)).map((option) => option.id),
      ),
    ]
    expect([...new Set(unnamed)]).toEqual([])
  })
})
