import { z } from 'zod'
import { ROSTER_VISIBILITIES } from '../core/savedRoster'
import { sealedEventSchema } from './schemas'

export const sealedEventRosterSharingSchema = z.object({
  submittedAt: z.number().int().nonnegative(),
  prompt: z.boolean(),
  roster: z.object({
    id: z.string(),
    name: z.string(),
    visibility: z.enum(ROSTER_VISIBILITIES),
    updatedAt: z.number().int().nonnegative(),
  }),
})

export const shareSealedEventRosterSchema = sealedEventSchema.extend({
  submittedAt: z.number().int().nonnegative(),
  rosterId: z.string().min(1).max(128),
})

export type SealedEventRosterSharing = z.infer<typeof sealedEventRosterSharingSchema>
