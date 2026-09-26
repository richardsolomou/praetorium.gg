import { AsyncLocalStorage } from 'node:async_hooks'
import { globalSingleton } from 'ras-stack/server'

export const workerAppContext = globalSingleton('praetorium.worker-app-context', () => new AsyncLocalStorage<{ app?: unknown }>())

export function withWorkerAppContext<T>(work: () => T): T {
  return workerAppContext.run({}, work)
}
