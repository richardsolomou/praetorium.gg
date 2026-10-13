import { expect, it } from 'vitest'
import { localTestEnvironment, reserveLocalPort } from './localStack'

it('allocates distinct ports and data directories for concurrent browser runs', async () => {
  const runs = await Promise.all([localTestEnvironment('e2e', {}), localTestEnvironment('e2e', {})])
  const values = runs.flatMap((run) =>
    Object.entries(run)
      .filter(([name]) => name.endsWith('PORT'))
      .map(([, value]) => value),
  )
  expect([new Set(values).size, new Set(runs.map((run) => run.PLAYWRIGHT_DATA_ROOT)).size]).toEqual([8, 2])
})

it('refuses an occupied explicit port without claiming the service on it', async () => {
  const owner = await reserveLocalPort()
  try {
    await expect(localTestEnvironment('e2e', { PLAYWRIGHT_PORT: String(owner.port) })).rejects.toThrow('unavailable')
  } finally {
    await owner.release()
  }
})

it('chooses an available default when the preferred development port is occupied', async () => {
  const owner = await reserveLocalPort()
  let fallback: Awaited<ReturnType<typeof reserveLocalPort>> | undefined
  try {
    fallback = await reserveLocalPort(owner.port, true)
    expect(fallback.port).not.toBe(owner.port)
  } finally {
    await fallback?.release()
    await owner.release()
  }
})
