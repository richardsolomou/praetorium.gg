const failures = new Set([
  'missing',
  'forbidden',
  'closed',
  'sealed',
  'too-small',
  'open',
  'team-minimum',
  'below-accepted',
  'full',
  'not-friends',
  'wrong-format',
  'wrong-limit',
  'unassigned',
  'invalid-warlords',
  'not-ready',
  'not-revealed',
  'self',
  'already-friends',
])

export function productSyncRefusal(name: string, result: unknown): string | null {
  if (name === 'set_push_enabled') return null
  const outcome =
    typeof result === 'string' ? result : result && typeof result === 'object' && 'outcome' in result ? String(result.outcome) : null
  if (name === 'league_command' && typeof result === 'object' && outcome === 'sealed') return null
  if ((outcome !== null && failures.has(outcome)) || (result === false && !['cancel_friend_invite', 'remove_battle'].includes(name)))
    return `The server declined this action (${outcome ?? 'no longer available'}).`
  return null
}
