import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { unzipSync, zipSync } from 'fflate'
import {
  activateCachedSnapshot,
  catalogueBaseUrl,
  catalogueUpdateMode,
  distributableCatalogueFile,
  fetchCurrentSnapshot,
  fetchSnapshot,
  installedSnapshot,
  packCatalogueSnapshot,
} from '../src/server/catalogueSnapshot'

const roots: string[] = []
const originalFetch = globalThis.fetch

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  globalThis.fetch = originalFetch
  delete process.env.CATALOGUE_DISABLED_SOURCES
})

function completeCatalogue(root: string) {
  const catalogue = path.join(root, 'catalogue')
  for (const name of ['definitions', 'points', 'rules', 'datacards']) {
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
  fs.writeFileSync(
    path.join(catalogue, 'revision.json'),
    `${JSON.stringify({
      definitions: 'definitions-revision',
      points: 'points-revision',
      rules: 'rules-revision',
      datacards: 'datacards-revision',
      battlemaster: 'battlemaster-revision',
    })}\n`,
  )
  return catalogue
}

it('packs and verifies a complete catalogue', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const catalogue = completeCatalogue(root)
  const archive = path.join(root, 'snapshot.zip')
  const environment = { ...process.env, CATALOGUE_DIR: catalogue, CATALOGUE_SNAPSHOT_FILE: archive }

  execFileSync('pnpm', ['catalogue:snapshot', 'pack'], { env: environment })
  expect(unzipSync(fs.readFileSync(archive))['catalogue/canonical/catalogue.json']).toBeDefined()
  expect(() => execFileSync('pnpm', ['catalogue:snapshot', 'verify'], { env: environment })).not.toThrow()
})

it('rejects a snapshot built for different source pins', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const archive = path.join(root, 'snapshot.zip')
  fs.writeFileSync(archive, new Uint8Array([0, 1, 2]))

  expect(() =>
    execFileSync('pnpm', ['catalogue:snapshot', 'verify'], {
      env: { ...process.env, CATALOGUE_SNAPSHOT_FILE: archive },
      stdio: 'pipe',
    }),
  ).toThrow()
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
})

it('records provenance and omits unused files from a packed snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const catalogue = completeCatalogue(root)
  const archiveFile = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  fs.writeFileSync(path.join(catalogue, 'definitions', 'README.md'), 'not consumed')
  fs.mkdirSync(path.join(catalogue, 'rules', 'data', 'core', '_reports'), { recursive: true })
  fs.writeFileSync(path.join(catalogue, 'rules', 'data', 'core', '_reports', 'report.json'), '{}')

  packCatalogueSnapshot(catalogue, archiveFile, pointerFile)

  const entries = unzipSync(fs.readFileSync(archiveFile))
  expect(entries['catalogue/provenance.json']).toBeDefined()
  expect(entries['catalogue/definitions/README.md']).toBeUndefined()
  expect(entries['catalogue/rules/data/core/_reports/report.json']).toBeUndefined()
})

it('omits a compiled catalogue when one of its source datasets is disabled', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const catalogue = completeCatalogue(root)
  const archiveFile = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  fs.rmSync(path.join(catalogue, 'definitions'), { recursive: true })

  execFileSync('pnpm', ['catalogue:snapshot', 'pack'], {
    env: {
      ...process.env,
      CATALOGUE_DIR: catalogue,
      CATALOGUE_SNAPSHOT_FILE: archiveFile,
      CATALOGUE_SNAPSHOT_POINTER_FILE: pointerFile,
      CATALOGUE_DISABLED_SOURCES: 'definitions',
    },
  })

  expect(unzipSync(fs.readFileSync(archiveFile))['catalogue/canonical/catalogue.json']).toBeUndefined()
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
