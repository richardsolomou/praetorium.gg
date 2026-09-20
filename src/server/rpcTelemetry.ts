import type { PostHogServerTelemetry } from 'ras-stack/posthog/server'

type RpcTelemetry = Pick<PostHogServerTelemetry, 'metrics' | 'withRequestContext' | 'withSpan'>

export async function observeServerFunction<T>(
  telemetry: RpcTelemetry,
  request: Request,
  work: () => T | Promise<T>,
  now = () => performance.now(),
): Promise<T> {
  const method = request.method.toUpperCase()
  const attributes = { method }

  return telemetry.withRequestContext(request, {}, () =>
    telemetry.withSpan('server_function', { kind: 'server', parent: request.headers.get('traceparent') ?? undefined }, async (span) => {
      const startedAt = now()
      span?.setAttribute('http.request.method', method)
      let outcome = 'error'
      try {
        const result = await work()
        outcome = 'success'
        return result
      } finally {
        span?.setAttribute('server.function.outcome', outcome)
        await Promise.all([
          telemetry.metrics.count('server_function.requests', 1, { attributes: { ...attributes, outcome } }),
          telemetry.metrics.histogram('server_function.duration', Math.max(0, now() - startedAt), { unit: 'ms', attributes }),
        ])
      }
    }),
  )
}
