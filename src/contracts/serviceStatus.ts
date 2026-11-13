import { z } from 'zod'
import { catalogueEditionSummarySchema } from '../core/catalogueEdition'

/** What `/api/status` tells anyone about the instance that answers it. */
export const serviceStatusSchema = z.object({
  /** The same check as `/api/health`, without the reason it failed. */
  up: z.boolean(),
  release: z.string(),
  commit: z.string().nullable(),
  catalogue: z.object({
    sync: z.enum(['absent', 'working', 'ready', 'failed']),
    snapshot: z.string().nullable(),
  }),
  /** Retired versions are left out: they only keep older lists readable. */
  rulesVersions: z.array(catalogueEditionSummarySchema.pick({ name: true, status: true }).extend({ default: z.boolean() })),
})

export type ServiceStatus = z.infer<typeof serviceStatusSchema>
