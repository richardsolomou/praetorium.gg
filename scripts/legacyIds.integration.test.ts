import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import missions from '../catalogue/legacy-ids/missions.json' with { type: 'json' }
import stratagems from '../catalogue/legacy-ids/stratagems.json' with { type: 'json' }
import { legacyIdCorrections } from '../src/core/legacyRosterIds'
import { vsDataConstructionSchema, vsDataDefinitions } from '../src/core/vsDataConstruction'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
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

  it('lead every corrected datasheet to a unit its rules version defines', () => {
    const base = readCatalogueComposition(source)!.editions.find((entry) => entry.base)!.edition.id
    const read = new Map<string, ReturnType<typeof vsDataDefinitions>>()
    const units = (edition: string) => {
      if (!read.has(edition)) {
        const file = path.join(source, 'summaries', `${edition}.construction.json`)
        read.set(edition, vsDataDefinitions(vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))))
      }
      return read.get(edition)!
    }
    const missing = legacyIdCorrections
      .filter((correction) => correction.section === 'units' || correction.section === 'options')
      .filter((correction) => !units(correction.key.includes('~') ? correction.key.split('~')[0]! : base).get('unit', correction.to))
    expect(missing.map((correction) => `${correction.section} ${correction.key} ${correction.to}`)).toEqual([])
  })
})
