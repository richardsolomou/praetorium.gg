import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { installWorkerCatalogueAssets } from './installWorkerCatalogueAssets'

const snapshotId = 'a'.repeat(64)
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'worker-catalogue-assets-'))
  const source = path.join(root, 'source')
  const destination = path.join(root, 'public')
  const entries: Record<string, { sha256: string; bytes: number }> = {}
  for (const name of [
    'sources.json',
    'rules.json',
    'navigation.json',
    'search.json',
    'reference-meta.json',
    'partitions.bin',
    'references.bin',
    'auxiliary.bin',
  ]) {
    const bytes = Buffer.from(`{"name":"${name}"}\n`)
    await mkdir(path.dirname(path.join(source, name)), { recursive: true })
    await writeFile(path.join(source, name), bytes)
    entries[name] = { sha256: sha256(bytes), bytes: bytes.length }
  }
  const auxiliaryRanges = Object.fromEntries(
    [
      'battle-missions.json',
      'battle-read.json',
      'terrain.json',
      'detachments/000000000000000000000000.json',
      'pickers/000000000000000000000000.json',
    ].map((name, index) => [name, { offset: index, bytes: index === 4 ? entries['auxiliary.bin']!.bytes - index : 1, expandedBytes: 1 }]),
  )
  const manifest = Buffer.from(
    `${JSON.stringify({ format: 'praetorium.worker-catalogue.v3', snapshotId, revision: 'test', entries, partitions: { army: { offset: 0, bytes: entries['partitions.bin']!.bytes, expandedBytes: 1 } }, referenceRanges: { 'references/global.json': { offset: 0, bytes: entries['references.bin']!.bytes, expandedBytes: 1 } }, auxiliaryRanges, detachments: { army: 'detachments/000000000000000000000000.json' }, pickers: { army: 'pickers/000000000000000000000000.json' }, terrainMatchups: {} })}\n`,
  )
  await writeFile(path.join(source, 'manifest.json'), manifest)
  return { root, source, destination, manifest, entries }
}

it('installs verified catalogue assets under the manifest version', async () => {
  const { root, source, destination, manifest, entries } = await fixture()
  try {
    const result = await installWorkerCatalogueAssets(source, destination)
    const installed = path.join(destination, '_catalogue', 'snapshots', snapshotId, result.manifestSha256)
    expect({
      hash: result.manifestSha256,
      manifest: await readFile(path.join(installed, 'manifest.json')),
      sources: sha256(await readFile(path.join(installed, 'sources.json'))),
    }).toEqual({ hash: sha256(manifest), manifest, sources: entries['sources.json']!.sha256 })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('rejects changed source bytes before installing the manifest', async () => {
  const { root, source, destination, manifest } = await fixture()
  try {
    await writeFile(path.join(source, 'sources.json'), 'changed')
    await expect(installWorkerCatalogueAssets(source, destination)).rejects.toThrow('Worker catalogue sources.json checksum does not match')
    const installed = path.join(destination, '_catalogue', 'snapshots', snapshotId, sha256(manifest), 'manifest.json')
    await expect(readFile(installed)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
