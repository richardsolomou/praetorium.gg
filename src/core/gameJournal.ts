import { z } from 'zod'
import { PROFILE_NAME_MAX_LENGTH } from './profileName'
import { winRate } from './standings'

/**
 * Games a player records after the fact, played outside Praetorium.
 *
 * They are the player's own account of a game nobody else confirmed, so they stay in
 * the player's journal: no service record, standing, rating, or public profile reads them.
 */

export const JOURNAL_GAMES_MAX = 1_000
export const JOURNAL_EVENTS_MAX = 200
export const JOURNAL_NOTE_MAX_LENGTH = 2_000
export const JOURNAL_EVENT_NAME_MAX_LENGTH = 80
export const JOURNAL_ARMY_MAX_LENGTH = 80
export const JOURNAL_SCORE_MAX = 200

export const JOURNAL_RESULTS = ['won', 'drawn', 'lost'] as const
export type JournalResult = (typeof JOURNAL_RESULTS)[number]

const id = z.string().min(1).max(64)
/** A calendar day as the player wrote it: a game played on the 3rd stays on the 3rd wherever it is read. */
const playedOn = z.iso.date()
const victoryPoints = z.number().int().min(0).max(JOURNAL_SCORE_MAX).nullable()
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()

/** The result two scores give, or null while either is missing. */
export function scoredResult(score: number | null, opponentScore: number | null): JournalResult | null {
  if (score === null || opponentScore === null) return null
  return score > opponentScore ? 'won' : score < opponentScore ? 'lost' : 'drawn'
}

export const journalGameSchema = z
  .object({
    id,
    eventId: id.nullable(),
    playedOn,
    factionId: id.nullable(),
    army: optionalText(JOURNAL_ARMY_MAX_LENGTH),
    opponentName: optionalText(PROFILE_NAME_MAX_LENGTH),
    opponentFactionId: id.nullable(),
    score: victoryPoints,
    opponentScore: victoryPoints,
    result: z.enum(JOURNAL_RESULTS),
    notes: optionalText(JOURNAL_NOTE_MAX_LENGTH),
  })
  .refine((game) => [null, game.result].includes(scoredResult(game.score, game.opponentScore)), {
    message: 'The result must match the scores.',
    path: ['result'],
  })

export type JournalGameInput = z.infer<typeof journalGameSchema>

export const journalEventSchema = z.object({
  id,
  name: z.string().trim().min(1, 'Name the event.').max(JOURNAL_EVENT_NAME_MAX_LENGTH),
})

export type JournalEventInput = z.infer<typeof journalEventSchema>

export type JournalTotals = {
  games: number
  won: number
  drawn: number
  lost: number
  rate: number
  /** Victory points over the games that recorded both scores, which `scored` counts. */
  scored: number
  pointsFor: number
  pointsAgainst: number
}

export function journalTotals(games: readonly Pick<JournalGameInput, 'result' | 'score' | 'opponentScore'>[]): JournalTotals {
  const counted = { won: 0, drawn: 0, lost: 0 }
  let scored = 0
  let pointsFor = 0
  let pointsAgainst = 0
  for (const game of games) {
    counted[game.result] += 1
    if (game.score !== null && game.opponentScore !== null) {
      scored += 1
      pointsFor += game.score
      pointsAgainst += game.opponentScore
    }
  }
  return { games: games.length, ...counted, rate: winRate({ ...counted, battles: games.length }), scored, pointsFor, pointsAgainst }
}

/** Most recently played first; games recorded for the same day keep the order they were recorded in, newest first. */
export function journalOrder<T extends { playedOn: string; createdAt: number; id: string }>(games: readonly T[]): T[] {
  return [...games].sort(
    (left, right) => right.playedOn.localeCompare(left.playedOn) || right.createdAt - left.createdAt || right.id.localeCompare(left.id),
  )
}
