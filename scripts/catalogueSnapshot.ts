import path from 'node:path'
import fs from 'node:fs'
import {
  catalogueBaseUrl,
  catalogueLock,
  downloadSnapshotArchive,
  fetchCurrentSnapshot,
  installSnapshotArchive,
  installedSnapshot,
  packCatalogueSnapshot,
  verifySnapshotArchive,
} from '../src/server/catalogueSnapshot'
import { writeCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { disabledCatalogueSources } from '../src/server/catalogueSources'

const root = path.join(import.meta.dirname, '..')
const directory = process.env.CATALOGUE_DIR ?? path.join(root, 'catalogue-data')
const archive = process.env.CATALOGUE_SNAPSHOT_FILE ?? path.join(root, 'catalogue-snapshot.zip')
const pointer = process.env.CATALOGUE_SNAPSHOT_POINTER_FILE ?? path.join(root, 'catalogue-current.json')
const lock = path.join(root, 'catalogue', 'lock.json')
const command = process.argv[2]

if (command === 'pack') {
  const disabled = disabledCatalogueSources()
  if ((['definitions', 'rules', 'datacards'] as const).every((source) => !disabled.has(source))) {
    const catalogue = writeCanonicalCatalogue(directory)
    console.log(`canonical catalogue: ${catalogue.datasheets.length} datasheets, ${catalogue.issues.length} audit issues`)
  }
  const packed = packCatalogueSnapshot(directory, archive, pointer)
  console.log(`${packed.id} ${archive}`)
} else if (command === 'verify') {
  verifySnapshotArchive(archive, pointer)
} else if (command === 'fetch') {
  await fetchCurrentSnapshot(directory, catalogueBaseUrl(), (message) => console.log(message))
} else if (command === 'download') {
  await downloadSnapshotArchive(archive, catalogueBaseUrl())
  console.log(`${catalogueLock.pointer.id} ${archive}`)
} else if (command === 'install') {
  installSnapshotArchive(directory, archive)
  console.log(`${catalogueLock.pointer.id} ${directory}`)
} else if (command === 'lock') {
  await fetchCurrentSnapshot(directory, catalogueBaseUrl(), (message) => console.log(message))
  const current = installedSnapshot(directory)
  if (!current) throw new Error('the fetched catalogue snapshot is incomplete')
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8')) as Record<string, string>
  fs.writeFileSync(lock, `${JSON.stringify({ format: 'praetorium.catalogue-lock.v1', pointer: current, revisions }, null, 2)}\n`)
  console.log(`${current.id} ${lock}`)
} else {
  throw new Error('expected pack, verify, fetch, download, install, or lock')
}
