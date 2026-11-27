import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { appendSavedPicks, savedPicksPinSchema, savedPicksSchema } from '../src/core/savedPicks'
import { fetchCatalogueObject } from '../src/server/catalogueStore'
import { catalogueR2Client, r2Objects } from '../src/server/r2Client'

/**
 * Publishes the frozen saved-pick translations a translator run found (`scripts/translateSavedPicks.ts`) beside the ones
 * already published: their union, every published key kept as it reads, goes to the private catalogue bucket as
 * `saved-picks/<sha256>.json`, and `catalogue/legacy-ids/saved-picks.json` pins it. A run that would change what a
 * published key means stops before anything is written. Needs the catalogue bucket's credentials.
 *
 *   pnpm exec tsx scripts/publishSavedPicks.ts [translations]
 */
const pinFile = path.join(import.meta.dirname, '../catalogue/legacy-ids/saved-picks.json')
const found = savedPicksSchema.parse(JSON.parse(fs.readFileSync(path.resolve(process.argv[2] ?? 'data-dev/saved-picks.json'), 'utf8')))
const sha256 = (bytes: Uint8Array | string) => hash('sha256', bytes)
const keyOf = (digest: string) => `saved-picks/${digest}.json`

const pinned = fs.existsSync(pinFile) ? savedPicksPinSchema.parse(JSON.parse(fs.readFileSync(pinFile, 'utf8'))) : null
let published = null
if (pinned) {
  const response = await fetchCatalogueObject(`r2://praetorium-catalogue/${keyOf(pinned.sha256)}`)
  if (!response.ok) throw new Error(`the pinned translations are unavailable: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (sha256(bytes) !== pinned.sha256) throw new Error('the pinned translations do not match their pin')
  published = savedPicksSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
}
const text = appendSavedPicks(published, found.picks)
const digest = sha256(text)
const added = Object.keys(found.picks).filter((key) => !published?.picks[key]).length
if (digest === pinned?.sha256) {
  console.log('no translations to add')
  process.exit(0)
}
const store = catalogueR2Client()
if (!store) throw new Error('set the catalogue bucket credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) to publish')
const objects = r2Objects(store)
if (!(await objects.head(keyOf(digest))))
  await objects.put(keyOf(digest), new TextEncoder().encode(text), { 'Content-Type': 'application/json' })
fs.writeFileSync(pinFile, `${JSON.stringify({ format: 'praetorium.saved-picks-pin.v1', sha256: digest }, null, 2)}\n`)
console.log(`published ${Object.keys(JSON.parse(text).picks).length} translations (${added} new) as ${keyOf(digest)}`)
