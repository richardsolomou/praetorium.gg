import { setTimeout as delay } from 'node:timers/promises'

/**
 * `timeoutMs` restates `STARTUP_BUDGET_MS` instead of importing it: the deploy workflow runs this file alone,
 * copied out of the workflow's own revision with `git show`, so it cannot import a sibling module.
 */
export async function waitForWebRevision(
  origin: string,
  revision: string,
  { request = fetch, pause = () => delay(1_000), now = Date.now, timeoutMs = 30 * 60_000 } = {},
) {
  const deadline = now() + timeoutMs
  let failure = 'no response'
  while (now() < deadline) {
    try {
      const response = await request(new URL('/api/health', origin), { signal: AbortSignal.timeout(Math.min(15_000, deadline - now())) })
      if (response.ok && response.headers.get('x-praetorium-revision') === revision) return
      failure = `HTTP ${response.status}, revision ${response.headers.get('x-praetorium-revision') ?? 'absent'}`
      await response.body?.cancel()
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }
    await pause()
  }
  throw new Error(`Timed out waiting for ${origin} to serve ${revision}: ${failure}`)
}
