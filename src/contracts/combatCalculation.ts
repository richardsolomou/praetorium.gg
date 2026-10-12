import { z } from 'zod'
import { combatSchema } from '../core/combat'
import { combatLoadoutSchema } from './schemas'
import { currentRosterIds } from '../core/retiredCatalogueIds'

export const COMBAT_BATCH_SIZE = 4
export const combatRequestsSchema = z
  .array(z.object({ ranged: combatSchema.nullable(), melee: combatSchema.nullable(), sequenceError: z.string().max(400).optional() }))
  .min(1)
  .max(COMBAT_BATCH_SIZE)

export const rosterCombatantsSchema = z
  .object({
    catalogueId: combatLoadoutSchema.shape.catalogueId,
    detachmentIds: combatLoadoutSchema.shape.detachmentIds,
    picks: combatLoadoutSchema.shape.picks,
    pickIndices: z.array(z.int().min(0).max(99)).min(1).max(100),
    inactivePicks: z.array(z.int().min(0).max(99)).max(100).default([]),
  })
  .overwrite(currentRosterIds)
  .refine(({ picks, pickIndices }) => pickIndices.every((index) => index < picks.length), 'A selected unit is missing.')
