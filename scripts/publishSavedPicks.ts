import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { nextSavedPicks, savedPicksKey, savedPicksPinSchema, savedPicksSchema } from '../src/core/savedPicks'
import { privateR2Client, r2Objects } from '../src/server/r2Client'
import { SAVED_PICKS_RUN, savedPicksRunSchema } from './lib/savedPicksRun'

/**
 * Publishes one translator run (`scripts/translateSavedPicks.ts`) in place of the published translations: its own
 * copy's keys go to the players' private bucket as `saved-picks/<sha256>.json`, and `src/shared/savedPicks.pin.json`
 * pins them with the run's `copiedAt`. A run that would change what a published key means, or leave out a published key
 * a live record still holds, stops before anything is written (`nextSavedPicks`). Needs the private bucket's
 * credentials (`R2_*`).
 *
 *   pnpm exec tsx scripts/publishSavedPicks.ts [translator run]
 */
const pinFile = path.join(import.meta.dirname, '../src/shared/savedPicks.pin.json')
const run = savedPicksRunSchema.parse(JSON.parse(fs.readFileSync(path.resolve(process.argv[2] ?? SAVED_PICKS_RUN), 'utf8')))
const sha256 = (bytes: Uint8Array | string) => hash('sha256', bytes)
const store = privateR2Client()
if (!store) throw new Error('set the private bucket credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) to publish')
const objects = r2Objects(store)

const pinned = savedPicksPinSchema.parse(JSON.parse(fs.readFileSync(pinFile, 'utf8')))
const bytes = await objects.get(savedPicksKey(pinned.sha256))
if (!bytes) throw new Error('the pinned translations are missing from the private bucket')
if (sha256(bytes) !== pinned.sha256) throw new Error('the pinned translations do not match their pin')
const published = savedPicksSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))
if (run.copiedAt < pinned.copiedAt)
  throw new Error(`this run's copy (${run.copiedAt}) is older than the published one (${pinned.copiedAt})`)

const text = nextSavedPicks(published, run.translations.picks, new Set(run.live), new Set(run.disputed))
const digest = sha256(text)
if (!(await objects.head(savedPicksKey(digest))))
  await objects.put(savedPicksKey(digest), new TextEncoder().encode(text), { 'Content-Type': 'application/json' })
fs.writeFileSync(
  pinFile,
  `${JSON.stringify(savedPicksPinSchema.parse({ format: 'praetorium.saved-picks-pin.v1', sha256: digest, copiedAt: run.copiedAt }), null, 2)}\n`,
)
const kept = Object.keys(run.translations.picks).filter((key) => published.picks[key]).length
console.log(
  `published ${Object.keys(run.translations.picks).length} translations (${kept} also in the last, ${run.disputed.length} keys read two ways left out) as ${savedPicksKey(digest)}`,
)
