export const MAX_STREAMS = 200
export const MAX_STREAMS_PER_USER = 5

/**
 * Caps open event streams. Each one holds a socket and a listener for as long as
 * a tab stays open, so both the total and any one account are bounded.
 */
export class StreamLimiter {
  private total = 0
  private perUser = new Map<string, number>()

  constructor(
    private readonly maxTotal = MAX_STREAMS,
    private readonly maxPerUser = MAX_STREAMS_PER_USER,
  ) {}

  /** Returns a release function, or undefined when the caller is over a limit. */
  enter(userId: string) {
    const current = this.perUser.get(userId) ?? 0
    if (this.total >= this.maxTotal || current >= this.maxPerUser) return undefined
    this.total++
    this.perUser.set(userId, current + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      this.total--
      const remaining = (this.perUser.get(userId) ?? 1) - 1
      if (remaining) this.perUser.set(userId, remaining)
      else this.perUser.delete(userId)
    }
  }
}
