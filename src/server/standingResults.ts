import { reduceBattle } from '../core/battle'
import { byId } from '../core/collections'
import { isGuestSeat } from '../core/newBattle'
import { battleFoldArgs } from '../core/offlineBattle'
import { battleSummary, builtFaction, type BattleFaction } from '../shared/battleSummary'
import type { BattleHistory, RepositoryPort } from './spacetimeRepository'

/** As many battles or accounts as one read asks for. */
const BATCH = 500

type Result = {
  summary: ReturnType<typeof battleSummary>
  /** Each seat's list, so its faction can be named from whichever catalogue a reader passes. */
  built: Parameters<typeof builtFaction>[0][]
}

/**
 * Every finished battle's summary, each folded from its log once and again only when `battleChanges` names the battle.
 *
 * A cache of the logs rather than a record beside them: a new process starts from revision zero and folds every log.
 * Names come from the accounts on every read, so a renamed player is not shown under the name their battles were read with.
 */
export class StandingResults {
  private readonly results = new Map<string, Result>()
  private cursor = 0
  private pulling: Promise<void> = Promise.resolve()

  constructor(private readonly repository: Pick<RepositoryPort, 'battleChanges' | 'battlesByIds' | 'profilesByIds'>) {}

  /** The finished battles in a fixed order, so battles finishing in the same millisecond are always rated in the same order. */
  async battles(factions: readonly BattleFaction[]) {
    await this.sync()
    const results = [...this.results].toSorted(([one], [other]) => other.localeCompare(one)).map(([, result]) => result)
    const ids = [...new Set(results.flatMap(({ summary }) => summary.playerIds.filter((id) => !isGuestSeat(id))))]
    const profiles = new Map<string, { name: string; image: string | null }>()
    for (let at = 0; at < ids.length; at += BATCH)
      for (const [id, profile] of await this.repository.profilesByIds(ids.slice(at, at + BATCH))) profiles.set(id, profile)
    const factionsById = byId(factions)
    return results.map(({ summary, built }) => {
      const playerDetails = summary.playerDetails.map((player) => {
        const profile = profiles.get(player.id)
        return profile ? { ...player, name: profile.name, image: profile.image } : player
      })
      return {
        ...summary,
        players: playerDetails.map((player) => player.name),
        playerDetails,
        factions: built.map((list) => builtFaction(list, factionsById)),
      }
    })
  }

  /** Each pull starts after the one before it ends, so it reads every change committed before it was asked for. */
  private sync() {
    const pull = this.pulling.then(() => this.pull())
    this.pulling = pull.catch(() => undefined)
    return pull
  }

  /** The cursor moves only once every named battle is reread, so a failed pull is retried in full. */
  private async pull() {
    const { cursor, battleIds } = await this.repository.battleChanges(this.cursor)
    for (let at = 0; at < battleIds.length; at += BATCH) {
      const ids = battleIds.slice(at, at + BATCH)
      const histories = await this.repository.battlesByIds(ids)
      for (const id of ids) this.results.delete(id)
      for (const history of histories) {
        const result = finishedResult(history)
        if (result) this.results.set(history.battle.id, result)
      }
    }
    this.cursor = cursor
  }
}

function finishedResult(history: BattleHistory): Result | null {
  const state = reduceBattle(...battleFoldArgs(history.players, history.log))
  if (state.status !== 'finished') return null
  return {
    summary: battleSummary(history, state, null, null, new Map()),
    built: state.players.map(
      (player) => player.roster?.built && { catalogueId: player.roster.built.catalogueId, edition: player.roster.built.edition },
    ),
  }
}
