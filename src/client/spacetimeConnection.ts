import { isExpectedRealtimeDisconnect, isRealtimeServiceUnavailable, RealtimeOutageError } from './realtimeErrors'

type Connection = { disconnect(): void }

const RETRY_MS = 5_000
const MAX_RETRY_MS = 60_000
const RECOVERY_MS = 30_000
const TOKEN_REFRESH_MS = 4 * 60 * 1_000
const OUTAGE_ATTEMPTS = 5

export function maintainSpacetimeConnection<T>(options: {
  issue: () => Promise<T | null>
  open: (issued: T, failed: (error?: unknown) => void, isCurrent: () => boolean, ready: () => void) => Connection
  inactive: () => void
  report: (error: unknown) => void
}) {
  let active = true
  let generation = 0
  let retryDelay = RETRY_MS
  let reported = false
  let unavailable = 0
  let connection: Connection | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let recovery: ReturnType<typeof setTimeout> | undefined
  let refresh: ReturnType<typeof setTimeout> | undefined

  const reportOnce = (error: unknown) => {
    if (reported) return
    reported = true
    options.report(error)
  }

  const connect = async () => {
    const attempt = ++generation
    const failed = (error?: unknown) => {
      if (!active || attempt !== generation || retry !== undefined) return
      if (isRealtimeServiceUnavailable(error)) {
        unavailable++
        if (unavailable === OUTAGE_ATTEMPTS) reportOnce(new RealtimeOutageError(error, unavailable))
      } else {
        unavailable = 0
        if (error !== undefined && !isExpectedRealtimeDisconnect(error)) reportOnce(error)
      }
      generation++
      clearTimeout(refresh)
      clearTimeout(recovery)
      retry = setTimeout(
        () => {
          retry = undefined
          void connect()
        },
        retryDelay * (1 + Math.random()),
      )
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS)
      const previous = connection
      connection = null
      previous?.disconnect()
      options.inactive()
    }
    try {
      const issued = await options.issue()
      if (!active || attempt !== generation || issued === null) return
      unavailable = 0
      const isCurrent = () => active && attempt === generation
      const ready = () => {
        if (!isCurrent()) return
        clearTimeout(recovery)
        recovery = setTimeout(() => {
          if (!isCurrent()) return
          retryDelay = RETRY_MS
          reported = false
        }, RECOVERY_MS)
      }
      const opened = options.open(issued, failed, isCurrent, ready)
      if (!active || attempt !== generation) {
        opened.disconnect()
        return
      }
      connection = opened
      refresh = setTimeout(() => {
        if (!active || attempt !== generation) return
        generation++
        clearTimeout(recovery)
        const previous = connection
        connection = null
        previous?.disconnect()
        options.inactive()
        void connect()
      }, TOKEN_REFRESH_MS)
    } catch (error) {
      failed(error)
    }
  }
  void connect()
  return () => {
    active = false
    generation++
    clearTimeout(retry)
    clearTimeout(refresh)
    clearTimeout(recovery)
    connection?.disconnect()
    connection = null
    options.inactive()
  }
}
