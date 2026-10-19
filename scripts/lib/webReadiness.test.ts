import { expect, it } from 'vitest'
import { waitForWebRevision } from './webReadiness'

it('waits through the old deployment and catalogue preparation until the new revision is healthy', async () => {
  let calls = 0
  let elapsed = 0
  await waitForWebRevision('https://example.test', 'new', {
    now: () => elapsed,
    pause: async () => {
      elapsed += 1_000
    },
    request: async () => {
      calls++
      return calls === 2
        ? new Response(null, { status: 503 })
        : new Response(null, { headers: { 'x-praetorium-revision': calls === 1 ? 'old' : 'new' } })
    },
  })

  expect(calls).toBe(3)
})

it('refuses to call an old healthy revision a successful deployment', async () => {
  let elapsed = 0
  await expect(
    waitForWebRevision('https://example.test', 'new', {
      timeoutMs: 1_000,
      now: () => elapsed,
      pause: async () => {
        elapsed += 1_000
      },
      request: async () => new Response(null, { headers: { 'x-praetorium-revision': 'old' } }),
    }),
  ).rejects.toThrow('Timed out waiting')
})
