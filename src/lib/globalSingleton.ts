const storeKey = Symbol.for('praetorium.singletons')
type SingletonGlobal = typeof globalThis & { [storeKey]?: Map<string, unknown> }

/**
 * One value per process, kept on `globalThis` under a registered symbol: Vite's development reloads reuse it, and so do
 * Nitro plugins, which are bundled apart from the server code that serves requests.
 */
export function globalSingleton<T>(key: string, create: () => T): T {
  const scope = globalThis as SingletonGlobal
  const singletons = (scope[storeKey] ??= new Map())
  if (!singletons.has(key)) singletons.set(key, create())
  return singletons.get(key) as T
}

/**
 * Shuts down every singleton that has a `shutdown`, such as the PostHog clients, giving each the same deadline. Callers
 * reach them through the shared store, so a Nitro plugin does not bundle the modules that create them.
 */
export async function shutDownGlobalSingletons(timeoutMs: number) {
  const values = [...((globalThis as SingletonGlobal)[storeKey]?.values() ?? [])]
  const closing = values.filter(
    (value): value is { shutdown: (timeoutMs: number) => Promise<unknown> } =>
      typeof (value as { shutdown?: unknown } | null)?.shutdown === 'function',
  )
  const results = await Promise.allSettled(closing.map((value) => value.shutdown(timeoutMs)))
  for (const result of results) if (result.status === 'rejected') console.error({ event: 'shutdown_failed', error: result.reason })
}
