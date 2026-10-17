import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { constructionFilesForEdition, encodeReferenceBundle } from './offlineReferenceBundle'
import type { CatalogueFile } from '../../src/core/catalogue'
import { catalogueEditionSchema } from '../../src/core/catalogueEdition'
import { decodeReferenceBundle, isReferenceBundle } from '../../src/contracts/offlineReference'
import { packRuntimeData } from '../../src/contracts/runtimeData'

const edition = catalogueEditionSchema.parse({
  id: 'preview',
  name: 'Preview',
  status: 'preview',
  catalogueIds: ['army'],
  releases: [{ at: 1, status: 'preview' }],
})
const files: CatalogueFile[] = [
  { catalogue: { id: 'army', name: 'Army', gameSystemId: 'system', catalogueLinks: [{ targetId: 'allies' }] } },
  { catalogue: { id: 'allies', name: 'Allies', catalogueLinks: [{ targetId: 'library' }] } },
  { catalogue: { id: 'library', name: 'Library', library: true, catalogueLinks: [{ targetId: 'army' }] } },
  { gameSystem: { id: 'system', name: 'System' } },
  { catalogue: { id: 'unrelated', name: 'Unrelated' } },
]

it('includes the selected army, transitive imports and system without unrelated armies', () => {
  expect(constructionFilesForEdition(files, edition)).toEqual(files.slice(0, 4))
})

it('keeps the complete base construction catalogue', () => {
  expect(constructionFilesForEdition(files)).toEqual(files)
})

it('refuses a version whose transitive import is missing', () => {
  expect(() =>
    constructionFilesForEdition(
      files.filter((file) => file.catalogue?.id !== 'library'),
      edition,
    ),
  ).toThrow('missing catalogue library')
})
const search = { factions: [], datasheets: [], detachments: [], rules: [], missions: [] }
it('refuses an encoded bundle the client cannot read', () => {
  expect(() => encodeReferenceBundle({ queries: [{ key: ['private-query'], data: [] }], search })).toThrow(
    'Invalid offline reference bundle',
  )
})
it('versions and compresses reference content independently of application assets', () => {
  const content = { queries: [{ key: ['rule-section', 'core', 'moving'], data: 'Move six inches' }], search }
  const first = encodeReferenceBundle(content)
  expect(encodeReferenceBundle(content)).toEqual(first)
  expect(JSON.parse(gunzipSync(first.compressed).toString())).toEqual({ version: 1, revision: first.revision, ...content })
  expect(encodeReferenceBundle({ ...content, queries: [{ ...content.queries[0]!, data: 'Move seven inches' }] }).revision).not.toBe(
    first.revision,
  )
})
it('rejects a corpus beyond the saved query limit', () => {
  expect(() =>
    encodeReferenceBundle({ queries: Array.from({ length: 20_001 }, () => ({ key: ['rule-index'], data: [] })), search }),
  ).toThrow('too many entries')
})

it('downloads shared version data as complete independent construction sources', () => {
  const base = {
    version: 1 as const,
    revision: 'base',
    files,
    datacards: packRuntimeData(new Map([['army', 'Released']])),
    mfm: null,
    rules: { common: ['Rule'] },
  }
  const selected = {
    ...base,
    files: files.slice(0, 4),
    revision: 'preview',
    edition,
    datacards: packRuntimeData(new Map([['army', 'Preview']])),
  }
  const content = { queries: [], search, construction: { ...base, editions: [selected] } }
  const encoded = encodeReferenceBundle(content)
  const wire = JSON.parse(gunzipSync(encoded.compressed).toString())
  expect(JSON.stringify(wire)).toContain('$praetoriumBase')
  expect(isReferenceBundle(wire)).toBe(false)
  expect(decodeReferenceBundle({ ...wire, version: 2 })).toEqual({ version: 1, revision: encoded.revision, ...content })
  expect(decodeReferenceBundle(wire)).toEqual({ ...wire, version: 1, construction: { ...wire.construction, shared: true } })
})

it('roundtrips a named base edition without duplicating construction data', () => {
  const alias = { base: true as const, version: 1 as const, revision: 'current', edition }
  const construction = { version: 1 as const, revision: 'base', files, datacards: {}, mfm: null, rules: {}, editions: [alias] }
  const content = { queries: [], search, construction }
  const encoded = encodeReferenceBundle(content)
  expect(decodeReferenceBundle(JSON.parse(gunzipSync(encoded.compressed).toString()))).toEqual({
    version: 1,
    revision: encoded.revision,
    ...content,
    construction: { ...construction, shared: true },
  })
})

it('restores repeated prose in reference queries before saving the offline application', () => {
  const description = 'Each model in this unit is equipped with a boltgun and close combat weapon. '.repeat(10)
  const construction = {
    version: 1 as const,
    revision: 'base',
    files,
    datacards: {},
    mfm: null,
    rules: {},
    editions: [{ base: true as const, version: 1 as const, revision: 'current', edition }],
  }
  const queries = [
    { key: ['rule-section', 'core', 'moving'], data: description },
    { key: ['rule-section', 'core', 'shooting'], data: description },
  ]
  const encoded = encodeReferenceBundle({ queries, search, construction })
  const wire = JSON.parse(gunzipSync(encoded.compressed).toString())
  expect({ texts: wire.texts, decoded: decodeReferenceBundle(wire) }).toEqual({
    texts: [description],
    decoded: {
      version: 1,
      revision: encoded.revision,
      queries,
      search,
      construction: { ...construction, shared: true, texts: [description] },
    },
  })
})

it.each([true, false])('restores shared edition descriptions before validating construction (base: %s)', (base) => {
  const description =
    'These rules retain the published Space Marines codex and its original source identifiers for saved armies and offline reference.'
  const source = { version: 1 as const, revision: 'current', files, datacards: {}, mfm: null, rules: {} }
  const selected = { ...edition, description }
  const construction = {
    ...source,
    editions: [
      base ? { base: true as const, version: 1 as const, revision: 'current', edition: selected } : { ...source, edition: selected },
    ],
  }
  const encoded = encodeReferenceBundle({ queries: [{ key: ['rule-section', 'core', 'moving'], data: selected }], search, construction })
  const wire = JSON.parse(gunzipSync(encoded.compressed).toString())
  expect((decodeReferenceBundle(wire) as { construction: typeof construction }).construction.editions[0]?.edition).toEqual(selected)
})

it.each([null, 1, 'invalid', { base: false }, { base: true, version: 1, revision: 'current', edition: {} }])(
  'refuses a malformed edition %j without throwing',
  (invalid) => {
    expect(
      isReferenceBundle({
        version: 1,
        revision: 'base',
        queries: [],
        search,
        construction: {
          version: 1,
          revision: 'base',
          files,
          datacards: {},
          mfm: null,
          rules: {},
          editions: [invalid],
        },
      }),
    ).toBe(false)
  },
)

it('shares repeated prose in a reference published without construction data', () => {
  const description = 'Each model in this unit is equipped with a boltgun and close combat weapon. '.repeat(10)
  const queries = [
    { key: ['rule-section', 'core', 'moving'], data: description },
    { key: ['rule-section', 'core', 'shooting'], data: description },
  ]
  const encoded = encodeReferenceBundle({ queries, search })
  const wire = JSON.parse(gunzipSync(encoded.compressed).toString())
  expect({ texts: wire.texts, decoded: decodeReferenceBundle(wire) }).toEqual({
    texts: [description],
    decoded: { version: 1, revision: encoded.revision, queries, search, construction: undefined },
  })
})
