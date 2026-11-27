import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import missions from '../catalogue/legacy-ids/missions.json' with { type: 'json' }
import stratagems from '../catalogue/legacy-ids/stratagems.json' with { type: 'json' }
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
