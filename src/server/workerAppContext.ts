import { AsyncLocalStorage } from 'node:async_hooks'
import { globalSingleton } from 'ras-stack/server'

export const workerAppContext = globalSingleton(
  'praetorium.worker-app-context',
  () =>
    new AsyncLocalStorage<{
      app?: unknown
      previewWasm?: { resvg: WebAssembly.Module; yoga: WebAssembly.Module }
      waitUntil?: (promise: Promise<unknown>) => void
    }>(),
)

export function withWorkerAppContext<T>(
  work: () => T,
  context: { waitUntil: (promise: Promise<unknown>) => void },
  previewWasm?: { resvg: WebAssembly.Module; yoga: WebAssembly.Module },
): T {
  return workerAppContext.run({ previewWasm, waitUntil: (promise) => context.waitUntil(promise) }, work)
}
