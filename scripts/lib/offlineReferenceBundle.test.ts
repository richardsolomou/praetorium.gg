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
  const wire: unknown = JSON.parse(gunzipSync(encoded.compressed).toString())
  expect(JSON.stringify(wire)).toContain('$praetoriumBase')
  expect(isReferenceBundle(wire)).toBe(false)
  expect(decodeReferenceBundle(wire)).toEqual({ version: 1, revision: encoded.revision, ...content })
})
