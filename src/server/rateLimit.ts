type RateWindow = { startedAt: number; requests: number }
const RATE_WINDOW_MS = 60_000
const RATE_BUCKET_MAX = 10_000

/** A per-address limit of `limit` requests a minute; each limiter counts only its own requests. */
export function fixedWindowRateLimit(error: string, limit: number) {
  const rateWindows = new Map<string, RateWindow>()
  const rateLimitResponse = (retryAfter: number) =>
    Response.json({ error }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) } })

  return (request: Request) => {
    const now = Date.now()
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const key = forwarded || 'unknown'
    const current = rateWindows.get(key)
    if (current && now - current.startedAt < RATE_WINDOW_MS) {
      current.requests += 1
      if (current.requests <= limit) return null
      return rateLimitResponse(Math.ceil((current.startedAt + RATE_WINDOW_MS - now) / 1000))
    }
    if (current) rateWindows.delete(key)
    if (rateWindows.size >= RATE_BUCKET_MAX) {
      for (const [bucketKey, value] of rateWindows) if (now - value.startedAt >= RATE_WINDOW_MS) rateWindows.delete(bucketKey)
    }
    if (rateWindows.size >= RATE_BUCKET_MAX) {
      const retryAt = Math.min(...[...rateWindows.values()].map((window) => window.startedAt + RATE_WINDOW_MS))
      return rateLimitResponse(Math.max(1, Math.ceil((retryAt - now) / 1000)))
    }
    rateWindows.set(key, { startedAt: now, requests: 1 })
    return null
  }
}
