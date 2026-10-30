import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { unzipSync, zipSync } from 'fflate'
import { catalogueSources } from '../src/server/catalogueSources'
import {
  activateCachedSnapshot,
  catalogueBaseUrl,
  catalogueUpdateMode,
  distributableCatalogueFile,
  fetchCurrentSnapshot,
  fetchSnapshot,
  installedSnapshot,
  installSnapshotArchive,
  packCatalogueSnapshot,
  verifyInstalledSnapshot,
  verifySnapshotArchive,
  fetchCurrentPointer,
} from '../src/server/catalogueSnapshot'

function snapshotEntries(bytes: Uint8Array) {
  const entries = unzipSync(bytes)
  const manifest = JSON.parse(Buffer.from(entries['manifest.json']!).toString('utf8')) as { format: string; files: Record<string, string> }
  if (manifest.format === 'praetorium.catalogue.v4') {
    for (const [name, hash] of Object.entries(manifest.files)) entries[`catalogue/${name}`] = entries[`objects/${hash}`]!
  }
  return entries
}

const roots: string[] = []
const originalFetch = globalThis.fetch

afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  globalThis.fetch = originalFetch
  delete process.env.CATALOGUE_DISABLED_SOURCES
})

function completeCatalogue(root: string) {
  const catalogue = path.join(root, 'catalogue')
  for (const name of ['definitions', 'points', 'datacards']) {
    fs.mkdirSync(path.join(catalogue, name), { recursive: true })
    fs.writeFileSync(path.join(catalogue, name, 'test.json'), '{"catalogue":true}\n')
  }
  fs.writeFileSync(path.join(catalogue, 'definitions', 'test.json'), '{"catalogue":{"id":"cat","name":"Test"}}\n')
  fs.writeFileSync(
    path.join(catalogue, 'definitions', 'system.json'),
    '{"gameSystem":{"id":"gs","name":"Test","costTypes":[{"id":"pts","name":"pts"}]}}\n',
  )
  fs.mkdirSync(path.join(catalogue, 'battlemaster', 'layouts'), { recursive: true })
  fs.writeFileSync(path.join(catalogue, 'battlemaster', 'layouts', 'test.json'), '{}\n')
  fs.mkdirSync(path.join(catalogue, 'icons'), { recursive: true })
  fs.writeFileSync(path.join(catalogue, 'icons', 'test.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n')
  fs.writeFileSync(
    path.join(catalogue, 'revision.json'),
    `${JSON.stringify({
      definitions: 'definitions-revision',
      points: 'points-revision',
      datacards: 'datacards-revision',
      battlemaster: 'battlemaster-revision',
      icons: 'icons-revision',
    })}\n`,
  )
  return catalogue
}

it('assigns distinct immutable release IDs to identical sources from different authoring commits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-authoring-release-'))
  roots.push(root)
  const source = completeCatalogue(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = path.join(root, 'pointer.json')
  const first = packCatalogueSnapshot(source, archive, pointer, undefined, 'a'.repeat(40))
  const second = packCatalogueSnapshot(source, archive, pointer, undefined, 'b'.repeat(40))
  expect(second.id).not.toBe(first.id)
})

it('repeats the same release ID for the same sources and authoring commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-authoring-repeat-'))
  roots.push(root)
  const source = completeCatalogue(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = path.join(root, 'pointer.json')
  const first = packCatalogueSnapshot(source, archive, pointer, undefined, 'a'.repeat(40))
  expect(packCatalogueSnapshot(source, archive, pointer, undefined, 'a'.repeat(40))).toEqual(first)
})

it('pins an older source release in the application lock', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-authoring-pin-'))
  roots.push(root)
  const source = completeCatalogue(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = path.join(root, 'pointer.json')
  const release = packCatalogueSnapshot(source, archive, pointer, undefined, 'a'.repeat(40))
  const application = path.join(root, 'application')
  fs.mkdirSync(path.join(application, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(application, 'package.json'), '{"type":"module"}')
  fs.copyFileSync(path.join(import.meta.dirname, 'catalogueSnapshot.ts'), path.join(application, 'scripts/catalogueSnapshot.ts'))
  fs.symlinkSync(path.join(import.meta.dirname, 'lib'), path.join(application, 'scripts/lib'))
  fs.symlinkSync(path.join(import.meta.dirname, '../src'), path.join(application, 'src'))
  fs.copyFileSync(path.join(import.meta.dirname, '../catalogue.json'), path.join(application, 'catalogue.json'))
  const preload = path.join(root, 'fetch.mjs')
  fs.writeFileSync(
    preload,
    `import fs from 'node:fs';
globalThis.fetch = async (url) => new Response(fs.readFileSync(String(url).endsWith('.zip') ? process.env.TEST_ARCHIVE : process.env.TEST_POINTER));`,
  )

  execFileSync(
    process.execPath,
    [
      '--import',
      import.meta.resolve('tsx'),
      '--import',
      preload,
      path.join(application, 'scripts/catalogueSnapshot.ts'),
      'lock',
      release.id,
    ],
    { env: { ...process.env, CATALOGUE_BASE_URL: 'https://catalogue.test', TEST_ARCHIVE: archive, TEST_POINTER: pointer } },
  )

  expect(JSON.parse(fs.readFileSync(path.join(application, 'catalogue.json'), 'utf8')).pointer.id).toBe(release.id)
})

it('rejects a release descriptor that substitutes a different authoring commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-authoring-mismatch-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archive, path.join(root, 'pointer.json'), undefined, 'a'.repeat(40))
  expect(() =>
    installSnapshotArchive(path.join(root, 'installed'), archive, { ...pointer, authoringRevision: 'b'.repeat(40) }, null),
  ).toThrow('authoring revision does not match')
})

it('packs and verifies a complete catalogue', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const catalogue = completeCatalogue(root)
  const archive = path.join(root, 'snapshot.zip')
  const environment = {
    ...process.env,
    CATALOGUE_DIR: catalogue,
    CATALOGUE_SNAPSHOT_FILE: archive,
    CATALOGUE_AUTHORING_REVISION: 'a'.repeat(40),
  }

  execFileSync('pnpm', ['catalogue:snapshot', 'pack'], { env: environment })
  expect(snapshotEntries(fs.readFileSync(archive))['catalogue/canonical/catalogue.json']).toBeDefined()
  expect(() => execFileSync('pnpm', ['catalogue:snapshot', 'verify'], { env: environment })).not.toThrow()
})

it('attributes retained source data to its authored original repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const directory = completeCatalogue(root)
  fs.writeFileSync(
    path.join(directory, 'composition.json'),
    JSON.stringify({
      format: 'praetorium.catalogue-composition.v1',
      overlays: [],
      editions: [],
      baseSources: { ...catalogueSources, definitions: { ...catalogueSources.definitions, repository: 'original/rules' } },
    }),
  )
  const archive = path.join(root, 'snapshot.zip')
  packCatalogueSnapshot(directory, archive, path.join(root, 'pointer.json'))
  const provenance = JSON.parse(new TextDecoder().decode(snapshotEntries(fs.readFileSync(archive))['catalogue/provenance.json']))
  expect(provenance.sources.find((source: { name: string }) => source.name === 'definitions').origin).toBe(
    'https://github.com/original/rules',
  )
})

it('installs a published snapshot using its explicit pointer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archive, pointerFile)
  const destination = path.join(root, 'installed')

  execFileSync('pnpm', ['catalogue:snapshot', 'install'], {
    env: {
      ...process.env,
      CATALOGUE_DIR: destination,
      CATALOGUE_SNAPSHOT_FILE: archive,
      CATALOGUE_SNAPSHOT_POINTER_FILE: pointerFile,
    },
  })

  expect(installedSnapshot(destination)).toEqual(pointer)
})

it('rejects a changed file in an installed snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const source = completeCatalogue(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  const pointer = packCatalogueSnapshot(source, archive, pointerFile)
  const destination = path.join(root, 'installed')
  for (const [name, bytes] of Object.entries(snapshotEntries(fs.readFileSync(archive)))) {
    if (!name.startsWith('catalogue/')) continue
    const file = path.join(destination, name.slice('catalogue/'.length))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, bytes)
  }
  fs.writeFileSync(path.join(destination, '.snapshot.json'), JSON.stringify(pointer))
  fs.writeFileSync(path.join(destination, '.snapshot-manifest.json'), snapshotEntries(fs.readFileSync(archive))['manifest.json']!)
  expect(verifyInstalledSnapshot(destination).id).toBe(installedSnapshot(destination)?.id)
  fs.writeFileSync(path.join(destination, 'definitions', 'test.json'), '{"catalogue":false}\n')
  expect(() => verifyInstalledSnapshot(destination)).toThrow('catalogue snapshot has an invalid definitions/test.json')
})

it('rejects an archive that does not match its pointer', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  const catalogue = completeCatalogue(root)
  packCatalogueSnapshot(catalogue, archive, pointerFile)
  fs.writeFileSync(path.join(catalogue, 'points', 'test.json'), '{"catalogue":"changed"}\n')
  packCatalogueSnapshot(catalogue, archive, path.join(root, 'other-pointer.json'))

  expect(() => verifySnapshotArchive(archive, pointerFile)).toThrow('catalogue snapshot archive checksum does not match')
})

it('installs the previous snapshot format during the source rollout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const files = {
    'revision.json': JSON.stringify({
      definitions: 'definitions-revision',
      points: 'points-revision',
      rules: 'rules-revision',
      battlemaster: 'battlemaster-revision',
    }),
    'definitions/test.json': '{}',
    'points/test.json': '{}',
    'rules/test.json': '{}',
    'battlemaster/layouts/test.json': '{}',
  }
  const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex')
  const manifest = new TextEncoder().encode(
    JSON.stringify({
      format: 'praetorium.catalogue.v1',
      revisions: JSON.parse(files['revision.json']),
      files: Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, sha256(contents)])),
    }),
  )
  const archive = zipSync({
    'manifest.json': manifest,
    ...Object.fromEntries(Object.entries(files).map(([name, contents]) => [`catalogue/${name}`, new TextEncoder().encode(contents)])),
  })
  const pointer = { format: 'praetorium.catalogue-pointer.v1', id: sha256(manifest), archiveSha256: sha256(archive) }
  globalThis.fetch = async (url) => {
    const requestUrl = url instanceof Request ? url.url : url.toString()
    if (requestUrl.endsWith('/revocations.json')) return new Response('', { status: 404 })
    return new Response(requestUrl.endsWith('/current.json') ? JSON.stringify(pointer) : archive)
  }

  await expect(fetchCurrentSnapshot(path.join(root, 'catalogue'), 'https://example.test')).resolves.toBe(true)
})

it('omits source paths that no product or catalogue check reads', () => {
  expect(distributableCatalogueFile('definitions/Space Marines.json')).toBe(true)
  expect(distributableCatalogueFile('definitions/README.md')).toBe(false)
  expect(distributableCatalogueFile('rules/data/core/_reports/report.json')).toBe(false)
  expect(distributableCatalogueFile('datacards/11th/gdc/combatpatrol/aeldari.json')).toBe(false)
  expect(distributableCatalogueFile('datacards/11th/gdc/core/core_rules.json')).toBe(true)
  expect(distributableCatalogueFile('datacards/11th/gdc/kotc.json')).toBe(true)
})

it('omits unused files from a packed snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const catalogue = completeCatalogue(root)
  const archiveFile = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  fs.writeFileSync(path.join(catalogue, 'definitions', 'README.md'), 'not consumed')
  fs.mkdirSync(path.join(catalogue, 'rules', 'data', 'core', '_reports'), { recursive: true })
  fs.writeFileSync(path.join(catalogue, 'rules', 'data', 'core', '_reports', 'report.json'), '{}')

  packCatalogueSnapshot(catalogue, archiveFile, pointerFile)

  const entries = snapshotEntries(fs.readFileSync(archiveFile))
  expect(entries['catalogue/definitions/README.md']).toBeUndefined()
  expect(entries['catalogue/rules/data/core/_reports/report.json']).toBeUndefined()
})

it('packs the data-update history and hashes it in the manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const catalogue = completeCatalogue(root)
  const archiveFile = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  const history = '{"format":"praetorium.catalogue-history.v1","entries":[]}\n'
  fs.mkdirSync(path.join(catalogue, 'changes'))
  fs.writeFileSync(path.join(catalogue, 'changes', 'history.json'), history)

  packCatalogueSnapshot(catalogue, archiveFile, pointerFile)

  const entries = snapshotEntries(fs.readFileSync(archiveFile))
  const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json'])) as { files: Record<string, string> }
  expect(manifest.files['changes/history.json']).toBe(createHash('sha256').update(history).digest('hex'))
})

it.each(['definitions', 'datacards'] as const)('does not compile or pack a canonical catalogue without %s', (source) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const catalogue = completeCatalogue(root)
  const archiveFile = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  fs.mkdirSync(path.join(catalogue, 'canonical'))
  fs.writeFileSync(path.join(catalogue, 'canonical', 'catalogue.json'), '{"stale":true}\n')
  fs.rmSync(path.join(catalogue, source), { recursive: true })

  execFileSync('pnpm', ['catalogue:snapshot', 'pack'], {
    env: {
      ...process.env,
      CATALOGUE_DIR: catalogue,
      CATALOGUE_SNAPSHOT_FILE: archiveFile,
      CATALOGUE_SNAPSHOT_POINTER_FILE: pointerFile,
      CATALOGUE_DISABLED_SOURCES: source,
      CATALOGUE_AUTHORING_REVISION: 'a'.repeat(40),
    },
  })

  expect(fs.existsSync(path.join(catalogue, 'canonical', 'catalogue.json'))).toBe(false)
  expect(snapshotEntries(fs.readFileSync(archiveFile))['catalogue/canonical/catalogue.json']).toBeUndefined()
})

it('refuses a revoked snapshot before installing it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const archiveFile = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archiveFile, pointerFile)
  const archive = fs.readFileSync(archiveFile)
  globalThis.fetch = async () => new Response(archive)

  const target = path.join(root, 'installed')
  await expect(
    fetchSnapshot(target, 'https://example.test', pointer, undefined, {
      revocations: { format: 'praetorium.catalogue-revocations.v1', snapshots: [pointer.id], sources: [] },
    }),
  ).rejects.toThrow(/revoked/)
  expect(fs.existsSync(target)).toBe(false)
})

it('activates one immutable cached snapshot for a worktree', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const archiveFile = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archiveFile, pointerFile)
  const archive = fs.readFileSync(archiveFile)
  globalThis.fetch = async () => new Response(archive)
  const cached = path.join(root, 'cache', pointer.id)
  await fetchSnapshot(cached, 'https://example.test', pointer)

  const active = path.join(root, 'worktree', 'catalogue-data')
  activateCachedSnapshot(active, cached)

  expect(fs.lstatSync(active).isSymbolicLink()).toBe(true)
  expect(installedSnapshot(active)?.id).toBe(pointer.id)
})

it('reuses a cached private snapshot without credentials or network access', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-cached-private-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archive, path.join(root, 'pointer.json'))
  const cached = path.join(root, 'cached')
  installSnapshotArchive(cached, archive, pointer, null)
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) vi.stubEnv(name, undefined)
  globalThis.fetch = async () => {
    throw new Error('cached snapshots must not make network requests')
  }

  await expect(fetchSnapshot(cached, 'r2://praetorium-private/catalogue', pointer)).resolves.toBe(false)
})

it('validates catalogue update modes', () => {
  expect(catalogueUpdateMode()).toBe('latest')
  expect(catalogueUpdateMode('pinned')).toBe('pinned')
  expect(catalogueUpdateMode('off')).toBe('off')
  expect(() => catalogueUpdateMode('sometimes')).toThrow(/must be latest, pinned, or off/)
})

it('normalizes an explicit catalogue mirror independently of object storage', () => {
  expect(catalogueBaseUrl('https://catalogue.example.test/')).toBe('https://catalogue.example.test')
})

it('refuses a latest snapshot when the withdrawal policy is invalid', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  globalThis.fetch = async () => new Response('{}')

  await expect(fetchCurrentSnapshot(path.join(root, 'catalogue'), 'https://example.test')).rejects.toThrow(
    /catalogue revocations are invalid/,
  )
})

it('stores duplicate content once and shares its installed disk blocks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-dedup-'))
  roots.push(root)
  const source = completeCatalogue(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(source, archive, path.join(root, 'pointer.json'))
  const entries = unzipSync(fs.readFileSync(archive))
  const duplicateHash = createHash('sha256').update('{"catalogue":true}\n').digest('hex')
  expect(Object.keys(entries).filter((name) => name === `objects/${duplicateHash}`)).toHaveLength(1)
  const installed = path.join(root, 'installed')
  installSnapshotArchive(installed, archive, pointer, null)
  expect(fs.statSync(path.join(installed, 'points/test.json')).ino).toBe(fs.statSync(path.join(installed, 'datacards/test.json')).ino)
  expect(verifyInstalledSnapshot(installed)).toEqual(pointer)
})

it('preserves a ZIP header spanning input chunks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-stream-chunks-'))
  roots.push(root)
  const source = completeCatalogue(root)
  const content = Buffer.alloc(65536 - 102 - 10, ' ')
  content[0] = 34
  content[content.length - 1] = 34
  fs.writeFileSync(path.join(source, 'datacards/padding.json'), content)
  fs.writeFileSync(path.join(source, 'datacards/suffix.json'), JSON.stringify(' '.repeat(70000)))
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(source, archive, path.join(root, 'pointer.json'))
  const entries = unzipSync(fs.readFileSync(archive))
  const first = `objects/${createHash('sha256').update(content).digest('hex')}`
  const ordered = { [first]: entries[first]!, ...entries }
  const bytes = zipSync(ordered, { level: 0 })
  fs.writeFileSync(archive, bytes)
  const installed = path.join(root, 'installed')
  installSnapshotArchive(installed, archive, { ...pointer, archiveSha256: createHash('sha256').update(bytes).digest('hex') }, null)
  expect(fs.readFileSync(path.join(installed, 'datacards/padding.json'))).toEqual(content)
})

it('reads the private bucket with signed requests', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-private-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archive, path.join(root, 'pointer.json'))
  vi.stubEnv('R2_ACCOUNT_ID', 'a'.repeat(32))
  vi.stubEnv('R2_ACCESS_KEY_ID', 'key')
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret')
  const requests: { url: string; signed: boolean }[] = []
  globalThis.fetch = async (input, init) => {
    requests.push({ url: input instanceof Request ? input.url : input.toString(), signed: new Headers(init?.headers).has('authorization') })
    return new Response(fs.readFileSync(archive))
  }
  await fetchSnapshot(path.join(root, 'installed'), 'r2://praetorium-private/catalogue', pointer)
  expect(requests).toEqual([
    { url: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/praetorium-private/catalogue/snapshots/${pointer.id}.zip`, signed: true },
  ])
})

it('refuses to read the private bucket without its credentials', async () => {
  vi.stubEnv('R2_ACCOUNT_ID', '')
  vi.stubEnv('R2_ACCESS_KEY_ID', '')
  vi.stubEnv('R2_SECRET_ACCESS_KEY', '')
  await expect(fetchCurrentPointer('r2://praetorium-private/catalogue')).rejects.toThrow(/Catalogue snapshots are private/)
})

it('downloads the archive again when the connection drops mid-body', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-dropped-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archive, path.join(root, 'pointer.json'))
  let attempts = 0
  globalThis.fetch = async () => {
    attempts += 1
    if (attempts > 1) return new Response(fs.readFileSync(archive))
    const bytes = fs.readFileSync(archive)
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 64))
        controller.error(new TypeError('terminated'))
      },
    })
    return new Response(body)
  }
  const installed = path.join(root, 'installed')
  await fetchSnapshot(installed, 'https://r2.example.test', pointer)
  expect(verifyInstalledSnapshot(installed)).toEqual(pointer)
})

it('downloads the archive again when its body stalls past the request timeout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-stalled-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archive, path.join(root, 'pointer.json'))
  let attempts = 0
  globalThis.fetch = async () => {
    attempts += 1
    if (attempts > 1) return new Response(fs.readFileSync(archive))
    const body = new ReadableStream({
      start(controller) {
        controller.error(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
      },
    })
    return new Response(body)
  }
  const installed = path.join(root, 'installed')
  await fetchSnapshot(installed, 'https://r2.example.test', pointer)
  expect(verifyInstalledSnapshot(installed)).toEqual(pointer)
})

it('does not hide checksum failures by trying a different mirror', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-corrupt-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archive, path.join(root, 'pointer.json'))
  const requests: string[] = []
  globalThis.fetch = async (input) => {
    requests.push(input instanceof Request ? input.url : input.toString())
    return new Response(fs.readFileSync(archive))
  }
  await expect(
    fetchSnapshot(path.join(root, 'installed'), 'https://r2.example.test', { ...pointer, archiveSha256: '0'.repeat(64) }),
  ).rejects.toThrow('checksum')
  expect(requests).toHaveLength(1)
})

it('leaves an installed snapshot intact when a replacement is corrupt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-replace-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archive, path.join(root, 'pointer.json'))
  const installed = path.join(root, 'installed')
  installSnapshotArchive(installed, archive, pointer, null)
  globalThis.fetch = async () => new Response(fs.readFileSync(archive))
  await expect(fetchSnapshot(installed, 'https://r2.example.test', { ...pointer, id: '0'.repeat(64) })).rejects.toThrow('manifest')
  expect(verifyInstalledSnapshot(installed)).toEqual(pointer)
})

it('rejects traversal paths even when the manifest and archive hashes match', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-path-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archive, path.join(root, 'pointer.json'))
  const entries = unzipSync(fs.readFileSync(archive))
  const manifest = JSON.parse(Buffer.from(entries['manifest.json']!).toString('utf8'))
  manifest.files['../escape.json'] = manifest.files['points/test.json']
  entries['manifest.json'] = Buffer.from(JSON.stringify(manifest))
  const changed = zipSync(entries)
  fs.writeFileSync(archive, changed)
  expect(() =>
    installSnapshotArchive(
      path.join(root, 'installed'),
      archive,
      {
        ...pointer,
        id: createHash('sha256').update(entries['manifest.json']!).digest('hex'),
        archiveSha256: createHash('sha256').update(changed).digest('hex'),
      },
      null,
    ),
  ).toThrow('unsafe')
})

it('downloads only missing content when another snapshot is installed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-incremental-'))
  roots.push(root)
  const source = completeCatalogue(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  const prior = packCatalogueSnapshot(source, archive, pointerFile)
  const installed = path.join(root, 'installed')
  installSnapshotArchive(installed, archive, prior, null)
  fs.writeFileSync(path.join(source, 'points/test.json'), '{"changed":true}')
  const objects = path.join(root, 'objects')
  const next = packCatalogueSnapshot(source, archive, pointerFile, objects)
  const requests: string[] = []
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : input.toString()
    requests.push(url)
    const file = url.endsWith('.json') ? path.join(objects, 'manifest.json') : path.join(objects, url.split('/').at(-1)!)
    return new Response(fs.readFileSync(file))
  }
  await fetchSnapshot(installed, 'https://r2.example.test', next)
  expect(requests.filter((url) => url.endsWith('.gz'))).toHaveLength(1)
  expect(verifyInstalledSnapshot(installed)).toEqual(next)
})

it('falls back to an archive when the object pool is unavailable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-pool-fallback-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointer = packCatalogueSnapshot(completeCatalogue(root), archive, path.join(root, 'pointer.json'))
  fs.mkdirSync(path.join(root, '.catalogue-objects'))
  globalThis.fetch = async (input) =>
    (input instanceof Request ? input.url : input.toString()).endsWith('.zip')
      ? new Response(fs.readFileSync(archive))
      : new Response('', { status: 404 })
  const installed = path.join(root, 'installed')
  await fetchSnapshot(installed, 'https://r2.example.test', pointer)
  expect(verifyInstalledSnapshot(installed)).toEqual(pointer)
})

it('keeps the old snapshot when a downloaded shared object has the wrong hash', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-pool-corrupt-'))
  roots.push(root)
  const source = completeCatalogue(root)
  const archive = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  const prior = packCatalogueSnapshot(source, archive, pointerFile)
  const installed = path.join(root, 'installed')
  installSnapshotArchive(installed, archive, prior, null)
  fs.writeFileSync(path.join(source, 'points/test.json'), '{"changed":true}')
  const objects = path.join(root, 'objects')
  const next = packCatalogueSnapshot(source, archive, pointerFile, objects)
  const wrong = fs.readFileSync(path.join(objects, createHash('sha256').update('{"catalogue":true}\n').digest('hex') + '.gz'))
  globalThis.fetch = async (input) =>
    new Response(
      (input instanceof Request ? input.url : input.toString()).endsWith('.json')
        ? fs.readFileSync(path.join(objects, 'manifest.json'))
        : wrong,
    )
  await expect(fetchSnapshot(installed, 'https://r2.example.test', next)).rejects.toThrow('object checksum')
  expect(verifyInstalledSnapshot(installed)).toEqual(prior)
})
