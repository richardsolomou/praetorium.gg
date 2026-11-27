import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { RosterPick } from '../src/core/roster'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../src/shared/pricing'
import type { LoadedRules } from '../src/shared/rules'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const terminators = '13d8-1933-472c-80ed'
const captain = '91e3-a419-8c58-98f5'
const squad = 'space-marines.terminator-squad'

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('a pick fielded by VS Data IDs is checked by VS Data', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null
  let list: { catalogueId: string; detachmentIds: string[] }
  const errors = (units: RosterPick[], detachmentIds = list.detachmentIds) =>
    calculateRosterPrice({ ...list, detachmentIds, disposition: null, limit: 2000, units }, loaded, rules)!.errors
  const loadout = (flamers: number) => ({
    models: { [`${squad}.terminator`]: 9, [`${squad}.terminator-sergeant`]: 1 },
    options: { [`${squad}.terminator-loadout`]: { [`${squad}.heavy-flamer`]: flamers } },
  })

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = loadSnapshot(directory))
    const catalogueId = loaded.factions.find((faction) => faction.name === 'Imperium - Adeptus Astartes - Space Marines')!.id
    list = { catalogueId, detachmentIds: [loaded.detachments.get(catalogueId)!.options[0]!.id] }
  })

  it('raises nothing against a loadout VS Data allows', () => {
    expect(errors([{ entryId: terminators, vs: loadout(1) }]).filter((error) => error.entryId === terminators)).toEqual([])
  })

  it('refuses wargear past what its options allow', () => {
    expect(errors([{ entryId: terminators, vs: loadout(3) }])).toContainEqual({
      entryId: terminators,
      entryName: 'Terminator Squad',
      message: 'takes at most 2 Assault Cannon or Heavy Flamer, has 3',
    })
  })

  it('refuses an Enhancement of a Detachment the list does not take', () => {
    const vs = { models: {}, options: {}, enhancement: 'space-marines.assault-brethren.imperiums-sword' }
    const other = loaded.detachments.get(list.catalogueId)!.options.find((option) => option.name !== 'Assault Brethren')!
    expect(errors([{ entryId: captain, vs }], [other.id])).toContainEqual(
      expect.objectContaining({ entryId: captain, message: 'Imperium’s Sword belongs to another detachment' }),
    )
  })
})
