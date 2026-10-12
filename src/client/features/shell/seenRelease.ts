import type { ReleaseNote } from '../../../core/releaseNotes'
import { newerRelease } from './releaseUpdate'

const SEEN_KEY = 'praetorium-seen-release'

/** The version this browser last acknowledged, or null when storage is unavailable or empty. */
export function seenRelease() {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

export function markReleaseSeen(version: string) {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    // Without storage the notice shows again next visit, which is the safer failure.
  }
}

/** The changes released since the acknowledged version, newest first. */
export function unseenChanges(notes: readonly ReleaseNote[], seen: string, current: string) {
  return notes.filter((note) => newerRelease(seen, note.version) && !newerRelease(current, note.version)).flatMap((note) => note.changes)
}
