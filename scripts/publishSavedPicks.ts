import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { appendSavedPicks, savedPicksKey, savedPicksPinSchema, savedPicksSchema } from '../src/core/savedPicks'
import { privateR2Client, r2Objects } from '../src/server/r2Client'

/**
 * Publishes the frozen saved-pick translations a translator run found (`scripts/translateSavedPicks.ts`) beside the ones
 * already published: their union, every published key kept as it reads, goes to the players' private bucket as
 * `saved-picks/<sha256>.json`, and `src/shared/savedPicks.pin.json` pins it. A run that would change what a
 * published key means stops before anything is written. Needs the private bucket's credentials (`R2_*`).
 *
 *   pnpm exec tsx scripts/publishSavedPicks.ts [translations]
 */
const pinFile = path.join(import.meta.dirname, '../src/shared/savedPicks.pin.json')
const translations = path.resolve(process.argv[2] ?? 'data-dev/saved-picks.json')
const found = savedPicksSchema.parse(JSON.parse(fs.readFileSync(translations, 'utf8')))
// When the backup the translations came from was taken, as the translator recorded it beside them from the copy itself.
const { copiedAt } = savedPicksPinSchema
  .pick({ copiedAt: true })
  .parse(JSON.parse(fs.readFileSync(path.join(path.dirname(translations), 'saved-picks-copy.json'), 'utf8')))
const sha256 = (bytes: Uint8Array | string) => hash('sha256', bytes)
const store = privateR2Client()
if (!store) throw new Error('set the private bucket credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) to publish')
const objects = r2Objects(store)

// Only the published object's address is read from the pin it replaces.
const pinned = fs.existsSync(pinFile)
  ? savedPicksPinSchema.pick({ format: true, sha256: true }).parse(JSON.parse(fs.readFileSync(pinFile, 'utf8')))
  : null
let published = null
if (pinned) {
  const bytes = await objects.get(savedPicksKey(pinned.sha256))
  if (!bytes) throw new Error('the pinned translations are missing from the private bucket')
  if (sha256(bytes) !== pinned.sha256) throw new Error('the pinned translations do not match their pin')
  published = savedPicksSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
}
const text = appendSavedPicks(published, found.picks)
const digest = sha256(text)
const added = Object.keys(found.picks).filter((key) => !published?.picks[key]).length
if (!(await objects.head(savedPicksKey(digest))))
  await objects.put(savedPicksKey(digest), new TextEncoder().encode(text), { 'Content-Type': 'application/json' })
fs.writeFileSync(
  pinFile,
  `${JSON.stringify(savedPicksPinSchema.parse({ format: 'praetorium.saved-picks-pin.v1', sha256: digest, copiedAt }), null, 2)}\n`,
)
console.log(`published ${Object.keys(JSON.parse(text).picks).length} translations (${added} new) as ${savedPicksKey(digest)}`)
