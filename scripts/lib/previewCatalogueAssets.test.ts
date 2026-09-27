import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { verifyPreviewCatalogueAssets } from './previewCatalogueAssets'

const roots: string[] = []
const snapshotId = 'a'.repeat(64)
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'praetorium-preview-assets-'))
  roots.push(root)
  const bytes = Buffer.from('{}\n')
  const manifest = {
    format: 'praetorium.worker-catalogue.v3',
    snapshotId,
    revision: 'test',
    entries: {
      'sources.json': { sha256: sha256(bytes), bytes: bytes.length },
      'partitions.bin': { sha256: sha256(bytes), bytes: bytes.length },
      'references.bin': { sha256: sha256(bytes), bytes: bytes.length },
      'auxiliary.bin': { sha256: sha256(bytes), bytes: bytes.length },
    },
    referenceRanges: { 'references/global.json': { offset: 0, bytes: bytes.length, expandedBytes: 1 } },
    auxiliaryRanges: { 'battle-missions.json': { offset: 0, bytes: bytes.length, expandedBytes: 1 } },
    detachments: {},
    pickers: {},
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`)
  const manifestSha256 = sha256(manifestBytes)
  const assets = path.join(root, 'assets', '_catalogue', 'snapshots', snapshotId, manifestSha256)
  await mkdir(assets, { recursive: true })
  await writeFile(
    path.join(root, 'catalogue-lock.json'),
    `${JSON.stringify({
      format: 'praetorium.catalogue-lock.v1',
      pointer: { format: 'praetorium.catalogue-pointer.v1', id: snapshotId, archiveSha256: 'b'.repeat(64) },
      revisions: {},
    })}\n`,
  )
  await writeFile(path.join(root, 'catalogue-manifest.json'), manifestBytes)
  await writeFile(path.join(assets, 'manifest.json'), manifestBytes)
  await writeFile(path.join(assets, 'sources.json'), bytes)
  await writeFile(path.join(assets, 'partitions.bin'), bytes)
  await writeFile(path.join(assets, 'references.bin'), bytes)
  await writeFile(path.join(assets, 'auxiliary.bin'), bytes)
  return { root, assets, manifest, manifestSha256 }
}

it('accepts a checked catalogue artifact pinned by the PR', async () => {
  const { root, manifestSha256 } = await fixture()
  await expect(verifyPreviewCatalogueAssets(root)).resolves.toEqual({ snapshotId, manifestSha256 })
})

it('rejects assets compiled from a different catalogue snapshot', async () => {
  const { root } = await fixture()
  await writeFile(
    path.join(root, 'catalogue-lock.json'),
    `${JSON.stringify({
      format: 'praetorium.catalogue-lock.v1',
      pointer: { format: 'praetorium.catalogue-pointer.v1', id: 'c'.repeat(64), archiveSha256: 'b'.repeat(64) },
      revisions: {},
    })}\n`,
  )
  await expect(verifyPreviewCatalogueAssets(root)).rejects.toThrow('snapshot')
})

it('rejects a changed catalogue asset', async () => {
  const { root, assets } = await fixture()
  await writeFile(path.join(assets, 'sources.json'), '{} ')
  await expect(verifyPreviewCatalogueAssets(root)).rejects.toThrow('checksum')
})

it('rejects an unlisted catalogue asset', async () => {
  const { root, assets } = await fixture()
  await writeFile(path.join(assets, 'extra.json'), '{}')
  await expect(verifyPreviewCatalogueAssets(root)).rejects.toThrow('unlisted')
})

it('rejects an unsafe catalogue asset path', async () => {
  const { root, manifest } = await fixture()
  Object.assign(manifest.entries, { '../outside.json': { sha256: 'c'.repeat(64), bytes: 2 } })
  await writeFile(path.join(root, 'catalogue-manifest.json'), `${JSON.stringify(manifest)}\n`)
  await expect(verifyPreviewCatalogueAssets(root)).rejects.toThrow('path')
})
