import { z } from 'zod'
import { version } from '../../../../package.json'
import type { ReleaseNote } from '../../../core/releaseNotes'
import { newerRelease } from '../../releaseUpdate'
import { parseStored, readStoredValue, useStoredValue, writeStoredValue } from '../../storedValue'

const SEEN_KEY = 'praetorium-seen-release'

/** The What's new notice waits this long after the player last looked, since releases ship several times a day. */
export const NOTICE_INTERVAL = 7 * 86_400_000

const seenReleaseSchema = z.object({ version: z.string(), at: z.number() })

/** The release this browser last acknowledged and when, or null when storage is unavailable, empty or unreadable. */
export const seenRelease = (stored = readStoredValue(SEEN_KEY)) => parseStored(seenReleaseSchema, stored)

export function markReleaseSeen(seen = version, at = Date.now()) {
  writeStoredValue(SEEN_KEY, JSON.stringify({ version: seen, at }))
}

/** The acknowledged release, read as nothing on the server so the first frame matches. */
export function useSeenRelease() {
  return seenRelease(useStoredValue(SEEN_KEY))
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
