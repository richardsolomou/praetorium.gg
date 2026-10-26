import { TEXT_HASH_LENGTH, sourceStrings } from '../shared/sourceText'

export const hex = (digest: ArrayBuffer) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')

/** What the worker answers when hashing itself failed, such as where a plain-HTTP page has no `crypto.subtle`. */
export const HASHING_FAILED = 'hashing-failed'

const encoder = new TextEncoder()
/** Digests run concurrently in batches: one at a time is slow, and every string of a large file at once holds them all in memory. */
const BATCH = 512

/** Every string a pinned upstream file holds, by the truncated hash a token names it by, or null when it does not parse. */
export async function hashedSourceStrings(bytes: ArrayBuffer): Promise<Map<string, string> | null> {
  let file: unknown
  try {
    file = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
  const strings = [...sourceStrings(file)]
  const byHash = new Map<string, string>()
  for (let at = 0; at < strings.length; at += BATCH) {
    const batch = strings.slice(at, at + BATCH)
    const digests = await Promise.all(batch.map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))))
    batch.forEach((value, index) => byHash.set(hex(digests[index]!).slice(0, TEXT_HASH_LENGTH), value))
  }
  return byHash
}
