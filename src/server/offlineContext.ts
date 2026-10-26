import { SYNC_PRODUCT_ACTION_NAMES } from '../core/syncProductActions'
import { AsyncLocalStorage } from 'node:async_hooks'
import { globalSingleton } from 'ras-stack/server'

type OfflineContext = {
  id: string
  owner: string
  fingerprint: string
  createdAt: number
  identifiers: Record<string, string>
  wrote: boolean
  applied?: boolean
}
export const offlineContext = globalSingleton('praetorium.offline-context', () => new AsyncLocalStorage<OfflineContext>())
export function offlineIdentifier(name: string, generate: () => string) {
  const context = offlineContext.getStore()
  if (!context) return generate()
  const id = context.identifiers[name]
  if (!id) throw new Error(`The saved action is missing its ${name} identifier.`)
  return id
}
export const SYNC_PRODUCT_ACTIONS = new Set<string>(SYNC_PRODUCT_ACTION_NAMES)
