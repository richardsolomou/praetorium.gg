import { and, desc, eq } from 'drizzle-orm'
import type { RosterSource, RosterVisibility } from '../../core/savedRoster'
import type { PraetoriumDatabase } from '../connection'
import { collection, favouriteDetachments, favouriteFactions, rosters } from '../schema'

export class RosterRepository {
  constructor(private readonly database: PraetoriumDatabase) {}

  async saveRoster(input: {
    id: string
    userId: string
    name: string
    catalogueId: string
    detachmentId: string | null
    disposition: string | null
    limit: number
    picks: string
    prep: string | null
    tags: string
    waivedRules: string
    optionalRules?: string
    borrowedDetachmentId?: string | null
    visibility: RosterVisibility
    source: RosterSource
    now: number
  }) {
    // Everything a later save may change. `id` identifies the row and `userId`
    // owns it, so neither is here: an upsert must not be able to reassign a list.
    const updatable = {
      name: input.name,
      catalogueId: input.catalogueId,
      detachmentId: input.detachmentId,
      disposition: input.disposition,
      limit: input.limit,
      picks: input.picks,
      prep: input.prep,
      tags: input.tags,
      waivedRules: input.waivedRules,
      optionalRules: input.optionalRules ?? '[]',
      borrowedDetachmentId: input.borrowedDetachmentId ?? null,
      visibility: input.visibility,
      source: input.source,
      updatedAt: input.now,
    }
    const updated = await this.database
      .update(rosters)
      .set(updatable)
      .where(and(eq(rosters.id, input.id), eq(rosters.userId, input.userId)))
      .returning({ id: rosters.id })
    if (updated.length) return true
    const inserted = await this.database
      .insert(rosters)
      .values({ id: input.id, userId: input.userId, createdAt: input.now, ...updatable })
      .onConflictDoNothing()
      .returning({ id: rosters.id })
    return inserted.length > 0
  }

  async rostersByUser(userId: string) {
    return this.database.select().from(rosters).where(eq(rosters.userId, userId)).orderBy(desc(rosters.createdAt))
  }

  /**
   * The lists this player has made public, newest first.
   *
   * The owner-and-date index answers it: this narrows to one player before it looks
   * at visibility, so no second index is needed. A private or unlisted list is
   * absent — unlisted means a link its owner handed somebody, not a list to find.
   */
  async publicRostersByUser(userId: string, limit: number) {
    return this.database
      .select()
      .from(rosters)
      .where(and(eq(rosters.userId, userId), eq(rosters.visibility, 'public')))
      .orderBy(desc(rosters.createdAt))
      .limit(limit)
  }

  async rosterSummariesByUser(userId: string) {
    return this.database
      .select({
        id: rosters.id,
        name: rosters.name,
        catalogueId: rosters.catalogueId,
        detachmentId: rosters.detachmentId,
        disposition: rosters.disposition,
        limit: rosters.limit,
        waivedRules: rosters.waivedRules,
        optionalRules: rosters.optionalRules,
        borrowedDetachmentId: rosters.borrowedDetachmentId,
        picks: rosters.picks,
        visibility: rosters.visibility,
        source: rosters.source,
        createdAt: rosters.createdAt,
        updatedAt: rosters.updatedAt,
      })
      .from(rosters)
      .where(eq(rosters.userId, userId))
      .orderBy(desc(rosters.createdAt))
  }

  async roster(id: string) {
    const [row] = await this.database.select().from(rosters).where(eq(rosters.id, id)).limit(1)
    return row
  }

  async setRosterVisibility(id: string, userId: string, visibility: RosterVisibility, now: number) {
    const updated = await this.database
      .update(rosters)
      .set({ visibility, updatedAt: now })
      .where(and(eq(rosters.id, id), eq(rosters.userId, userId)))
      .returning({ id: rosters.id })
    return updated.length > 0
  }

  /** The datasheets this player owns models for. */
  async collectionByUser(userId: string) {
    return this.database.select().from(collection).where(eq(collection.userId, userId))
  }

  /** Owning something twice is owning it once, so a repeat is not an error. */
  async addToCollection(input: { userId: string; entryId: string; now: number }) {
    await this.database.insert(collection).values({ userId: input.userId, entryId: input.entryId, at: input.now }).onConflictDoNothing()
  }

  async removeFromCollection(userId: string, entryId: string) {
    await this.database.delete(collection).where(and(eq(collection.userId, userId), eq(collection.entryId, entryId)))
  }

  async favouriteFactionsByUser(userId: string) {
    return this.database.select().from(favouriteFactions).where(eq(favouriteFactions.userId, userId))
  }

  async addFavouriteFaction(input: { userId: string; catalogueId: string; now: number }) {
    await this.database
      .insert(favouriteFactions)
      .values({ userId: input.userId, catalogueId: input.catalogueId, at: input.now })
      .onConflictDoNothing()
  }

  async removeFavouriteFaction(userId: string, catalogueId: string) {
    await this.database
      .delete(favouriteFactions)
      .where(and(eq(favouriteFactions.userId, userId), eq(favouriteFactions.catalogueId, catalogueId)))
  }

  async favouriteDetachmentsByUser(userId: string) {
    return this.database.select().from(favouriteDetachments).where(eq(favouriteDetachments.userId, userId))
  }

  async addFavouriteDetachment(input: { userId: string; catalogueId: string; detachmentId: string; now: number }) {
    await this.database
      .insert(favouriteDetachments)
      .values({ userId: input.userId, catalogueId: input.catalogueId, detachmentId: input.detachmentId, at: input.now })
      .onConflictDoNothing()
  }

  async removeFavouriteDetachment(userId: string, catalogueId: string, detachmentId: string) {
    await this.database
      .delete(favouriteDetachments)
      .where(
        and(
          eq(favouriteDetachments.userId, userId),
          eq(favouriteDetachments.catalogueId, catalogueId),
          eq(favouriteDetachments.detachmentId, detachmentId),
        ),
      )
  }

  async deleteRoster(id: string, userId: string) {
    await this.database.delete(rosters).where(and(eq(rosters.id, id), eq(rosters.userId, userId)))
  }
}
