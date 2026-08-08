import { count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../db/connection'
import { user } from '../db/schema'
import { createAuth, previewLogin, seedPreviewLogin } from './auth'

describe('preview login', () => {
  it('is available only when explicitly enabled', () => {
    expect(previewLogin({ PREVIEW_LOGIN: 'false' })).toBeNull()
    expect(previewLogin({ PREVIEW_LOGIN: 'true' })).toEqual({
      email: 'preview@praetorium.gg',
      password: 'praetorium-preview',
    })
  })

  it('creates the account once', async () => {
    const database = openDatabase(':memory:')
    const auth = createAuth(database, 'preview-test-secret-preview-test-secret')
    const login = previewLogin({ PREVIEW_LOGIN: 'true' })

    await seedPreviewLogin(database, auth, login)
    await seedPreviewLogin(database, auth, login)

    expect(database.select({ count: count() }).from(user).where(eq(user.email, login!.email)).get()?.count).toBe(1)
    closeDatabase(database)
  })
})
