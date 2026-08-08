import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterEach, expect, it } from 'vitest'
import { evaluate } from '../src/core/evaluate'
import { buildUnit } from '../src/core/roster'
import { closeDatabase, databasePath, openDatabase } from '../src/db/connection'
import { rosters, user } from '../src/db/schema'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { rosterDetachments } from '../src/server/pricing'
import { PREVIEW_EMAIL, PREVIEW_ROSTER, seedPreview } from './seedPreview'

let root: string | undefined

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true })
  delete process.env.DATA_DIR
})

it('prices the seeded roster at 2,000 points from the pinned catalogue', () => {
  const loaded = loadCatalogue(path.join(import.meta.dirname, '..', 'catalogue-data'))
  if (!loaded) throw new Error('the pinned catalogue did not load')
  const detachments = rosterDetachments(loaded, PREVIEW_ROSTER.catalogueId, PREVIEW_ROSTER.detachmentIds).selections
  const units = PREVIEW_ROSTER.picks.map((pick) =>
    buildUnit(pick.entryId, loaded.index, 'models' in pick ? pick.models : undefined, undefined, {
      primaryCatalogueId: PREVIEW_ROSTER.catalogueId,
      roster: detachments,
    }),
  )

  expect(units.every(Boolean)).toBe(true)
  expect(evaluate([...detachments, ...units.flatMap((unit) => (unit ? [unit.selection] : []))], loaded.index).points).toBe(2000)
})

it('creates an idempotent preview account and test roster', async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-preview-seed-'))
  process.env.DATA_DIR = root

  await seedPreview()
  await seedPreview()

  const database = openDatabase(databasePath())
  expect(database.select({ count: count() }).from(user).where(eq(user.email, PREVIEW_EMAIL)).get()?.count).toBe(1)
  expect(database.select({ count: count() }).from(rosters).where(eq(rosters.id, PREVIEW_ROSTER.id)).get()?.count).toBe(1)
  expect(database.select().from(rosters).where(eq(rosters.id, PREVIEW_ROSTER.id)).get()).toMatchObject({
    name: PREVIEW_ROSTER.name,
    catalogueId: PREVIEW_ROSTER.catalogueId,
    detachmentId: JSON.stringify(PREVIEW_ROSTER.detachmentIds),
    disposition: PREVIEW_ROSTER.disposition,
    limit: 2000,
    picks: JSON.stringify(PREVIEW_ROSTER.picks),
  })
  closeDatabase(database)
})
