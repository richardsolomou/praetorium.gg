import { randomId } from 'ras-stack/auth'
import { listUnitCount } from '../../core/attachedUnits'
import type { FormatRuleId, OptionalRuleId, Secondary, Stratagem } from '../../core/battle'
import type { CollectionImportRow, CollectionProgress } from '../../core/collection'
import type { RosterPick } from '../../core/roster'
import type { RosterSource, RosterVisibility } from '../../core/savedRoster'
import type { RepositoryPort } from '../spacetimeRepository'
import { picksSchema } from '../../contracts/schemas'
import { optionalRulesFrom, readerRosterFromRow, rosterFromRow, rosterRow, waivedRulesFrom } from '../rosterPersistence'
import { detachmentIds } from '../../core/savedRoster'
import { LOCKED_ROSTER_MESSAGE } from '../../core/rosterLock'
import { currentRosterIds } from '../../core/retiredCatalogueIds'
import type { RosterDiscoveryQuery } from '../../core/rosterDiscovery'
import { UNIT_LOADOUTS_MAX, type UnitLoadout } from '../../core/unitLoadouts'

type SavedPrep = {
  stratagems: Stratagem[]
  secondaries: Secondary[]
  remindersEnabled?: boolean
}
const PROFILE_ROSTER_LIMIT = 50

type SummaryRow = Awaited<ReturnType<RepositoryPort['rosterSummariesByUser']>>[number]
type FullRow = Awaited<ReturnType<RepositoryPort['rostersByUser']>>[number]

function rosterSummaries(rows: readonly (SummaryRow | FullRow)[]) {
  return rows.map((row) => {
    const picks = 'picks' in row ? picksSchema.parse(JSON.parse(row.picks)) : undefined
    const unitCount = 'unitCount' in row ? row.unitCount : listUnitCount(picks!)
    const identities = currentRosterIds({
      catalogueId: row.catalogueId,
      detachmentIds: detachmentIds(row.detachmentId),
      borrowedDetachmentId: row.borrowedDetachmentId,
      updatedAt: row.updatedAt,
      ...(picks ? { picks } : {}),
    })
    return {
      id: row.id,
      name: row.name,
      automaticName: row.automaticName,
      catalogueId: identities.catalogueId,
      detachmentIds: identities.detachmentIds,
      disposition: row.disposition,
      limit: row.limit,
      pointsBudget: row.pointsBudget ?? null,
      waivedRules: waivedRulesFrom(row.waivedRules),
      optionalRules: optionalRulesFrom(row.optionalRules),
      borrowedDetachmentId: identities.borrowedDetachmentId,
      baseRosterId: row.baseRosterId,
      locked: row.locked,
      archived: row.archived,
      visibility: row.visibility,
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      unitCount,
    }
  })
}

/** A variant's base can be private or unlisted, so another reader is never told which list it is. */
const readerSummaries = (rows: readonly FullRow[]) => rosterSummaries(rows).map((summary) => ({ ...summary, baseRosterId: null }))

export class RosterService {
  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
  ) {}

  async saveRoster(
    userId: string,
    roster: {
      id?: string
      name: string
      automaticName?: boolean
      catalogueId: string
      detachmentIds: readonly string[]
      disposition: string | null
      limit: number
      pointsBudget?: number | null
      picks: readonly RosterPick[]
      prep: SavedPrep | null
      waivedRules?: readonly FormatRuleId[]
      optionalRules?: readonly OptionalRuleId[]
      borrowedDetachmentId?: string | null
      /** Only read when the roster is created; a variant keeps its group for life. */
      baseRosterId?: string | null
      /** Only read when the roster is created: the roster this one was duplicated from. */
      copiedFromRosterId?: string | null
      visibility: RosterVisibility
      source: RosterSource
    },
  ) {
    const id = roster.id ?? randomId()
    const now = this.clock()
    const saved = await this.repository.saveRoster({
      ...rosterRow(roster),
      automaticName: roster.automaticName ?? false,
      id,
      userId,
      now,
    })
    if (!saved) throw new Response('you do not own this roster', { status: 403 })
    if (saved === 'locked') throw new Response(LOCKED_ROSTER_MESSAGE, { status: 409 })
    return { id, created: saved === 'inserted', updatedAt: await this.storedUpdatedAt(id, userId) }
  }

  /** A user's own saved lists, newest first. Their picks come back parsed. */
  async savedRosters(userId: string) {
    const rows = await this.repository.rostersByUser(userId)
    return rows.map((row) => rosterFromRow(row))
  }

  async savedRostersByIds(userId: string, ids: string[]) {
    const rows = await this.repository.rostersByIds(userId, ids)
    return rows.map((row) => rosterFromRow(row))
  }

  /** Every list in an owned roster's variant group, the base first. */
  async rosterGroup(userId: string, roster: { id: string; baseRosterId: string | null }) {
    return this.repository.rosterGroupByUser(userId, roster.baseRosterId ?? roster.id)
  }

  async savedRosterSummaries(userId: string) {
    return rosterSummaries(await this.repository.rosterSummariesByUser(userId))
  }

  async homeRosters(userId: string) {
    const { count, rows } = await this.repository.homeRostersByUser(userId)
    return { count, summaries: rosterSummaries(rows), priceable: rows.map((row) => rosterFromRow(row)) }
  }

  /** Public profile rosters exclude private and unlisted lists. Return priceable picks separately from summaries so they stay server-side. */
  async publicRosters(userId: string) {
    const rows = await this.repository.publicRostersByUser(userId, PROFILE_ROSTER_LIMIT)
    return { summaries: readerSummaries(rows), priceable: rows.map((row) => rosterFromRow(row)) }
  }

  /** Public rosters anyone can find, newest save first, named and pictured for their owner; a roster whose owner has no account is left out. */
  async discoverRosters(query: RosterDiscoveryQuery) {
    const { rows, total, nextCursor } = await this.repository.discoverRosters(query)
    const owners = await this.repository.profilesByIds(rows.map((row) => row.userId))
    const owned = rows.filter((row) => owners.has(row.userId))
    const summaries = readerSummaries(owned)
    return {
      rosters: owned.map((row, index) => ({ summary: summaries[index]!, owner: owners.get(row.userId)!, priceable: rosterFromRow(row) })),
      total: total ?? null,
      nextCursor,
    }
  }

  /** An opaque roster id grants unlisted or public access; private access requires ownership, a friend's loan, or a named battle whose seated reader can already see the snapshot. */
  async rosterAccess(id: string, userId: string | null = null, token: string | null = null) {
    const row = await this.repository.roster(id)
    if (!row) return null
    if (row.userId === userId) return { roster: rosterFromRow(row, true), editable: true }
    // Named rather than "anything but private", so a value added later is refused
    // until somebody decides it should not be.
    if (row.visibility === 'unlisted' || row.visibility === 'public') return { roster: readerRosterFromRow(row), editable: false }
    const lender = userId ? await this.lender(id, userId) : null
    if (lender) return { roster: readerRosterFromRow(row), editable: false, lentBy: lender }
    if (!userId || !token) return null
    return (await this.fieldedIn(token, userId, id)) ? { roster: readerRosterFromRow(row), editable: false } : null
  }

  /** The roster a copy was made from, named only while this reader may still open it. */
  async copySource(id: string | null, userId: string | null) {
    if (!id || !(await this.rosterAccess(id, userId))) return null
    const row = await this.repository.roster(id)
    const owner = row ? (await this.repository.namesByIds([row.userId])).get(row.userId) : undefined
    return row && owner ? { id, name: row.name, ownerId: row.userId, ownerName: owner.name } : null
  }

  async sharedRoster(id: string, userId: string | null = null, token: string | null = null) {
    return (await this.rosterAccess(id, userId, token))?.roster ?? null
  }

  /** Whether a reader shares a battle with the list they are asking about. */
  private async fieldedIn(token: string, userId: string, rosterId: string) {
    const history = await this.repository.battleHistoryByToken(token)
    if (!history?.players.some((player) => player.id === userId)) return false
    return history.log.some((entry) => entry.command.kind === 'attach-roster' && entry.command.roster.id === rosterId)
  }

  async setRosterVisibility(userId: string, id: string, visibility: RosterVisibility) {
    if (!(await this.repository.setRosterVisibility(id, userId, visibility, this.clock()))) {
      throw new Response('you do not own this roster', { status: 403 })
    }
  }

  async setRosterLocked(userId: string, id: string, locked: boolean) {
    if (!(await this.repository.setRosterLocked(id, userId, locked, this.clock())))
      throw new Response('you do not own this roster', { status: 403 })
    return { updatedAt: await this.storedUpdatedAt(id, userId) }
  }

  async setRosterArchived(userId: string, id: string, archived: boolean) {
    if (!(await this.repository.setRosterArchived(id, userId, archived, this.clock())))
      throw new Response('you do not own this roster', { status: 403 })
    return { updatedAt: await this.storedUpdatedAt(id, userId) }
  }

  private async storedUpdatedAt(id: string, userId: string) {
    const stored = await this.repository.roster(id)
    if (!stored || stored.userId !== userId) throw new Response('the saved roster is no longer available', { status: 409 })
    return stored.updatedAt
  }

  async deleteRoster(userId: string, id: string) {
    await this.repository.deleteRoster(id, userId)
  }

  /**
   * A roster this player may field: their own, or one a friend has lent them. A lent roster is read
   * as any other reader would read it, so the owner's unit notes and battle preparation stay theirs.
   */
  async usableRoster(userId: string, id: string) {
    const usable = await this.repository.usableRoster(id, userId)
    if (!usable) return null
    if (!usable.lentBy) return { roster: rosterFromRow(usable.roster, true), lentBy: null }
    const lender = await this.named(usable.lentBy)
    return lender ? { roster: readerRosterFromRow(usable.roster), lentBy: lender } : null
  }

  /** The friend lending this reader a roster they do not own. */
  private async lender(id: string, userId: string) {
    const lentBy = (await this.repository.usableRoster(id, userId))?.lentBy
    return lentBy ? this.named(lentBy) : null
  }

  private async named(userId: string) {
    const named = (await this.repository.namesByIds([userId])).get(userId)
    return named ? { id: named.id, name: named.name } : null
  }

  async lendRoster(ownerId: string, rosterId: string, borrowerId: string) {
    const outcome = await this.repository.lendRoster(rosterId, ownerId, borrowerId, this.clock())
    if (outcome === 'forbidden') throw new Response('you do not own this roster', { status: 403 })
    if (outcome === 'not-friends') throw new Response('you can only lend a roster to a friend', { status: 409 })
    if (outcome === 'too-many') throw new Response('this roster is lent to too many players', { status: 409 })
  }

  /** The owner revokes a loan, or the borrower hands it back. */
  async endRosterLoan(userId: string, rosterId: string, borrowerId: string) {
    if (!(await this.repository.endRosterLoan(rosterId, userId, borrowerId))) throw new Response('this roster is not lent', { status: 404 })
  }

  async rosterLoans(ownerId: string, rosterId: string) {
    return (await this.repository.rosterLoansByRoster(rosterId, ownerId)).map(({ borrowerId, lentAt }) => ({ borrowerId, lentAt }))
  }

  /** Rosters friends have lent this player, named for their owner; a roster whose owner has no account is left out. Priceable picks stay server-side. */
  async rostersLentTo(userId: string) {
    const rows = await this.repository.rostersLentTo(userId)
    const owners = await this.repository.namesByIds(rows.map((row) => row.ownerId))
    const lent = rows.filter((row) => owners.has(row.ownerId))
    const summaries = rosterSummaries(lent)
    return lent.map((row, index) => ({
      summary: summaries[index]!,
      owner: owners.get(row.ownerId)!,
      lentAt: row.lentAt,
      priceable: rosterFromRow({ ...row, userId: row.ownerId, prep: null, tags: '[]', copiedFromRosterId: null }),
    }))
  }

  /** The datasheets a user owns, as a set the picker can ask about directly. */
  async collection(userId: string) {
    const rows = await this.repository.collectionByUser(userId)
    return rows.map((row) => row.entryId)
  }

  async setOwned(userId: string, entryId: string, owned: boolean) {
    if (owned) await this.repository.addToCollection({ userId, entryId, now: this.clock() })
    else await this.repository.removeFromCollection(userId, entryId)
  }

  async collectionCounts(userId: string): Promise<Record<string, number>> {
    const rows = await this.repository.collectionByUser(userId)
    return Object.fromEntries(rows.map((row) => [row.entryId, row.models]))
  }

  async collectionProgress(userId: string): Promise<Record<string, CollectionProgress>> {
    const rows = await this.repository.collectionByUser(userId)
    return Object.fromEntries(rows.flatMap((row) => (row.built ? [[row.entryId, { built: row.built, painted: row.painted }]] : [])))
  }

  async setCollectionProgress(userId: string, entryId: string, progress: CollectionProgress) {
    await this.repository.setCollectionProgress({ userId, entryId, ...progress })
  }

  async collectionCountsAs(userId: string): Promise<Record<string, string[]>> {
    const rows = await this.repository.collectionByUser(userId)
    return Object.fromEntries(rows.flatMap((row) => (row.countsAs.length ? [[row.entryId, row.countsAs]] : [])))
  }

  async setCollectionCountsAs(userId: string, entryId: string, countsAs: string[]) {
    await this.repository.setCollectionCountsAs({ userId, entryId, countsAs })
  }

  async collectionWishes(userId: string): Promise<Record<string, number>> {
    const rows = await this.repository.collectionWishesByUser(userId)
    return Object.fromEntries(rows.map((row) => [row.entryId, row.wanted]))
  }

  async setCollectionWanted(userId: string, entryId: string, wanted: number) {
    await this.repository.setCollectionWanted({ userId, entryId, wanted, now: this.clock() })
  }

  importCollection(userId: string, rows: CollectionImportRow[], replace: boolean) {
    return this.repository.importCollection({ userId, rows, replace, now: this.clock() })
  }

  async collectionPhotos(userId: string): Promise<Record<string, string[]>> {
    const rows = await this.repository.collectionByUser(userId)
    return Object.fromEntries(rows.flatMap((row) => (row.photoIds ? [[row.entryId, row.photoIds]] : [])))
  }

  async collectionPhotoShows(userId: string): Promise<Record<string, string>> {
    const rows = await this.repository.collectionByUser(userId)
    return Object.assign({}, ...rows.map((row) => row.photoShows))
  }

  async setCollectionModels(userId: string, entryId: string, models: number) {
    await this.repository.setCollectionModels({ userId, entryId, models, now: this.clock() })
  }

  async favouriteFactions(userId: string) {
    const rows = await this.repository.favouriteFactionsByUser(userId)
    return rows.map((row) => row.catalogueId)
  }

  async setFavouriteFaction(userId: string, catalogueId: string, favourite: boolean) {
    if (favourite) await this.repository.addFavouriteFaction({ userId, catalogueId, now: this.clock() })
    else await this.repository.removeFavouriteFaction(userId, catalogueId)
  }

  unitLoadouts(userId: string) {
    return this.repository.unitLoadoutsByUser(userId)
  }

  async saveUnitLoadout(userId: string, { id, ...loadout }: UnitLoadout & { id: string }) {
    const outcome = await this.repository.saveUnitLoadout(id, userId, loadout, this.clock())
    if (outcome === 'full') throw new Response(`You can keep up to ${UNIT_LOADOUTS_MAX} saved loadouts. Delete one first.`, { status: 409 })
    if (outcome === 'refused') throw new Response('you do not own this loadout', { status: 403 })
  }

  async renameUnitLoadout(userId: string, id: string, name: string) {
    if (!(await this.repository.renameUnitLoadout(id, userId, name)))
      throw new Response('That loadout is no longer saved.', { status: 404 })
  }

  async deleteUnitLoadout(userId: string, id: string) {
    await this.repository.deleteUnitLoadout(id, userId)
  }

  async favouriteDatasheets(userId: string) {
    const rows = await this.repository.favouriteDatasheetsByUser(userId)
    return rows.map((row) => row.entryId)
  }

  async setFavouriteDatasheet(userId: string, entryId: string, favourite: boolean) {
    if (favourite) await this.repository.addFavouriteDatasheet({ userId, entryId, now: this.clock() })
    else await this.repository.removeFavouriteDatasheet(userId, entryId)
  }

  async favouriteDetachments(userId: string) {
    const rows = await this.repository.favouriteDetachmentsByUser(userId)
    return rows.map(({ catalogueId, detachmentId }) => ({ catalogueId, detachmentId }))
  }

  async setFavouriteDetachment(userId: string, catalogueId: string, detachmentId: string, favourite: boolean) {
    if (favourite) await this.repository.addFavouriteDetachment({ userId, catalogueId, detachmentId, now: this.clock() })
    else await this.repository.removeFavouriteDetachment(userId, catalogueId, detachmentId)
  }
}
