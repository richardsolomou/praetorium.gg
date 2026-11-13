import { z } from 'zod'
import { ROSTER_SOURCES, ROSTER_VISIBILITIES, type RosterSource, type RosterVisibility } from '../../core/savedRoster'
import { ROSTER_LIBRARY_BATCH_SIZE, type RosterBatchAction } from '../../core/rosterLibrary'
import { ROSTER_DISCOVERY_MAX_PAGE_SIZE, rosterDiscoveryCursorSchema, type RosterDiscoveryQuery } from '../../core/rosterDiscovery'
import type { RosterPointsMark } from '../../core/rosterPointsMarks'
import type { SpacetimeBase } from './client'

// Module results drop fields this build does not know, so a replica still on the previous build keeps
// reading after a newer module appends a column or result field.
const rosterRow = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  automaticName: z.boolean(),
  catalogueId: z.string(),
  detachmentId: z.string().nullable(),
  disposition: z.string().nullable(),
  limit: z.number().int(),
  pointsBudget: z.number().int().nullable(),
  picks: z.string(),
  prep: z.string().nullable(),
  tags: z.string(),
  waivedRules: z.string(),
  optionalRules: z.string(),
  borrowedDetachmentId: z.string().nullable(),
  baseRosterId: z.string().nullable(),
  locked: z.boolean(),
  // Rows saved before archiving existed hold no value, which reads as active.
  archived: z
    .boolean()
    .nullish()
    .transform((archived) => archived === true),
  copiedFromRosterId: z.string().nullable(),
  visibility: z.enum(ROSTER_VISIBILITIES),
  source: z.enum(ROSTER_SOURCES),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

const rosterPointsMark = z.object({
  rosterId: z.string(),
  userId: z.string(),
  revision: z.string(),
  updatedAt: z.number().int(),
  points: z.number().int(),
})

const rosterSummaryRow = rosterRow.omit({ userId: true, picks: true, prep: true, tags: true, copiedFromRosterId: true }).extend({
  unitCount: z.number().int().nonnegative(),
})
const lentRosterRow = rosterSummaryRow.extend({ ownerId: z.string(), lentAt: z.number().int(), picks: z.string() })

type SaveRosterInput = {
  id: string
  userId: string
  name: string
  automaticName?: boolean
  catalogueId: string
  detachmentId: string | null
  disposition: string | null
  limit: number
  /** Omitted by a client that predates custom budgets, which keeps the stored budget. */
  pointsBudget?: number | null
  picks: string
  prep: string | null
  tags: string
  waivedRules: string
  optionalRules?: string
  borrowedDetachmentId?: string | null
  baseRosterId?: string | null
  copiedFromRosterId?: string | null
  visibility: RosterVisibility
  source: RosterSource
  now: number
}

export function withRosters<B extends SpacetimeBase>(Base: B) {
  return class RosterOperations extends Base {
    async roster(id: string) {
      return (await this.read('roster_by_id', [id], rosterRow.nullable())) ?? undefined
    }

    async rostersByUser(userId: string) {
      return this.readRosters(userId, false, 1_000)
    }

    async rostersByIds(userId: string, ids: string[]) {
      return this.read('rosters_by_ids', [userId, ids], z.array(rosterRow).max(ROSTER_LIBRARY_BATCH_SIZE))
    }

    async homeRostersByUser(userId: string) {
      return this.read(
        'home_rosters_by_user',
        [userId],
        z.object({ count: z.number().int().nonnegative(), rows: z.array(rosterRow).max(5) }),
      )
    }

    async publicRostersByUser(userId: string, limit: number) {
      return this.readRosters(userId, true, limit)
    }

    async discoverRosters(query: RosterDiscoveryQuery) {
      return this.read(
        'discover_rosters',
        [JSON.stringify(query)],
        z.object({
          rows: z.array(rosterRow).max(ROSTER_DISCOVERY_MAX_PAGE_SIZE),
          // A module published before the count was added answers without it.
          total: z.number().int().nonnegative(),
          nextCursor: rosterDiscoveryCursorSchema.nullable(),
          groups: z
            .array(
              z.object({
                catalogueId: z.string(),
                detachmentId: z.string().nullable(),
                limit: z.number().int(),
                disposition: z.string().nullable(),
                ownerId: z.string().nullable(),
                count: z.number().int().positive(),
              }),
            )
            .optional(),
        }),
      )
    }

    /** The base first, then its variants in the order they were made. */
    async rosterGroupByUser(userId: string, baseRosterId: string) {
      return this.read(
        'roster_group_by_user',
        [userId, baseRosterId],
        z.array(z.object({ id: z.string(), name: z.string(), automaticName: z.boolean().nullable() })).max(1_000),
      )
    }

    async rosterSummariesByUser(userId: string) {
      return this.read('roster_summaries_by_user', [userId], z.array(rosterSummaryRow).max(1_000))
    }

    private async readRosters(userId: string, publicOnly: boolean, limit: number) {
      return this.read('rosters_by_user', [userId, publicOnly, limit], z.array(rosterRow))
    }

    async syncRoster(input: { row: string; operationId: string; fingerprint: string; expectedVersion: number | null; deleted: boolean }) {
      return this.read(
        'sync_roster',
        [JSON.stringify(input)],
        z.discriminatedUnion('outcome', [
          z.object({
            outcome: z.literal('applied'),
            version: z.number().int().nonnegative(),
            deleted: z.boolean(),
            lifecycle: z.enum(['created', 'deleted']).nullable(),
          }),
          z.object({
            outcome: z.enum(['conflict', 'refused']),
            cause: z.enum(['not-owned', 'locked', 'stale', 'exists', 'deleted']).optional(),
            message: z.string(),
          }),
        ]),
      )
    }

    async saveRoster(input: SaveRosterInput) {
      const outcome = await this.reply(
        'save_roster',
        [
          JSON.stringify({
            ...input,
            optionalRules: input.optionalRules ?? '[]',
            borrowedDetachmentId: input.borrowedDetachmentId ?? null,
          }),
        ],
        z.enum(['inserted', 'updated', 'forbidden', 'locked']),
      )
      return outcome === 'forbidden' ? null : outcome
    }

    async setRosterVisibility(id: string, userId: string, visibility: RosterVisibility, now: number) {
      return this.reply('set_roster_visibility', [id, userId, visibility, now], z.boolean())
    }

    async setRosterLocked(id: string, userId: string, locked: boolean, now: number) {
      return this.reply('set_roster_locked', [id, userId, locked, now], z.boolean())
    }

    async setRosterArchived(id: string, userId: string, archived: boolean, now: number) {
      return this.reply('set_roster_archived', [id, userId, archived, now], z.boolean())
    }

    async splitRosterVariant(id: string, userId: string, now: number) {
      return this.reply('split_roster_variant', [id, userId, now], z.boolean())
    }

    /** Each roster's new version, or null when one is not the player's and none changed. */
    async changeRosters(ids: readonly string[], userId: string, action: RosterBatchAction, now: number) {
      return this.read(
        'change_rosters',
        [[...ids], userId, action, now],
        z.array(z.object({ id: z.string(), updatedAt: z.number().int().nonnegative() })).nullable(),
      )
    }

    async deleteRoster(id: string, userId: string) {
      await this.call('delete_roster', [id, userId])
    }

    async lendRoster(rosterId: string, ownerId: string, borrowerId: string, now: number) {
      return this.reply('lend_roster', [rosterId, ownerId, borrowerId, now], z.enum(['lent', 'forbidden', 'not-friends', 'too-many']))
    }

    async endRosterLoan(rosterId: string, userId: string, borrowerId: string) {
      return this.reply('end_roster_loan', [rosterId, userId, borrowerId], z.boolean())
    }

    async rosterLoansByRoster(rosterId: string, ownerId: string) {
      return this.read(
        'roster_loans_by_roster',
        [rosterId, ownerId],
        z.array(z.object({ borrowerId: z.string(), lentAt: z.number().int() })),
      )
    }

    async usableRoster(id: string, userId: string) {
      return this.read('usable_roster', [id, userId], z.object({ roster: rosterRow, lentBy: z.string().nullable() }).nullable())
    }

    async rostersLentTo(userId: string) {
      return this.read('rosters_lent_to', [userId], z.array(lentRosterRow).max(1_000))
    }

    async pushRosters(after: string, limit: number) {
      return this.read('push_rosters', [after, limit], z.object({ rosters: z.array(rosterRow), next: z.string().nullable() }))
    }

    async replaceRosterPointsMarks(catalogueRevision: string, marks: readonly RosterPointsMark[]) {
      if (!marks.length) return []
      return this.read('replace_roster_points_marks', [catalogueRevision, JSON.stringify(marks)], z.array(rosterPointsMark))
    }
  }
}
