import { saveRosterSchema } from '../../contracts/schemas'
import type { RosterInput } from './localRuntime'
import type { syncRoster } from '../../server/functions/offline'

export type ReviewedServerSave = Pick<Parameters<typeof syncRoster>[0]['data'], 'operationId' | 'expectedVersion'>

export function rosterSaveKey(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const roster = value as RosterInput & { automaticName?: boolean }
  const parsed = saveRosterSchema.safeParse({
    ...roster,
    name: roster.automaticName ? '' : roster.name,
    prep: roster.prep ?? { stratagems: [], secondaries: [] },
  })
  return parsed.success ? JSON.stringify(parsed.data) : null
}

export function requireReviewedRoster(current: unknown, expected: RosterInput) {
  const baseline = rosterSaveKey(expected)
  if (baseline === null || rosterSaveKey(current) !== baseline)
    throw new Error('This roster changed after your review. Go back, reload it and review the changes again.')
}
