import { eq } from 'drizzle-orm'
import { closeDatabase, databasePath, openDatabase } from '../src/db/connection'
import { user } from '../src/db/schema'
import { createAuth } from '../src/server/auth'

export const PREVIEW_EMAIL = 'preview@praetorium.gg'
export const PREVIEW_PASSWORD = 'preview-preview-preview'

export async function seedPreview() {
  const database = openDatabase(databasePath())
  try {
    const existing = database.select({ id: user.id }).from(user).where(eq(user.email, PREVIEW_EMAIL)).get()
    if (existing) return
    const auth = createAuth(database, 'praetorium-disposable-preview-secret')
    await auth.api.signUpEmail({ body: { email: PREVIEW_EMAIL, password: PREVIEW_PASSWORD, name: 'Preview Player' } })
  } finally {
    closeDatabase(database)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await seedPreview()
