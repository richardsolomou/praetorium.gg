import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { vsFirstPickOf } from '../src/shared/vsDataPicks'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const aeldari = '34a5-8c7e-f468-82d1'
const armouredWarhost = 'a27b-ac32-f0fd-8111'
const starfangs = '932c-12b7-e16e-d9a0'
const chaosDaemons = 'd265-877b-e03d-30ca'
const bloodLegion = '21b4-7a36-fec6-b7ea'
const skullAltar = 'b512-1095-3869-db85'
const leaguesOfVotann = 'f616-3f08-ee8e-3349'
const hearthfyreArsenal = '768a-d0b6-e9a1-c221'
const ironMaster = '4e9a-b459-0e51-a548'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('deployment abilities', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  const fielded = (catalogueId: string, detachmentId: string, unit: { entryId: string; vs?: unknown }) =>
    calculateRosterPrice(
      { catalogueId, detachmentIds: [detachmentId], disposition: null, limit: 2000, units: [unit] as never },
      loaded,
      rules,
    )!.units[0]!

  it('reads Scouts from the keyword line on a datasheet’s models, as the Starfangs’', () => {
    expect(fielded(aeldari, armouredWarhost, { entryId: starfangs }).prebattleRules).toEqual(['scouts'])
  })

  it('reads a VS pick’s core abilities from VS Data, as the Skull Altar’s Infiltrators', () => {
    const list = { catalogueId: chaosDaemons, detachmentIds: [bloodLegion] }
    expect(fielded(chaosDaemons, bloodLegion, { entryId: skullAltar, vs: vsFirstPickOf(loaded, list, skullAltar) }).prebattleRules).toEqual(
      ['infiltrators'],
    )
  })

  it('reads what a VS pick’s Enhancement gives its own unit, as Fârstrydr Node’s Deep Strike', () => {
    const list = { catalogueId: leaguesOfVotann, detachmentIds: [hearthfyreArsenal] }
    const vs = { ...vsFirstPickOf(loaded, list, ironMaster)!, enhancement: 'leagues-of-votann.hearthfyre-arsenal.farstrydr-node' }
    expect(fielded(leaguesOfVotann, hearthfyreArsenal, { entryId: ironMaster, vs }).formationOptions).toEqual(['deep-strike'])
  })
})
