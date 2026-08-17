import path from 'node:path'
import { fetchCurrentSnapshot, packCatalogueSnapshot, verifySnapshotArchive } from '../src/server/catalogueSnapshot'

const root = path.join(import.meta.dirname, '..')
const directory = process.env.CATALOGUE_DIR ?? path.join(root, 'catalogue-data')
const archive = process.env.CATALOGUE_SNAPSHOT_FILE ?? path.join(root, 'catalogue-snapshot.zip')
const pointer = process.env.CATALOGUE_SNAPSHOT_POINTER_FILE ?? path.join(root, 'catalogue-current.json')
const command = process.argv[2]

if (command === 'pack') {
  const packed = packCatalogueSnapshot(directory, archive, pointer)
  console.log(`${packed.id} ${archive}`)
} else if (command === 'verify') {
  verifySnapshotArchive(archive, pointer)
} else if (command === 'fetch') {
  const base = process.env.CATALOGUE_SNAPSHOT_BASE_URL
  if (!base) throw new Error('CATALOGUE_SNAPSHOT_BASE_URL is required')
  await fetchCurrentSnapshot(directory, base, (message) => console.log(message))
} else {
  throw new Error('expected pack, verify, or fetch')
}
