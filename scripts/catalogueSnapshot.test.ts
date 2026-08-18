import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { fetchCurrentSnapshot } from '../src/server/catalogueSnapshot'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

it('packs and verifies a complete catalogue', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-snapshot-'))
  roots.push(root)
  const catalogue = path.join(root, 'catalogue')
  const archive = path.join(root, 'snapshot.zip')
  for (const name of ['definitions', 'points', 'rules', 'datacards']) {
    fs.mkdirSync(path.join(catalogue, name), { recursive: true })
    fs.writeFileSync(path.join(catalogue, name, 'test.json'), '{"catalogue":true}\n')
  }
  fs.mkdirSync(path.join(catalogue, 'battlemaster', 'layouts'), { recursive: true })
  fs.writeFileSync(path.join(catalogue, 'battlemaster', 'layouts', 'test.json'), '{}\n')
  fs.mkdirSync(path.join(catalogue, 'wahapedia', 'pages'), { recursive: true })
  fs.writeFileSync(path.join(catalogue, 'wahapedia', 'test.csv'), 'test\n')
  fs.writeFileSync(
    path.join(catalogue, 'revision.json'),
    `${JSON.stringify({
      definitions: 'definitions-revision',
      points: 'points-revision',
      rules: 'rules-revision',
      datacards: 'datacards-revision',
      battlemaster: 'battlemaster-revision',
      wahapedia: 'wahapedia-revision',
    })}\n`,
  )
  const environment = { ...process.env, CATALOGUE_DIR: catalogue, CATALOGUE_SNAPSHOT_FILE: archive }

  execFileSync('pnpm', ['catalogue:snapshot', 'pack'], { env: environment })
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
      wahapedia: 'wahapedia-revision',
    }),
    'definitions/test.json': '{}',
    'points/test.json': '{}',
    'rules/test.json': '{}',
    'battlemaster/layouts/test.json': '{}',
    'wahapedia/test.csv': 'test',
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
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const requestUrl = url instanceof Request ? url.url : url.toString()
    return new Response(requestUrl.endsWith('/current.json') ? JSON.stringify(pointer) : archive)
  }

  try {
    await expect(fetchCurrentSnapshot(path.join(root, 'catalogue'), 'https://example.test')).resolves.toBe(true)
  } finally {
    globalThis.fetch = originalFetch
  }
})
