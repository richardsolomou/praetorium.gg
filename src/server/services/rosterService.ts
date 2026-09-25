import { randomId } from 'ras-stack/auth'
import { attachedUnitCount } from '../../core/attachedUnits'
import type { FormatRuleId, OptionalRuleId, Secondary, Stratagem } from '../../core/battle'
import type { RosterPick } from '../../core/roster'
import type { RosterSource, RosterVisibility } from '../../core/savedRoster'
import type { RosterReminder } from '../../core/reminders'
import type { Repository } from '../../db/repository'
import { picksSchema } from '../schemas'
import { detachmentIds, optionalRulesFrom, rosterFromRow, waivedRulesFrom } from '../rosterPersistence'

type SavedPrep = {
  stratagems: Stratagem[]
  secondaries: Secondary[]
  reminders?: RosterReminder[]
  remindersEnabled?: boolean
}
const PROFILE_ROSTER_LIMIT = 50

function rosterSummaries<T extends { detachmentId: string | null; waivedRules: string; optionalRules: string; picks: string }>(
  rows: readonly T[],
) {
  return rows.map(({ detachmentId, waivedRules, optionalRules, picks, ...row }) => {
    const units = picksSchema.parse(JSON.parse(picks))
    return {
      ...row,
      detachmentIds: detachmentIds(detachmentId),
      waivedRules: waivedRulesFrom(waivedRules),
      optionalRules: optionalRulesFrom(optionalRules),
      unitCount: attachedUnitCount(units.map((unit, key) => ({ key, attachedTo: unit.attachedTo }))),
    }
  })
}

export class RosterService {
  constructor(
    private readonly repository: Repository,
    private readonly clock: () => number,
  ) {}

  async saveRoster(
    userId: string,
    roster: {
      id?: string
      name: string
      catalogueId: string
      detachmentIds: readonly string[]
      disposition: string | null
      limit: number
      picks: readonly RosterPick[]
      prep: SavedPrep | null
      waivedRules?: readonly FormatRuleId[]
      optionalRules?: readonly OptionalRuleId[]
      borrowedDetachmentId?: string | null
      visibility: RosterVisibility
      source: RosterSource
    },
  ) {
    const id = roster.id ?? randomId()
    const saved = await this.repository.saveRoster({
      ...roster,
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
      now: this.clock(),
    })
    if (!saved) throw new Response('you do not own this roster', { status: 403 })
    return { id, created: saved === 'inserted' }
  }

  /** A user's own saved lists, newest first. Their picks come back parsed. */
  async savedRosters(userId: string) {
    const rows = await this.repository.rostersByUser(userId)
    return rows.map((row) => rosterFromRow(row, true))
  }

  async savedRosterSummaries(userId: string) {
    return rosterSummaries(await this.repository.rosterSummariesByUser(userId))
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
