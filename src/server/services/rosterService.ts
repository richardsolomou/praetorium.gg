import { randomId } from 'ras-stack/auth'
import { attachedUnitCount } from '../../core/attachedUnits'
import type { FormatRuleId, OptionalRuleId, Secondary, Stratagem } from '../../core/battle'
import type { RosterPick } from '../../core/roster'
import type { RosterSource, RosterVisibility } from '../../core/savedRoster'
import type { Repository } from '../../db/repository'
import { picksSchema } from '../schemas'
import { detachmentIds, optionalRulesFrom, rosterFromRow, waivedRulesFrom } from '../rosterPersistence'

type SavedPrep = { stratagems: Stratagem[]; secondaries: Secondary[] }
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
      prep: roster.prep ? JSON.stringify(roster.prep) : null,
      tags: '[]',
      waivedRules: JSON.stringify(roster.waivedRules ?? []),
      optionalRules: JSON.stringify(roster.optionalRules ?? []),
      borrowedDetachmentId: roster.borrowedDetachmentId ?? null,
      now: this.clock(),
    })
    if (!saved) throw new Response('you do not own this roster', { status: 403 })
    return { id }
  }

  /** A user's own saved lists, newest first. Their picks come back parsed. */
  async savedRosters(userId: string) {
    const rows = await this.repository.rostersByUser(userId)
    return rows.map((row) => rosterFromRow(row, true))
  }

  async savedRosterSummaries(userId: string) {
    return rosterSummaries(await this.repository.rosterSummariesByUser(userId))
  }

  /**
   * The lists this player has published, for anybody reading their profile.
   *
   * No viewer is asked for, because a public list is public: the only credential is
   * the owner having chosen it. Private and unlisted lists are absent — an unlisted
   * one is a link its owner handed out, and listing it here would hand it to
   * everybody.
   *
   * One read answers both shapes: `summaries` is what the library row draws, and
   * `priceable` is the same lists in the form the points cache takes. The picks stay
   * on the server, which is why the caller gets them separately rather than the
   * summaries carrying them.
   */
  async publicRosters(userId: string) {
    const rows = await this.repository.publicRostersByUser(userId, PROFILE_ROSTER_LIMIT)
    return { summaries: rosterSummaries(rows), priceable: rows.map((row) => rosterFromRow(row)) }
  }

  /**
   * A shared roster, its owner's private roster, or a list fielded in a battle the
   * reader is seated in.
   *
   * Unlisted and public read alike: holding the opaque id is the whole credential for
   * both, and what a public one adds is being listed on its owner's profile rather
   * than any further access.
   *
   * The last case widens nothing: a battle already shows every seat the opposing army
   * and its units, so the reader can see this list either way. The battle has to be
   * named, so the check stays one log rather than a scan of every battle they play.
   */
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
