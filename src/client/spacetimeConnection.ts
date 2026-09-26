type Connection = { disconnect(): void }

const RETRY_MS = 5_000
const TOKEN_REFRESH_MS = 4 * 60 * 1_000

export function maintainSpacetimeConnection<T>(options: {
  issue: () => Promise<T | null>
  open: (issued: T, failed: (error?: unknown) => void, isCurrent: () => boolean) => Connection
  inactive: () => void
  report: (error: unknown) => void
}) {
  let active = true
  let generation = 0
  let connection: Connection | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let refresh: ReturnType<typeof setTimeout> | undefined

  const connect = async () => {
    const attempt = ++generation
    const failed = (error?: unknown) => {
      if (!active || attempt !== generation || retry !== undefined) return
      if (error !== undefined) options.report(error)
      generation++
      clearTimeout(refresh)
      retry = setTimeout(() => {
        retry = undefined
        void connect()
      }, RETRY_MS)
      const previous = connection
      connection = null
      previous?.disconnect()
      options.inactive()
    }
    try {
      const issued = await options.issue()
      if (!active || attempt !== generation || issued === null) return
      const opened = options.open(issued, failed, () => active && attempt === generation)
      if (!active || attempt !== generation) {
        opened.disconnect()
        return
      }
      connection = opened
      refresh = setTimeout(() => {
        if (!active || attempt !== generation) return
        generation++
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
    connection?.disconnect()
    connection = null
    options.inactive()
  }
}
