import { assertHealthHandlerConformance, assertMutationOriginConformance, assertSqliteConformance } from 'ras-stack/conformance'
import { tanStackHealthHandler } from 'ras-stack/tanstack/server'
import { describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../db/connection'
import { mutationRpc } from './rpc'

describe('shared infrastructure conformance', () => {
  it('preserves mutation origin checks', async () => {
    await expect(
      assertMutationOriginConformance((request) => mutationRpc(() => undefined, request), { trustForwardedHeaders: true }),
    ).resolves.toBeUndefined()
  })

  it('keeps health failures private', async () => {
    await expect(assertHealthHandlerConformance((check) => tanStackHealthHandler(check))).resolves.toBeUndefined()
  })

  it('configures SQLite safely', async () => {
    const database = openDatabase(':memory:')
    await expect(assertSqliteConformance((name) => database.$client.pragma(name, { simple: true }))).resolves.toBeUndefined()
    closeDatabase(database)
  })
})
