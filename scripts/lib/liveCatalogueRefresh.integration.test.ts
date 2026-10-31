import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { catalogueSources } from '../../src/server/catalogueSources'
import { readCatalogueComposition } from '../../src/server/catalogueComposition'
import { refreshLiveCatalogue } from './liveCatalogue'
import { prepareLiveRevision } from './liveCatalogueRefresh'

const authoring = 'a'.repeat(64)
const compiler = 'c'.repeat(64)
const configured = readCatalogueComposition(path.resolve('catalogue'))!
// Upstream has moved past the checkout's pins, as it has whenever a release publishes a refreshed catalogue.
const upstream = {
  sources: { ...catalogueSources, definitions: { ...catalogueSources.definitions, revision: 'f'.repeat(40) } },
  composition: configured,
  changed: true,
}

vi.mock('./catalogueUpstream', () => ({ resolveCatalogueUpstream: async () => upstream }))
vi.mock('./catalogueMaterialize', () => ({
  materializeCatalogue: async () => {
    throw new Error('unchanged sources must not be materialized')
  },
}))
vi.mock('../../src/server/catalogueSnapshot', async (actual) => ({
  ...(await actual<typeof import('../../src/server/catalogueSnapshot')>()),
  fetchPinnedSnapshot: async () => {
    throw new Error('a published catalogue must not need the pinned snapshot')
  },
}))
// The catalogue a release's refresh materialized, as `composeCatalogue` records it.
vi.mock('./liveCatalogueArchive', () => ({
  fetchLiveCatalogue: async (_target: string, directory: string) => {
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ definitions: 'f'.repeat(40) }))
    fs.writeFileSync(
      path.join(directory, 'composition.json'),
      `${JSON.stringify({ ...upstream.composition, baseSources: upstream.sources }, null, 2)}\n`,
    )
    return { authoring, sources: 'published' }
  },
}))
vi.mock('./catalogueOutputs', () => ({
  prepareCatalogueOutputs: async (_directory: string, staging: string) => {
    fs.mkdirSync(path.join(staging, 'runtime'), { recursive: true })
    fs.writeFileSync(path.join(staging, 'runtime/manifest.json'), '{}')
    fs.mkdirSync(path.join(staging, 'public'), { recursive: true })
    const manifest = {
      revision: 'a'.repeat(64),
      reference: { core: '/r.bin', search: '/s.bin', parts: {} },
      construction: { catalogue: '/c.bin', rules: '/d.bin', editions: {} },
    }
    fs.writeFileSync(path.join(staging, 'public/offline-reference-version.json'), JSON.stringify(manifest))
    return path.join(staging, 'public')
  },
}))

const directories: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

it('finds unchanged upstream sources unchanged after starting from the published catalogue', async () => {
  vi.stubEnv('R2_ACCOUNT_ID', '0'.repeat(32))
  vi.stubEnv('R2_ACCESS_KEY_ID', 'key')
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret')
  vi.stubEnv('CATALOGUE_DIR', undefined)
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-live-refresh-'))
  directories.push(parent)
  const root = path.join(parent, compiler)
  await refreshLiveCatalogue(root, prepareLiveRevision(root, compiler, { bootstrap: true, archive: { target: 'production', authoring } }))

  expect(await refreshLiveCatalogue(root, prepareLiveRevision(root, compiler))).toBe(false)
})
