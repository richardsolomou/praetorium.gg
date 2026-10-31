import { z } from 'zod'
import { predatesEventHosts } from './savedSealedEvents'

export const MAX_APP_SNAPSHOT_BYTES = 10_000_000
export const MAX_APP_SNAPSHOT_QUERIES = 500
export const PUBLIC_APP_QUERIES = new Set(['public-battles', 'standings', 'catalogue-changes', 'army-updates'])
export const PUBLIC_REFERENCE_QUERIES = new Set([
  'faction',
  'faction-index',
  'combat-units',
  'faction-datasheets',
  'game-references',
  'terrain-references',
  'datasheet-slug',
  'reference-changes',
  'detachment-detail',
  'disposition-detachments',
  'deployments',
  'rule-index',
  'rule-section',
  'text-sources',
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
  'saved-roster-changed-ids',
  'price',
  'shared-roster',
  'saved-roster-loadout-datasheets',
  'outdated-sealed-event-entries',
  'battles',
  'battle',
  'report',
  'friend-battles',
  'friendships',
  'groups',
  'group',
  'group-standings',
  'group-league',
  'sealed-events',
  'sealed-event',
  'sealed-event-roster',
  'sealed-event-battles',
  'collection',
  'collection-counts',
  'fielded-datasheets',
  'favourite-factions',
  'favourite-detachments',
  'favourite-datasheets',
  'unit-loadouts',
  'recent-matchups',
  'ability-reminders',
  'onboarding',
  'player-defaults',
  'opponents',
  'user-profile',
  'player-profile',
  'player-rosters',
  'player-rankings',
  'player-achievements',
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
  // Reference queries come from the download, and battle audience is retired; snapshots saved by earlier releases may still carry them.
  snapshot.queries = snapshot.queries.filter(
    (query) => !PUBLIC_REFERENCE_QUERIES.has(String(query.key[0])) && query.key[0] !== 'battle-audience',
  )
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
  snapshot.queries = snapshot.queries.filter(
    (query) =>
      !(query.key[0] === 'sealed-event' && query.key[2] !== 'results' && predatesEventHosts(query.data)) &&
      !(query.key[0] === 'sealed-events' && Array.isArray(query.data) && query.data.some(predatesEventHosts)),
  )
  return snapshot
}
