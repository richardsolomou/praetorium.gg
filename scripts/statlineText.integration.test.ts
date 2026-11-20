import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { datasheetCharacteristicKindOf, datasheetProfileKindOf, weaponShaped } from '../src/core/datasheetStructure'
import { hasTextTokens } from '../src/core/sourceText'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { datasheetIn } from '../src/shared/catalogue'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const STATLINES = new Set(['unit', 'ranged-weapon', 'melee-weapon'])

describe.skipIf(!fs.existsSync(source))('datasheet statlines', () => {
  // A statline withheld as rules text reaches the page as raw text tokens, whatever profile type prints it.
  it('publish every characteristic as printed', { timeout: 300_000 }, () => {
    const loaded = loadCatalogue(source)!
    const withheld = [...loaded.index.datasheets].flatMap(([catalogueId, entryIds]) =>
      [...entryIds].flatMap((entryId) => {
        const sheet = datasheetIn(loaded, catalogueId, entryId)
        return (sheet?.profiles ?? [])
          .filter(
            (profile) => STATLINES.has(datasheetProfileKindOf(profile)) || weaponShaped(profile.values.map(datasheetCharacteristicKindOf)),
          )
          .flatMap((profile) =>
            profile.values
              .filter((value) => datasheetCharacteristicKindOf(value) !== 'other' && hasTextTokens(value.value))
              .map((value) => `${sheet!.name} / ${profile.name} / ${value.name}`),
          )
      }),
    )
    expect(withheld.slice(0, 20)).toEqual([])
  })
})
