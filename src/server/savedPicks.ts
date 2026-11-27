import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import rawPin from '../shared/savedPicks.pin.json' with { type: 'json' }
import { type SavedPickTranslations, savedPickTranslations, savedPicksPinSchema } from '../core/savedPicks'
import { privateR2Client, r2Objects } from './r2Client'

/**
 * The pinned translations: their SHA-256 names their object in the players' private bucket, which previews and CI hold
 * no key to, and the bytes it must hold.
 */
export const savedPicksPin = savedPicksPinSchema.parse(rawPin)
export const savedPicksKey = (sha256 = savedPicksPin.sha256) => `saved-picks/${sha256}.json`

/** The pinned translations' bytes, verified against the pin: from this server's copy, else the bucket, then kept. */
export async function savedPicksBytes(dataDirectory = process.env.DATA_DIR ?? '/data'): Promise<Uint8Array> {
  const file = path.join(path.resolve(dataDirectory), 'saved-picks', `${savedPicksPin.sha256}.json`)
  const verified = (bytes: Uint8Array) => hash('sha256', bytes) === savedPicksPin.sha256
  if (fs.existsSync(file)) {
    const bytes = fs.readFileSync(file)
    if (verified(bytes)) return bytes
    fs.rmSync(file)
  }
  const store = privateR2Client()
  if (!store) throw new Error('saved-pick translations are unavailable without the private bucket')
  const bytes = await r2Objects(store).get(savedPicksKey())
  if (!bytes) throw new Error('saved-pick translations are missing from the private bucket')
  if (!verified(bytes)) throw new Error('saved-pick translations do not match their pin')
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, bytes, { mode: 0o600 })
  return bytes
}

let loading: Promise<unknown> | undefined
let loaded: SavedPickTranslations | undefined
let retryAt = 0

/**
 * The frozen translations once loaded, else none while they load: a pick then reads as its catalogue choices, as one
 * saved before VS Data did, so nothing waits on the bucket. The first call starts the load; a failed one retries a
 * minute later.
 */
export function savedPicks(): SavedPickTranslations | undefined {
  if (!loaded && !loading && Date.now() >= retryAt)
    loading = savedPicksBytes()
      .then((bytes) => (loaded = savedPickTranslations(JSON.parse(new TextDecoder().decode(bytes)))))
      .catch((error: unknown) => {
        console.error('saved-pick translations failed to load', error)
        retryAt = Date.now() + 60_000
      })
      .finally(() => (loading = undefined))
  return loaded
}
