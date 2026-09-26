import { expect, it } from 'vitest'
import type { drizzle } from 'drizzle-orm/d1'
import { handleD1Bridge, remoteD1 } from './d1Bridge'

const unusedDatabase = {} as Parameters<typeof drizzle>[0]

it('keeps the D1 bridge off public request paths', async () => {
  const response = await handleD1Bridge(new Request('http://d1.internal/'), unusedDatabase)
  expect(response.status).toBe(404)
})

it('rejects malformed D1 bridge requests before database access', async () => {
  const response = await handleD1Bridge(
    new Request('http://d1.internal/query', { method: 'POST', body: JSON.stringify({ operation: 'all', statements: [] }) }),
    unusedDatabase,
  )
  expect(response.status).toBe(400)
})

it('rejects non-finite statement parameters', () => {
  const database = remoteD1()
  expect(() => database.prepare('select ?').bind(Number.POSITIVE_INFINITY)).toThrow('Invalid D1 statement parameters')
})
