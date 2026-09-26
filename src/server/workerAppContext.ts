import { AsyncLocalStorage } from 'node:async_hooks'
import type { R2Bucket } from '@cloudflare/workers-types'
import { globalSingleton } from 'ras-stack/server'

export const workerAppContext = globalSingleton(
  'praetorium.worker-app-context',
  () =>
    new AsyncLocalStorage<{
      app?: unknown
      publicObjects?: R2Bucket
      previewWasm?: { resvg: WebAssembly.Module; yoga: WebAssembly.Module }
      waitUntil?: (promise: Promise<unknown>) => void
    }>(),
)

export function withWorkerAppContext<T>(
  work: () => T,
  context: { waitUntil: (promise: Promise<unknown>) => void },
  previewWasm?: { resvg: WebAssembly.Module; yoga: WebAssembly.Module },
  publicObjects?: R2Bucket,
): T {
  return workerAppContext.run({ previewWasm, publicObjects, waitUntil: (promise) => context.waitUntil(promise) }, work)
}
