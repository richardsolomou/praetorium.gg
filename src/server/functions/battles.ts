import { productActions, signedInAction } from '../productActions'
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
  sealedEventBattleOptionsSchema,
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
        const [rules, factions] = await Promise.all([app().rulesFor(), app().battleFactionsFor()])
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
      const [viewerId, rules, factions] = await Promise.all([currentUserId(), app().rulesFor(), app().battleFactionsFor()])
      return app().service.publicBattles(viewerId, rules, { before: data.before ?? undefined }, factions)
    }),
  )

/** The battles this player's friends are in and they are not. */
export const friendBattles = createServerFn({ method: 'GET' })
  .validator(battlesPageSchema)
  .handler(({ data }) =>
    rpc(() =>
      forSignedIn({ battles: [], nextCursor: null }, async (id) => {
        const [rules, factions] = await Promise.all([app().rulesFor(), app().battleFactionsFor()])
        return app().service.friendBattles(id, rules, { before: data.before ?? undefined }, factions)
      }),
    ),
  )

/**
 * The standings rated from finished public battles. Signed out too, for the same reason.
 *
 * `battleFactions` names the armies, the same index the battle list is given, so a
 * faction table is headed with a name a player recognises and addressed by its
 * slug. An instance with no catalogue synced still answers with the overall table.
 */
export const standings = createServerFn({ method: 'GET' }).handler(() => rpc(async () => app().service.standings()))

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
      const [rules, factions] = await Promise.all([app().rulesFor(), app().battleFactionsFor()])
      return app().service.playerProfile(userId, viewerId, filter, rules, factions)
    }),
  )

/** Where one player sits in the leaderboard's tables, read from the same stored ratings the leaderboard pages. */
export const playerRankings = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) => rpc(async () => app().service.playerRankings(data.userId)))

/** What one player has earned and when, the same for every reader. Signed out too. */
export const playerAchievements = createServerFn({ method: 'GET' })
  .validator(userSchema)
  .handler(({ data }) => rpc(async () => app().service.playerAchievements(data.userId)))

/** The medals the signed-in player has earned and not yet been told of. */
export const newAchievements = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.newAchievements(id))),
)

/** The signed-in player has been told of these medals, on whichever device. */
export const markAchievementsSeen = createServerFn({ method: 'POST' })
  .validator(z.object({ achievementIds: z.array(z.string().max(64)).max(100) }))
  .handler(({ data }) => mutationRpc(async () => app().repository.markAchievementsSeen(await requireUserId(), data.achievementIds)))

/** How far a finished battle moved each player's leaderboard rating, or null when it does not count. */
export const battleRatingChanges = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.battleRatingChanges(data.token)))

export const openBattle = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await battleViewerId(data.token)
      return orNull(async () => app().service.screen(data.token, userId, await app().rulesFor()))
    }),
  )

export const replayBattleAt = createServerFn({ method: 'GET' })
  .validator(battleReplaySchema)
  .handler(({ data }) =>
    rpc(async () => app().service.replayAt(data.token, await battleViewerId(data.token), data.seq, await app().rulesFor())),
  )

export const replayBattleBatch = createServerFn({ method: 'GET' })
  .validator(battleReplayBatchSchema)
  .handler(({ data }) =>
    rpc(async () => app().service.replayBatch(data.token, await battleViewerId(data.token), data.seqs, await app().rulesFor())),
  )

export const sealedEventBattleOptions = createServerFn({ method: 'GET' })
  .validator(sealedEventBattleOptionsSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await requireUserId()
      return app().service.sealedEventBattleOptions(userId, data)
    }),
  )

export const createBattle = createServerFn({ method: 'POST' })
  .validator(createBattleSchema)
  .handler(({ data }) => signedInAction(productActions.createBattle, data))

export const deleteBattle = createServerFn({ method: 'POST' })
  .validator(deleteBattleSchema)
  .handler(({ data }) => signedInAction(productActions.deleteBattle, data))

export const submit = createServerFn({ method: 'POST' })
  .validator(submitSchema.extend({ workspace: z.boolean().optional() }))
  .handler(({ data }) => mutationRpc(async () => submitBattleCommand(await requireBattleActor(data.token), data)))

export const battleReport = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.report(data.token, await requireBattleActor(data.token), await app().rulesFor())))
