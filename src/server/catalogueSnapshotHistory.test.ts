import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { historicalSnapshotSources, installedSnapshot } from './catalogueSnapshot'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

/** An installed snapshot whose revision file names a source this code no longer has. */
function installedWithRetiredSource() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-history-'))
  directories.push(directory)
  fs.mkdirSync(path.join(directory, 'definitions'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'definitions', 'book.json'), '{}')
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ definitions: 'revision', wahapedia: '2026-08-23 pinned pages' }))
  fs.writeFileSync(
    path.join(directory, '.snapshot-manifest.json'),
    JSON.stringify({ format: 'praetorium.catalogue.v3', revisions: {}, sources: ['definitions'], files: {} }),
  )
  fs.writeFileSync(
    path.join(directory, '.snapshot.json'),
    JSON.stringify({ format: 'praetorium.catalogue-pointer.v1', id: 'a'.repeat(64), archiveSha256: 'f'.repeat(64) }),
  )
  return directory
}

it('refuses to serve a snapshot naming a source this code does not know', () => {
  expect(installedSnapshot(installedWithRetiredSource())).toBeNull()
})

it('reads the same snapshot as history, passing over the source nothing reads', () => {
  expect(historicalSnapshotSources(installedWithRetiredSource())).toEqual(['definitions'])
})
