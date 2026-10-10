import { AsyncLocalStorage } from 'node:async_hooks'
import { globalSingleton } from 'ras-stack/server'

type OfflineContext = {
  id: string
  owner: string
  fingerprint: string
  createdAt: number
  identifiers: Record<string, string>
  wrote: boolean
}
export const offlineContext = globalSingleton('praetorium.offline-context', () => new AsyncLocalStorage<OfflineContext>())
export function offlineIdentifier(name: string, generate: () => string) {
  const context = offlineContext.getStore()
  if (!context) return generate()
  const id = context.identifiers[name]
  if (!id) throw new Error(`The saved action is missing its ${name} identifier.`)
  return id
}
export const SYNC_PRODUCT_ACTIONS = new Set([
  'create_battle',
  'remove_battle',
  'request_friend',
  'accept_friend',
  'reject_friend',
  'remove_friend',
  'replace_friend_invite',
  'cancel_friend_invite',
  'accept_friend_invite',
  'set_battle_audience',
  'update_onboarding',
  'add_to_collection',
  'remove_from_collection',
  'add_favourite_faction',
  'remove_favourite_faction',
  'add_favourite_detachment',
  'remove_favourite_detachment',
  'set_push_enabled',
  'set_player_defaults',
  'league_command',
])
