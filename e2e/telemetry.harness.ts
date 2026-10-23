import type { Page } from '@playwright/test'

export type Event = { name: string; properties: Record<string, unknown> }

/** Records the browser client's captures on this page from now on, without sending them. */
export async function recordEvents(page: Page) {
  const events: Event[] = []
  await page.exposeFunction('recordTelemetry', (name: string, properties: Record<string, unknown> = {}) =>
    events.push({ name, properties }),
  )
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find((entry) => /\/assets\/telemetry-[^/]+\.js/.test(entry.name))?.name
    if (!url) throw new Error('The production telemetry chunk did not load')
    const exports = await import(url)
    const client = Object.values(exports).find(
      (value) =>
        value !== null &&
        typeof value === 'object' &&
        'capture' in value &&
        typeof value.capture === 'function' &&
        'identify' in value &&
        typeof value.identify === 'function',
    ) as
      | {
          capture: (name: string, properties?: Record<string, unknown>) => unknown
          captureException: (error: unknown, properties?: Record<string, unknown>) => void
        }
      | undefined
    if (!client) throw new Error('The telemetry chunk did not export the browser client')
    const record = (name: string, properties?: Record<string, unknown>) =>
      void (
        window as unknown as { recordTelemetry: (name: string, properties?: Record<string, unknown>) => Promise<void> }
      ).recordTelemetry(name, properties)
    // A queued event is what the SDK returns, so callers that check it see a sent event.
    client.capture = (name, properties) => (record(name, properties), { event: name, properties })
    // The SDK drops exceptions until it is configured, which browser test stacks never do.
    client.captureException = (error, properties) =>
      record('$exception', { message: error instanceof Error ? error.message : String(error), ...properties })
  })
  return events
}
