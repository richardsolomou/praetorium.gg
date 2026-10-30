/** Logs a server render's loader that took over a second, with `extra` saying where the time went. */
export function warnIfSlow(event: string, startedAt: number, extra?: Record<string, unknown>) {
  const duration = performance.now() - startedAt
  if (import.meta.env.SSR && duration > 1000) console.warn({ event, duration_ms: Math.round(duration), ...extra })
}
