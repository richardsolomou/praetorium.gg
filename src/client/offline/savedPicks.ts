import rawPin from '../../../catalogue/legacy-ids/saved-picks.json' with { type: 'json' }
import { type SavedPickTranslations, savedPickTranslations, savedPicksPinSchema } from '../../core/savedPicks'

/** Where the device keeps the pinned translations, by the address that names their content. */
const SAVED_PICKS_CACHE = 'praetorium-saved-picks-v1'
const pin = savedPicksPinSchema.parse(rawPin)
const address = `/api/saved-picks/${pin.sha256}`

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const verified = async (bytes: ArrayBuffer) => hex(await crypto.subtle.digest('SHA-256', bytes)) === pin.sha256

let reading: Promise<SavedPickTranslations | null> | undefined

/**
 * The frozen translations the device reads saved picks through, on the builder and in a battle's fold alike: its kept
 * copy, else the service's, each verified against the pin the app ships with; none while neither can be read, so a pick
 * reads as its catalogue choices.
 */
export function deviceSavedPicks(): Promise<SavedPickTranslations | null> {
  reading ??= (async () => {
    const store = await caches.open(SAVED_PICKS_CACHE)
    const kept = await store.match(address)
    const keptBytes = kept && (await kept.arrayBuffer())
    if (keptBytes && (await verified(keptBytes))) return savedPickTranslations(JSON.parse(new TextDecoder().decode(keptBytes)))
    if (kept) await store.delete(address)
    const response = await fetch(address, { credentials: 'omit', signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error('The saved-pick translations are unavailable')
    const bytes = await response.arrayBuffer()
    if (!(await verified(bytes))) throw new Error('The saved-pick translations do not match their pin')
    await store.put(address, new Response(bytes, { headers: { 'Content-Type': 'application/json' } }))
    return savedPickTranslations(JSON.parse(new TextDecoder().decode(bytes)))
  })().catch(() => {
    reading = undefined
    return null
  })
  return reading
}
