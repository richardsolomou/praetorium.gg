import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import missions from '../catalogue/legacy-ids/missions.json' with { type: 'json' }
import stratagems from '../catalogue/legacy-ids/stratagems.json' with { type: 'json' }
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import units from '../catalogue/legacy-ids/units.json' with { type: 'json' }
import { vsDataConstructionSchema, vsDataDefinitions } from '../src/core/vsDataConstruction'
import { idsIn } from '../src/shared/vsDataPoints'
import { readVsDataRelease } from '../src/server/vsDataSummaries'

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

  it('give every implied allegiance as one its unit can take', () => {
    const base = readCatalogueComposition(source)!.editions.find((entry) => entry.base)!.edition.id
    const offered = (key: string, allegiance: string) => {
      const [edition, entry] = key.includes('~') ? key.split('~') : [base, key]
      const file = path.join(source, 'summaries', `${edition}.construction.json`)
      const definitions = vsDataDefinitions(vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))))
      const unit = idsIn(units.ids, edition === base ? null : edition!).get(entry!)
      const offers = unit ? (definitions.get('unit', unit)?.data.allegiances ?? []) : []
      return offers.some(({ choices }) => choices.includes(allegiance))
    }
    expect(Object.entries(units.allegiances).filter(([key, allegiance]) => !offered(key, allegiance))).toEqual([])
  })
})
