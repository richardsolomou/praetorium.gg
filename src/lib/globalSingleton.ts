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
