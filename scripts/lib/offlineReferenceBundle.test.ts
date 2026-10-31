import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { constructionFilesForEdition, encodeOfflinePart, sharedEdition } from './offlineReferenceBundle'
import type { CatalogueFile } from '../../src/core/catalogue'
import { catalogueEditionSchema } from '../../src/core/catalogueEdition'
import { decodeReferencePart, isConstructionData } from '../../src/contracts/offlineReference'
import { constructionSource, loadConstructionData } from '../../src/client/offline/constructionSource'
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
it('uses the published Unix gzip header on every build platform', () => {
  expect(encodeOfflinePart([]).compressed[9]).toBe(3)
})

it('refuses a part larger than a device should decode at once', () => {
  expect(() => encodeOfflinePart('x'.repeat(2_000), 1_000)).toThrow('size limit')
})

it('names a part by its content', () => {
  const part = [{ key: ['rule-section', 'core', 'moving'], data: 'Move six inches' }]
  expect([
    encodeOfflinePart(part).revision === encodeOfflinePart(part).revision,
    encodeOfflinePart([]).revision === encodeOfflinePart(part).revision,
  ]).toEqual([true, false])
})

/** A part as a device decodes it after download. */
const published = (value: unknown) => decodeReferencePart(gunzipSync(encodeOfflinePart(value, Infinity).compressed).toString())

it('restores another rules version’s construction data from its own part and the current rules’ parts', async () => {
  const description = 'Each model in this unit is equipped with a boltgun and close combat weapon. '.repeat(10)
  const base = {
    version: 1 as const,
    revision: 'base',
    files,
    datacards: packRuntimeData(new Map([['army', 'Released']])),
    mfm: null,
    rules: { common: [description] },
  }
  const selected = {
    ...base,
    files: files.slice(0, 4),
    revision: 'preview',
    edition,
    datacards: packRuntimeData(new Map([['army', 'Preview']])),
    rules: { common: [description, description] },
  }
  const { rules, ...catalogue } = base
  const parts: Record<string, unknown> = {
    catalogue: published({ ...catalogue, editions: [] }),
    rules: published({ revision: base.revision, rules }),
    preview: published(sharedEdition(selected, base)),
  }
  const data = await loadConstructionData(
    { catalogue: 'catalogue', rules: 'rules', editions: { preview: 'preview' } },
    'preview~army',
    async (asset) => parts[asset],
  )
  expect({ shared: JSON.stringify(parts.preview).includes('$praetoriumBase'), restored: constructionSource(data, 'preview~army') }).toEqual(
    {
      shared: true,
      restored: selected,
    },
  )
})

it.each([null, 1, 'invalid', { base: false }, { base: true, version: 1, revision: 'current', edition: {} }])(
  'refuses a malformed edition %j without throwing',
  (invalid) => {
    expect(
      isConstructionData({ version: 1, revision: 'base', files, datacards: {}, mfm: null, rules: {}, editions: [invalid as never] }),
    ).toBe(false)
  },
)
