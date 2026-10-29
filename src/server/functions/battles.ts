import { productActions } from '../productActions'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { app } from '../app'
import { currentUserId, forSignedIn, requireUserId } from '../playerSession'
import { BATTLES_PAGE } from '../service'
import { battleViewerId, requireBattleActor } from '../guestSession'
import { submitBattleCommand } from '../battleSubmission'
import { mutationRpc, rpc } from '../rpc'
import {
  battlesPageSchema,
  battleReplaySchema,
  battleReplayBatchSchema,
  createBattleSchema,
  deleteBattleSchema,
  leagueBattleOptionsSchema,
  playerProfileSchema,
  submitSchema,
  tokenSchema,
  userSchema,
} from '../../contracts/schemas'

async function orNull<T>(work: () => Promise<T>) {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Response && error.status === 404) return null
    throw error
  }
}

export const myBattles = createServerFn({ method: 'GET' })
  .validator(battlesPageSchema)
  .handler(({ data }) =>
    rpc(() =>
      forSignedIn({ battles: [], nextCursor: null }, async (id) => {
        const [rules, factions] = await Promise.all([app().battleMissionRulesFor(), app().battleFactionsFor()])
        return app().service.battles(id, rules, { limit: BATTLES_PAGE, before: data.before ?? undefined }, factions)
      }),
    ),
  )

/**
 * The battles anyone may watch, most recently started first.
 *
 * Signed out as well as signed in: this is what the home page shows a visitor who
 * has never played, so it must answer without an account. The viewer, when there
 * is one, only narrows it — their own games are already above it on that page.
 */
export const publicBattles = createServerFn({ method: 'GET' })
  .validator(battlesPageSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const [viewerId, rules, factions] = await Promise.all([currentUserId(), app().battleMissionRulesFor(), app().battleFactionsFor()])
      return app().service.publicBattles(viewerId, rules, { before: data.before ?? undefined }, factions)
    }),
  )

/** The battles this player's friends are in and they are not. */
export const friendBattles = createServerFn({ method: 'GET' })
  .validator(battlesPageSchema)
  .handler(({ data }) =>
    rpc(() =>
      forSignedIn({ battles: [], nextCursor: null }, async (id) => {
        const [rules, factions] = await Promise.all([app().battleMissionRulesFor(), app().battleFactionsFor()])
        return app().service.friendBattles(id, rules, { before: data.before ?? undefined }, factions)
      }),
    ),
  )

/**
 * The standings folded from finished public battles. Signed out too, for the same reason.
 *
 * `battleFactions` names the armies, the same index the battle list is given, so a
 * faction table is headed with a name a player recognises and addressed by its
 * slug. An instance with no catalogue synced still answers with the overall table.
 */
export const standings = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.standings(await app().battleFactionsFor())),
)

/**
 * One player's profile: the battles this reader may see them in, their record, and
 * what the record can be narrowed by. Signed out too, the same as their name is.
 */
export const playerProfile = createServerFn({ method: 'GET' })
  .validator(playerProfileSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const { userId, ...filter } = data
      const viewerId = await currentUserId()
      const [rules, factions] = await Promise.all([app().battleReadRulesFor(), app().battleFactionsFor()])
      return app().service.playerProfile(userId, viewerId, filter, rules, factions)
    }),
  )

/** Where one player sits in the leaderboard's tables. The same fold the leaderboard pages. */
export const playerRankings = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) => rpc(async () => app().service.playerRankings(data.userId, await app().battleFactionsFor())))

/** How far a finished battle moved each player's leaderboard rating, or null when it does not count. */
export const battleRatingChanges = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.battleRatingChanges(data.token, await app().battleFactionsFor())))

export const openBattle = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await battleViewerId(data.token)
      return orNull(async () => app().service.screen(data.token, userId, await app().battleReadRulesFor()))
    }),
  )

export const replayBattleAt = createServerFn({ method: 'GET' })
  .validator(battleReplaySchema)
  .handler(({ data }) =>
    rpc(async () => app().service.replayAt(data.token, await battleViewerId(data.token), data.seq, await app().battleReadRulesFor())),
  )

export const replayBattleBatch = createServerFn({ method: 'GET' })
  .validator(battleReplayBatchSchema)
  .handler(({ data }) =>
    rpc(async () => app().service.replayBatch(data.token, await battleViewerId(data.token), data.seqs, await app().battleReadRulesFor())),
  )

export const leagueBattleOptions = createServerFn({ method: 'GET' })
  .validator(leagueBattleOptionsSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await requireUserId()
      return app().service.leagueBattleOptions(userId, data)
    }),
  )

export const createBattle = createServerFn({ method: 'POST' })
  .validator(createBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.createBattle(userId, data)
    }),
  )

export const deleteBattle = createServerFn({ method: 'POST' })
  .validator(deleteBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.deleteBattle(userId, data)
    }),
  )

export const submit = createServerFn({ method: 'POST' })
  .validator(submitSchema.extend({ workspace: z.boolean().optional() }))
  .handler(({ data }) => mutationRpc(async () => submitBattleCommand(await requireBattleActor(data.token), data)))

export const battleReport = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    rpc(async () => app().service.report(data.token, await requireBattleActor(data.token), await app().battleReadRulesFor())),
  )
