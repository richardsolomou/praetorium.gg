import { isExpectedRealtimeDisconnect, isRealtimeServiceUnavailable, RealtimeOutageError } from './realtimeErrors'

type Connection = { disconnect(): void }

/** How an open connection reports back to the loop that renews it. */
export type SpacetimeLink<T> = {
  /** The connection ended for good; open a new one with a fresh ticket after a backoff. */
  failed: (error?: unknown) => void
  /** The SDK lost the socket and is reconnecting on its own; poll until the subscription applies again. */
  interrupted: (error?: unknown) => void
  /** The ticket for the SDK's reconnect: a fresh one if tickets expire, ending this connection if access has been withdrawn. */
  renew: () => Promise<T>
  isCurrent: () => boolean
  ready: () => void
}

const RETRY_MS = 5_000
const MAX_RETRY_MS = 60_000
const RECOVERY_MS = 30_000
/** Inside the five-minute token, because only a new connection extends its `session_access`; the SDK's own reconnect does not. */
const TOKEN_REFRESH_MS = 4 * 60 * 1_000
const OUTAGE_ATTEMPTS = 5

export function maintainSpacetimeConnection<T>(options: {
  issue: () => Promise<T | null>
  open: (issued: T, link: SpacetimeLink<T>) => Connection
  inactive: () => void
  report: (error: unknown) => void
  /** Called once per outage, when a working connection first drops or fails; another follows only after it recovers. */
  lost?: (how: 'interrupted' | 'failed') => void
  /** Whether tickets expire and need refreshing; otherwise every reconnect reuses the ticket the connection opened with. */
  expires?: boolean
}) {
  const expires = options.expires ?? true
  let active = true
  let generation = 0
  let retryDelay = RETRY_MS
  let reported = false
  let lost = false
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

  const loseOnce = (how: 'interrupted' | 'failed') => {
    if (lost) return
    lost = true
    options.lost?.(how)
  }

  const note = (error?: unknown) => {
    if (isRealtimeServiceUnavailable(error)) {
      unavailable++
      if (unavailable === OUTAGE_ATTEMPTS) reportOnce(new RealtimeOutageError(error, unavailable))
    } else {
      unavailable = 0
      if (error !== undefined && !isExpectedRealtimeDisconnect(error)) reportOnce(error)
    }
  }

  const connect = async () => {
    const attempt = ++generation
    const failed = (error?: unknown) => {
      if (!active || attempt !== generation || retry !== undefined) return
      note(error)
      loseOnce('failed')
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
          lost = false
        }, RECOVERY_MS)
      }
      const interrupted = (error?: unknown) => {
        if (!isCurrent()) return
        note(error)
        loseOnce('interrupted')
        clearTimeout(recovery)
        options.inactive()
      }
      const renew = async () => {
        if (!expires) return issued
        const renewed = await options.issue()
        if (renewed !== null) return renewed
        failed()
        throw new Error('Realtime access ended')
      }
      const opened = options.open(issued, { failed, interrupted, renew, isCurrent, ready })
      if (!active || attempt !== generation) {
        opened.disconnect()
        return
      }
      connection = opened
      if (!expires) return
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
