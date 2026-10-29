import { useSyncExternalStore } from 'react'
import { version } from '../../../../package.json'
import type { ReleaseNote } from '../../../core/releaseNotes'
import { newerRelease } from '../../releaseUpdate'

const SEEN_KEY = 'praetorium-seen-release'
const CHANGED = 'praetorium-seen-release-changed'

/** The What's new notice waits this long after the player last looked, since releases ship several times a day. */
export const NOTICE_INTERVAL = 7 * 86_400_000

export type SeenRelease = { version: string; at: number }

function storedSeenRelease() {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

/** The release this browser last acknowledged and when, or null when storage is unavailable, empty or unreadable. */
export function seenRelease(stored = storedSeenRelease()): SeenRelease | null {
  try {
    const seen = JSON.parse(stored ?? '') as Partial<SeenRelease>
    return typeof seen.version === 'string' && typeof seen.at === 'number' ? { version: seen.version, at: seen.at } : null
  } catch {
    return null
  }
}

export function markReleaseSeen(seen = version, at = Date.now()) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ version: seen, at }))
  } catch {
    // Without storage the dot shows again next visit, which is the safer failure.
  }
  window.dispatchEvent(new Event(CHANGED))
}

/** Calls back when this or another window acknowledges a release. */
function subscribeSeenRelease(onChange: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === SEEN_KEY || event.key === null) onChange()
  }
  window.addEventListener(CHANGED, onChange)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(CHANGED, onChange)
    window.removeEventListener('storage', storage)
  }
}

/** The acknowledged release, read as nothing on the server so the first frame matches. */
export function useSeenRelease() {
  return seenRelease(useSyncExternalStore(subscribeSeenRelease, storedSeenRelease, () => null))
}

/** Whether this build has changes the player has not acknowledged. */
export function useUnseenRelease() {
  const seen = useSeenRelease()
  return seen !== null && newerRelease(seen.version, version)
}

/** The releases after the acknowledged version up to the running one, newest first. */
export function unseenReleases(notes: readonly ReleaseNote[], seen: string, current = version) {
  return notes.filter((note) => newerRelease(seen, note.version) && !newerRelease(current, note.version))
}
