import { expect, it } from 'vitest'
import { decodeCatalogueArtifact, encodeCatalogueArtifact } from './catalogueArtifactCodec'

it('roundtrips nested catalogue maps and sets', () => {
  const source = { factions: new Map([['one', new Map([['units', new Set(['a', 'b'])]])]]) }
  expect(decodeCatalogueArtifact(encodeCatalogueArtifact(source))).toEqual(source)
})

it('rejects a malformed collection marker', () => {
  expect(() => decodeCatalogueArtifact('{"__praetoriumArtifactCollection":"map","values":[1]}')).toThrow('Invalid catalogue map')
})
