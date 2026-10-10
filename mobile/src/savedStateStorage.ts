import { Directory, File, Paths } from 'expo-file-system'
import { APP_URL } from './navigation'

function directory(name: string) {
  return new Directory(Paths.document, name, Array.from(APP_URL, (character) => character.charCodeAt(0).toString(16)).join(''))
}
const generations = (root: Directory) =>
  root
    .list()
    .map((file) => file.name)
    .filter((name) => /^\d+-[\w-]+\.json$/.test(name))
    .sort()
    .toReversed()

export function readSavedState<T>(name: string, limit: number, parse: (value: unknown) => T | null): T | null {
  const root = directory(name)
  if (!root.exists) return null
  for (const entry of generations(root)) {
    try {
      const file = new File(root, entry)
      if (file.size > limit) continue
      const value = parse(JSON.parse(file.textSync()))
      if (value) return value
    } catch {
      // A prior generation remains readable after an interrupted replacement.
    }
  }
  return null
}

export function writeSavedState(name: string, value: unknown, id: string, limit: number, retainPrevious = true) {
  const serialized = JSON.stringify(value)
  const size = new TextEncoder().encode(serialized).byteLength
  if (size > limit) throw new Error('Saved changes exceed the storage limit')
  const root = directory(name)
  root.create({ intermediates: true, idempotent: true })
  const previous = generations(root)
  const generation = Math.max(Date.now(), ...previous.map((entry) => Number(entry.split('-')[0]) + 1))
  const file = new File(root, `${id}.tmp`)
  try {
    file.write(serialized)
    if (file.size !== size || file.textSync() !== serialized) throw new Error('Incomplete saved-data write')
    file.moveSync(new File(root, `${generation}-${id}.json`))
  } finally {
    if (file.exists && file.name.endsWith('.tmp')) file.delete()
  }
  for (const entry of previous.slice(retainPrevious ? 1 : 0)) new File(root, entry).delete()
}

export function deleteSavedState(name: string) {
  const root = directory(name)
  if (root.exists) root.delete()
}
