import { randomId } from 'ras-stack/auth'
import { attachedUnitCount } from '../../core/attachedUnits'
import type { FormatRuleId, OptionalRuleId, Secondary, Stratagem } from '../../core/battle'
import type { RosterPick } from '../../core/roster'
import type { RosterSource, RosterVisibility } from '../../core/savedRoster'
import type { RosterReminder } from '../../core/reminders'
import type { RepositoryPort } from '../spacetimeRepository'
import { picksSchema } from '../schemas'
import { detachmentIds, optionalRulesFrom, rosterFromRow, waivedRulesFrom } from '../rosterPersistence'
import { currentRosterIds } from '../../core/retiredCatalogueIds'

type SavedPrep = {
  stratagems: Stratagem[]
  secondaries: Secondary[]
  reminders?: RosterReminder[]
  remindersEnabled?: boolean
}
const PROFILE_ROSTER_LIMIT = 50

type SummaryRow = Awaited<ReturnType<RepositoryPort['rosterSummariesByUser']>>[number]
type FullRow = Awaited<ReturnType<RepositoryPort['rostersByUser']>>[number]

function rosterSummaries(rows: readonly (SummaryRow | FullRow)[]) {
  return rows.map((row) => {
    const unitCount =
      'unitCount' in row
        ? row.unitCount
        : attachedUnitCount(picksSchema.parse(JSON.parse(row.picks)).map((unit, key) => ({ key, attachedTo: unit.attachedTo })))
    return currentRosterIds({
      id: row.id,
      name: row.name,
      automaticName: row.automaticName ?? !row.name,
      catalogueId: row.catalogueId,
      detachmentIds: detachmentIds(row.detachmentId),
      disposition: row.disposition,
      limit: row.limit,
      waivedRules: waivedRulesFrom(row.waivedRules),
      optionalRules: optionalRulesFrom(row.optionalRules),
      borrowedDetachmentId: row.borrowedDetachmentId,
      baseRosterId: row.baseRosterId,
      visibility: row.visibility,
      source: row.source,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      unitCount,
    })
  })
}

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
      picks: readonly RosterPick[]
      prep: SavedPrep | null
      waivedRules?: readonly FormatRuleId[]
      optionalRules?: readonly OptionalRuleId[]
      borrowedDetachmentId?: string | null
      /** Only read when the roster is created; a variant keeps its group for life. */
      baseRosterId?: string | null
      visibility: RosterVisibility
      source: RosterSource
    },
  ) {
    const id = roster.id ?? randomId()
    const now = this.clock()
    const saved = await this.repository.saveRoster({
      ...roster,
      automaticName: roster.automaticName ?? false,
      detachmentId: JSON.stringify(roster.detachmentIds),
      id,
      userId,
      picks: JSON.stringify(roster.picks),
      prep: roster.prep
        ? JSON.stringify({
            ...roster.prep,
            reminders: roster.prep.reminders ?? [],
            remindersEnabled: roster.prep.remindersEnabled ?? true,
          })
        : null,
      tags: '[]',
      waivedRules: JSON.stringify(roster.waivedRules ?? []),
      optionalRules: JSON.stringify(roster.optionalRules ?? []),
      borrowedDetachmentId: roster.borrowedDetachmentId ?? null,
      baseRosterId: roster.baseRosterId ?? null,
      now,
    })
    if (!saved) throw new Response('you do not own this roster', { status: 403 })
    return { id, created: saved === 'inserted', updatedAt: now }
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
    const rows = await this.repository.rosterGroupByUser(userId, roster.baseRosterId ?? roster.id)
    return rows.map((row) => ({ ...row, automaticName: row.automaticName ?? !row.name }))
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
    return { summaries: rosterSummaries(rows), priceable: rows.map((row) => rosterFromRow(row)) }
  }

  /** An opaque roster id grants unlisted or public access; private access requires ownership or a named battle whose seated reader can already see the snapshot. */
  async rosterAccess(id: string, userId: string | null = null, token: string | null = null) {
    const row = await this.repository.roster(id)
    if (!row) return null
    if (row.userId === userId) return { roster: rosterFromRow(row, true), editable: true }
    // Named rather than "anything but private", so a value added later is refused
    // until somebody decides it should not be.
    if (row.visibility === 'unlisted' || row.visibility === 'public') return { roster: rosterFromRow(row), editable: false }
    if (!userId || !token) return null
    return (await this.fieldedIn(token, userId, id)) ? { roster: rosterFromRow(row), editable: false } : null
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

  async deleteRoster(userId: string, id: string) {
    await this.repository.deleteRoster(id, userId)
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

  async favouriteFactions(userId: string) {
    const rows = await this.repository.favouriteFactionsByUser(userId)
    return rows.map((row) => row.catalogueId)
  }

  async setFavouriteFaction(userId: string, catalogueId: string, favourite: boolean) {
    if (favourite) await this.repository.addFavouriteFaction({ userId, catalogueId, now: this.clock() })
    else await this.repository.removeFavouriteFaction(userId, catalogueId)
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
