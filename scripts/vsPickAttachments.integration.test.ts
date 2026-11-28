import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { vsFirstPickOf } from '../src/shared/vsDataPicks'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const necrons = 'b654-a18a-ea1-3bf2'
const cursedLegion = 'c4ee-83c7-812c-5ff0'
const chronomancer = '5ee3-7288-a8da-204e'
const lokhustDestroyers = 'd8f0-1727-fcdd-7ee9'
const adeptusCustodes = '1f19-6509-d906-ca10'
const nullMaidenVigil = 'd3ee-47e1-4540-dfe5'
const inquisitorCoteaz = '8ae-eb96-e978-195a'
const prosecutorSquad = '71c0-19d8-f88b-c89'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('attachments of VS picks', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
  })

  const errorsOf = (list: { catalogueId: string; detachmentIds: string[] }, host: string, joiner: string, enhancement?: string) => {
    const joinerPick = vsFirstPickOf(loaded, list, joiner)!
    const units = [
      { entryId: host, vs: vsFirstPickOf(loaded, list, host) },
      { entryId: joiner, vs: enhancement ? { ...joinerPick, enhancement } : joinerPick, attachedTo: 0 },
    ]
    const name = loaded.index.definitions.get(joiner)?.name
    return calculateRosterPrice({ ...list, disposition: null, limit: 2000, units }, loaded, rules)!.errors.flatMap((error) =>
      error.entryName === name ? [error.message] : [],
    )
  }

  it('lets the Enhancement a VS pick takes unlock a host, as Murdermind does for a Chronomancer', () => {
    const list = { catalogueId: necrons, detachmentIds: [cursedLegion] }
    expect(errorsOf(list, lokhustDestroyers, chronomancer, 'necrons.cursed-legion.murdermind')).toEqual([])
  })

  it('admits a host by the keywords VS Data gives it, as an Inquisitor leading Prosecutors', () => {
    const list = { catalogueId: adeptusCustodes, detachmentIds: [nullMaidenVigil] }
    expect(errorsOf(list, prosecutorSquad, inquisitorCoteaz)).toEqual([])
  })
})
