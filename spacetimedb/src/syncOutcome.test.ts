import { expect, it } from 'vitest'
import { productSyncRefusal } from './syncOutcome'

it('acknowledges a league roster sealed by the queued submission', () => {
  expect(productSyncRefusal('league_command', { outcome: 'sealed', format: '1v1', requiredLimit: 2000 })).toBeNull()
})
it('refuses a league settings change blocked by a sealed roster', () => {
  expect(productSyncRefusal('league_command', 'sealed')).toBe('The server declined this action (sealed).')
})
it.each([true, false])('acknowledges the saved push preference %s', (enabled) => {
  expect(productSyncRefusal('set_push_enabled', enabled)).toBeNull()
})
it.each(['request_friend', 'accept_friend', 'reject_friend', 'remove_friend'])('retains a refused %s', (name) => {
  expect(productSyncRefusal(name, false)).toBe('The server declined this action (no longer available).')
})
it.each(['cancel_friend_invite', 'remove_battle'])('acknowledges an already absent resource for %s', (name) => {
  expect(productSyncRefusal(name, false)).toBeNull()
})
it('retains a league submission with an invalid size as refused', () => {
  expect(productSyncRefusal('league_command', { outcome: 'wrong-limit' })).toBe('The server declined this action (wrong-limit).')
})
