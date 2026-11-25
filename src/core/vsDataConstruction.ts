import { z } from 'zod'

/**
 * What list building reads from one rules version's VS Data release: every roster definition by kind and ID, with its
 * name, and the points snapshots. Kept beside the release's summaries as `summaries/<rules version>.construction.json`.
 */
export const vsDataConstructionSchema = z.object({
  release: z.string(),
  rulesVersion: z.object({ edition: z.string(), update: z.string() }),
  definitions: z.record(z.string(), z.record(z.string(), z.object({ name: z.string(), data: z.record(z.string(), z.unknown()) }))),
  points: z.array(z.record(z.string(), z.unknown())),
})
export type VsDataConstruction = z.infer<typeof vsDataConstructionSchema>
