import { Directory, File, Paths } from 'expo-file-system'
import { APP_URL } from './navigation'
import { MAX_OFFLINE_BYTES } from '../../src/contracts/offlineReference'
import { parseSavedReference, type SavedReference } from './offlineReference'

function directory() {
  return new Directory(Paths.document, 'offline-app', Array.from(APP_URL, (character) => character.charCodeAt(0).toString(16)).join(''))
}
export function readOfflineReference(): SavedReference | null {
  const root = directory()
  if (!root.exists) return null
  const names = root
    .list()
    .map((file) => file.name)
    .filter((name) => /^\d+-[\w-]+\.json$/.test(name))
    .sort((left, right) => right.localeCompare(left))
  for (const name of names) {
    try {
      const file = new File(root, name)
      if (file.size > MAX_OFFLINE_BYTES * 2) continue
      const saved = parseSavedReference(JSON.parse(file.textSync()))
      if (saved) return saved
    } catch {
      // Keep the preceding download readable after an interrupted write.
    }
  }
  return null
}
export function storeOfflineReference(pack: SavedReference, id: string) {
  const root = directory()
  root.create({ intermediates: true, idempotent: true })
  const previous = root.list().map((file) => file.name)
  const newest = Math.max(Date.now(), ...previous.map((name) => Number(name.split('-')[0]) + 1).filter(Number.isFinite))
  const file = new File(root, `${newest}-${id}.json`)
  try {
    const serialized = JSON.stringify(pack)
    file.write(serialized)
    if (file.size !== new TextEncoder().encode(serialized).byteLength) throw new Error('Incomplete reference download')
  } catch (error) {
    if (file.exists) file.delete()
    throw error
  }
  // Retain one previous generation as a recovery copy.
  for (const name of previous.sort((left, right) => right.localeCompare(left)).slice(1)) new File(root, name).delete()
}

export function offlineReferenceDataScript(pack = readOfflineReference()) {
  const json = pack?.html.match(/<script>window\.PraetoriumOffline=([^]*?);<\/script>/)?.[1]
  return json ? `window.PraetoriumReferenceCache=${json};` : ''
}
