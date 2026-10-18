import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import {
  catalogueBaseUrl,
  catalogueLock,
  downloadSnapshotArchive,
  fetchCurrentSnapshot,
  fetchReleasePointer,
  fetchSnapshot,
  readSnapshotPointer,
  installSnapshotArchive,
  installedSnapshot,
  packCatalogueSnapshot,
  verifySnapshotArchive,
} from '../src/server/catalogueSnapshot'
import { canonicalCataloguePath, editionCanonicalCataloguesPath, writeCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { writeEditionCanonicalCatalogues } from '../src/server/catalogueEditions'
import { canCompileCanonicalCatalogue } from '../src/server/canonicalCatalogueSources'
import { disabledCatalogueSources } from '../src/server/catalogueSources'
import releaseLock from '../catalogue.json' with { type: 'json' }
import { catalogueTree } from './lib/catalogueTree'
import { catalogueDataDirectory } from './lib/catalogueFiles'

const root = path.join(import.meta.dirname, '..')
const directory = catalogueDataDirectory()
const archive = process.env.CATALOGUE_SNAPSHOT_FILE ?? path.join(root, 'catalogue-snapshot.zip')
const pointer = process.env.CATALOGUE_SNAPSHOT_POINTER_FILE ?? path.join(root, 'catalogue-current.json')
const lock = path.join(root, 'catalogue.json')
const command = process.argv[2]

if (command === 'pack') {
  const disabled = disabledCatalogueSources()
  if (canCompileCanonicalCatalogue(disabled)) {
    const catalogue = writeCanonicalCatalogue(directory)
    console.log(`canonical catalogue: ${catalogue.datasheets.length} datasheets, ${catalogue.issues.length} audit issues`)
    console.log(`edition catalogues: ${writeEditionCanonicalCatalogues(directory, catalogue)}`)
  } else {
    fs.rmSync(canonicalCataloguePath(directory), { force: true })
    fs.rmSync(editionCanonicalCataloguesPath(directory), { force: true })
  }
  const authoringRevision = process.env.CATALOGUE_AUTHORING_REVISION ?? catalogueTree(root)
  if (!/^[a-f0-9]{40}$/.test(authoringRevision)) throw new Error('Catalogue authoring revision must be a full Git object ID')
  const packed = packCatalogueSnapshot(directory, archive, pointer, process.env.CATALOGUE_OBJECTS_DIR, authoringRevision)
  console.log(`${packed.id} ${archive}`)
} else if (command === 'verify') {
  verifySnapshotArchive(archive, pointer)
} else if (command === 'fetch') {
  await fetchCurrentSnapshot(directory, catalogueBaseUrl(), (message) => console.log(message))
} else if (command === 'download') {
  await downloadSnapshotArchive(archive, catalogueBaseUrl())
  console.log(`${catalogueLock.pointer.id} ${archive}`)
} else if (command === 'install') {
  const published = process.env.CATALOGUE_SNAPSHOT_POINTER_FILE ? readSnapshotPointer(pointer) : null
  installSnapshotArchive(directory, archive, published ?? catalogueLock.pointer, published ? null : catalogueLock.revisions)
  console.log(`${(published ?? catalogueLock.pointer).id} ${directory}`)
} else if (command === 'lock') {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-pin-'))
  try {
    const candidate = path.join(work, 'snapshot')
    const release = process.argv[3]
    if (release) await fetchSnapshot(candidate, catalogueBaseUrl(), await fetchReleasePointer(catalogueBaseUrl(), release), console.log)
    else await fetchCurrentSnapshot(candidate, catalogueBaseUrl(), console.log)
    const current = installedSnapshot(candidate)
    if (!current) throw new Error('the fetched catalogue snapshot is incomplete')
    const revisions = JSON.parse(fs.readFileSync(path.join(candidate, 'revision.json'), 'utf8')) as Record<string, string>
    fs.writeFileSync(lock, `${JSON.stringify({ ...releaseLock, pointer: current, revisions }, null, 2)}\n`)
    console.log(`${current.id} ${lock}`)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
} else {
  throw new Error('expected pack, verify, fetch, download, install, or lock')
}
