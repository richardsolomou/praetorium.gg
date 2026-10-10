import { z } from 'zod'

export const MAX_APP_SNAPSHOT_BYTES = 10_000_000
export const MAX_APP_SNAPSHOT_QUERIES = 500
export const PUBLIC_APP_QUERIES = new Set(['public-battles', 'standings', 'catalogue-changes', 'reference-changes'])
export const PUBLIC_REFERENCE_QUERIES = new Set([
  'faction',
  'faction-index',
  'combat-units',
  'faction-datasheets',
  'game-references',
  'terrain-references',
  'datasheet-slug',
  'detachment-detail',
  'disposition-detachments',
  'deployments',
  'rule-index',
  'rule-section',
  'catalogue-status',
])
export const APP_SNAPSHOT_QUERIES = new Set([
  ...PUBLIC_APP_QUERIES,
  'me',
  'home-rosters',
  'saved-roster-summaries',
  'saved-roster-page',
  'roster-bootstrap',
  'roster-access',
  'roster-changes',
  'saved-roster-changed-count',
  'price',
  'shared-roster',
  'saved-roster-loadout-datasheets',
  'outdated-league-entries',
  'battles',
  'battle',
  'report',
  'friend-battles',
  'friendships',
  'leagues',
  'league',
  'league-roster',
  'league-battles',
  'collection',
  'favourite-factions',
  'favourite-detachments',
  'onboarding',
  'player-defaults',
  'battle-audience',
  'opponents',
  'user-profile',
  'player-profile',
  'player-rosters',
  'player-rankings',
  'units',
  'datasheet',
  'loadout-datasheets',
  'detachment-rules',
])

const snapshotSchema = z.object({
  version: z.literal(1),
  owner: z.string().min(1).max(256).nullable(),
  queries: z
    .array(z.object({ key: z.array(z.unknown()).min(1), data: z.unknown(), updatedAt: z.number().nonnegative() }))
    .max(MAX_APP_SNAPSHOT_QUERIES),
})
export type AppSnapshot = z.infer<typeof snapshotSchema>

export function parseAppSnapshot(value: unknown): AppSnapshot | null {
  const result = snapshotSchema.safeParse(value)
  if (!result.success) return null
  const snapshot = result.data
  const me = snapshot.queries.find((query) => query.key[0] === 'me')?.data as { id?: unknown; impersonatedBy?: unknown } | null | undefined
  if (snapshot.owner ? me?.id !== snapshot.owner || Boolean(me.impersonatedBy) : me != null) return null
  if (
    snapshot.queries.some(
      (query) =>
        !APP_SNAPSHOT_QUERIES.has(String(query.key[0])) ||
        (!snapshot.owner && query.key[0] !== 'me' && !PUBLIC_APP_QUERIES.has(String(query.key[0]))),
    )
  )
    return null
  return snapshot
}
