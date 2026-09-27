import { expect, it } from 'vitest'
import { decodeCatalogueArtifact, encodeCatalogueArtifact } from './catalogueArtifactCodec'

it('roundtrips nested catalogue maps and sets', () => {
  const source = { factions: new Map([['one', new Map([['units', new Set(['a', 'b'])]])]]) }
  expect(decodeCatalogueArtifact(encodeCatalogueArtifact(source))).toEqual(source)
})

it('rejects a malformed collection marker', () => {
  expect(() => decodeCatalogueArtifact('{"__praetoriumArtifactCollection":"map","values":[1]}')).toThrow('Invalid catalogue map')
})

it('preserves a proto key containing a collection', () => {
  const decoded = decodeCatalogueArtifact('{"__proto__":{"__praetoriumArtifactCollection":"set","values":["one"]}}') as Record<
    string,
    unknown
  >
  expect({ own: Object.hasOwn(decoded, '__proto__'), value: decoded.__proto__, prototype: Object.getPrototypeOf(decoded) }).toEqual({
    own: true,
    value: new Set(['one']),
    prototype: Object.prototype,
  })
})
