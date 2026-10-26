/**
 * Runs `task` over `items` with at most `limit` running at once. A failure, or `signal` aborting,
 * starts no further tasks; the first failure is thrown once the tasks already running settle.
 */
export async function forEachConcurrently<T>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
) {
  let next = 0
  let failure: { error: unknown } | undefined
  const worker = async () => {
    while (next < items.length && !failure) {
      if (signal?.aborted) return
      const index = next++
      try {
        await task(items[index]!, index)
      } catch (error) {
        failure ??= { error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (failure) throw failure.error
}
