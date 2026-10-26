import { setTimeout as delay } from 'node:timers/promises'

/**
 * Waits until `origin` serves `revision` on `consecutive` health checks in a row; more than one
 * rides out replicas that update one at a time.
 *
 * `timeoutMs` restates `STARTUP_BUDGET_MS` instead of importing it: the deploy workflow runs this file alone,
 * copied out of the workflow's own revision with `git show`, so it cannot import a sibling module.
 */
export async function waitForWebRevision(
  origin: string,
  revision: string,
  { request = fetch, pause = () => delay(1_000), now = Date.now, timeoutMs = 30 * 60_000, consecutive = 1 } = {},
) {
  const deadline = now() + timeoutMs
  let failure = 'no response'
  let streak = 0
  while (now() < deadline) {
    try {
      const response = await request(new URL('/api/health', origin), {
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.min(15_000, deadline - now())),
      })
      await response.body?.cancel()
      if (response.ok && response.headers.get('x-praetorium-revision') === revision) {
        if (++streak === consecutive) return
      } else {
        streak = 0
        failure = `HTTP ${response.status}, revision ${response.headers.get('x-praetorium-revision') ?? 'absent'}`
      }
    } catch (error) {
      streak = 0
      failure = error instanceof Error ? error.message : String(error)
    }
    await pause()
  }
  throw new Error(`Timed out waiting for ${origin} to serve ${revision}: ${failure}`)
}
