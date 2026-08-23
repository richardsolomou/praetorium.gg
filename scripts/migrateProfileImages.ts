import { eq, like } from 'drizzle-orm'
import { databaseUrl, openDatabase } from '../src/db/connection'
import { user } from '../src/db/schema'
import { storeProfileImage } from '../src/server/avatarStorage'

/**
 * One-off repair for accounts whose picture is still a data URL in `user.image` from before
 * uploads moved to object storage — the thing that overflowed request headers once it rode
 * along in the session cookie. Safe to run more than once: nothing is left to migrate once
 * every row holds a short URL instead.
 */
const connection = openDatabase(databaseUrl())
try {
  const { database } = connection
  const affected = await database.select({ id: user.id, image: user.image }).from(user).where(like(user.image, 'data:%'))
  console.log(`${affected.length} account(s) with an inline profile picture`)
  for (const row of affected) {
    if (!row.image) continue
    const url = await storeProfileImage(row.image)
    await database.update(user).set({ image: url }).where(eq(user.id, row.id))
    console.log(`migrated ${row.id}`)
  }
} finally {
  await connection.close()
}
