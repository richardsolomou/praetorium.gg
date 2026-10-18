import { z } from 'zod'

/** How many standalone pairings a player keeps, on a device or with their account. */
export const RECENT_MATCHUP_LIMIT = 6

/** A pairing's latest simulator link and the unit names shown for it. */
export const recentMatchupSchema = z.object({
  shared: z.string().min(1).max(8_000),
  attacker: z.string().min(1).max(200),
  defender: z.string().min(1).max(200),
})
export type RecentMatchup = z.infer<typeof recentMatchupSchema>

/** Identifies a pairing independently of its settings, so newer settings replace older ones. */
export const matchupPairingSchema = z.string().min(1).max(8_000)
