import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterEach, expect, it } from 'vitest'
import { closeDatabase, databasePath, openDatabase } from '../src/db/connection'
import { rosters, user } from '../src/db/schema'
import { PREVIEW_EMAIL, PREVIEW_ROSTER, seedPreview } from './seedPreview'

let root: string | undefined

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true })
  delete process.env.DATA_DIR
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
