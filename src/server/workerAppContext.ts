import { AsyncLocalStorage } from 'node:async_hooks'
import { globalSingleton } from 'ras-stack/server'

export const workerAppContext = globalSingleton(
  'praetorium.worker-app-context',
  () => new AsyncLocalStorage<{ app?: unknown; waitUntil?: (promise: Promise<unknown>) => void }>(),
)

export function withWorkerAppContext<T>(work: () => T, context: { waitUntil: (promise: Promise<unknown>) => void }): T {
  return workerAppContext.run({ waitUntil: (promise) => context.waitUntil(promise) }, work)
}
