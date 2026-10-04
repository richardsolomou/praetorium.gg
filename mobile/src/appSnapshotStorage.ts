import { Directory, File, Paths } from 'expo-file-system'
import { APP_URL } from './navigation'
import { MAX_APP_SNAPSHOT_BYTES, parseAppSnapshot, type AppSnapshot } from '../../src/contracts/appSnapshot'

function directory() {
  return new Directory(Paths.document, 'app-state', Array.from(APP_URL, (character) => character.charCodeAt(0).toString(16)).join(''))
}

export function readAppSnapshot(): AppSnapshot | null {
  try {
    const file = new File(directory(), 'snapshot.json')
    return file.exists && file.size <= MAX_APP_SNAPSHOT_BYTES ? parseAppSnapshot(JSON.parse(file.textSync())) : null
  } catch {
    return null
  }
}

export function storeAppSnapshot(snapshot: AppSnapshot | null, id: string) {
  const root = directory()
  if (!snapshot) {
    if (root.exists) root.delete()
    return
  }
  const serialized = JSON.stringify(snapshot)
  const size = new TextEncoder().encode(serialized).byteLength
  if (size > MAX_APP_SNAPSHOT_BYTES) throw new Error('Application data exceeds the save limit')
  root.create({ intermediates: true, idempotent: true })
  const file = new File(root, `${id}.tmp`)
  try {
    file.write(serialized)
    if (file.size !== size) throw new Error('Incomplete application data write')
    file.moveSync(new File(root, 'snapshot.json'), { overwrite: true })
  } finally {
    if (file.exists && file.name.endsWith('.tmp')) file.delete()
  }
}

export function appSnapshotScript(snapshot = readAppSnapshot()) {
  return `window.PraetoriumAppSnapshot=${JSON.stringify(snapshot).replaceAll('<', '\\u003c')};`
}
