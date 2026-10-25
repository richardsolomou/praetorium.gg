/** Why a worker gave no answer: it threw, sent one that could not be read, or stayed silent past its deadline. */
export class WorkerFailure extends Error {
  constructor(readonly reason: 'error' | 'unreadable' | 'timeout') {
    super(`The worker gave no answer (${reason}).`)
  }
}

/**
 * Posts `message` and settles with the worker's next answer, rejecting with a `WorkerFailure`, or with `signal`'s
 * reason once it aborts. The worker's handlers are cleared when it settles, so it can be asked again.
 */
export function workerAnswer<T>(
  worker: Worker,
  message: unknown,
  { timeoutMs, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
) {
  return new Promise<T>((resolve, reject) => {
    signal?.throwIfAborted()
    const settle = (finish: () => void) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', aborted)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      finish()
    }
    const aborted = () => settle(() => reject(signal!.reason))
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => settle(() => reject(new WorkerFailure('timeout'))), timeoutMs)
    signal?.addEventListener('abort', aborted, { once: true })
    worker.onmessage = (event: MessageEvent<T>) => settle(() => resolve(event.data))
    worker.onerror = () => settle(() => reject(new WorkerFailure('error')))
    worker.onmessageerror = () => settle(() => reject(new WorkerFailure('unreadable')))
    worker.postMessage(message)
  })
}
