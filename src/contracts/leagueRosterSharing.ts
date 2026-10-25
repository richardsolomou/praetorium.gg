import { z } from 'zod'
import { leagueEventSchema } from './schemas'

export const leagueRosterSharingSchema = z.object({
  submittedAt: z.number().int().nonnegative(),
  prompt: z.boolean(),
  roster: z.object({
    id: z.string(),
    name: z.string(),
    visibility: z.enum(['private', 'unlisted', 'public']),
    updatedAt: z.number().int().nonnegative(),
  }),
})

export const shareLeagueRosterSchema = leagueEventSchema.extend({
  submittedAt: z.number().int().nonnegative(),
  rosterId: z.string().min(1).max(128),
})

export type LeagueRosterSharing = z.infer<typeof leagueRosterSharingSchema>
