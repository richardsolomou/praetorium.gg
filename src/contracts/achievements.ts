import { z } from 'zod'

const time = z.number().int().nonnegative()

/** What `achievement_facts_by_user` reads; the tokens stay on the server, which needs them to score a tournament. */
export const achievementFactsSchema = z.object({
  /** Each seat another account claimed in a live battle this player started in: who, when the battle began, and when it finished. */
  recruits: z.array(z.object({ userId: z.string(), startedAt: time, at: time })),
  tournaments: z.array(
    z.object({
      token: z.string(),
      eventToken: z.string(),
      entrants: z.number().int().nonnegative(),
      finishedAt: time,
      organised: z.boolean(),
      played: z.boolean(),
    }),
  ),
  clubs: z.array(z.object({ members: z.array(time), battles: z.array(time) })),
  photos: z.array(z.object({ at: time, likes: z.array(time) })),
  clubBattles: z.array(time),
  imports: z.array(time),
  seasons: z.array(time),
  seasonsRun: z.array(time),
  seals: z.array(time),
  published: z.array(time),
  collected: z.array(time),
  painted: z.number().int().nonnegative(),
  wishes: z.array(time),
  rosters: z.array(time),
  loans: z.array(time),
  friends: z.array(time),
  likesGiven: z.array(time),
  simulations: z.array(time),
  reminders: z.array(time),
  loadouts: z.array(time),
  favourites: z.array(time),
  app: z.array(time),
})

/** A player's stored medals, and the revisions that say whether they need checking again. */
export const achievementStatusSchema = z.object({
  revision: time,
  checked: time,
  earned: z.array(z.object({ achievementId: z.string(), earnedAt: time.nullable(), seen: z.boolean() })),
})
