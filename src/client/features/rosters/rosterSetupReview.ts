import { picksAfterSetupChange } from '../../../core/rosterSetup'
import { requireReviewedRoster, type ReviewedServerSave } from '../../offline/reviewedRoster'
import { localEngine, localOwner } from '../../offline/localRuntime'
import { priceRoster, sharedRoster } from '../../functions'
import type { RosterDraft } from './rosterDraft'
import { priceSchema, saveRosterSchema } from '../../../contracts/schemas'
import type { RosterSetup } from './RosterSetupDialog'

type SetupPrice = NonNullable<Awaited<ReturnType<typeof priceRoster>>>
export type RosterSetupReview = {
  ownerId: string | null
  serverSave?: ReviewedServerSave
  source: RosterDraft
  candidate: RosterDraft
  before: SetupPrice
  after: SetupPrice
}

async function priceSetup(draft: RosterDraft) {
  const price = await priceRoster({ data: priceSchema.parse({ ...draft, units: draft.picks }) })
  if (!price) throw new Error('The rules needed to review this roster are unavailable.')
  return price
}

export async function reviewRosterSetup(source: RosterDraft | string, setup: RosterSetup): Promise<RosterSetupReview> {
  const ownerId = localOwner()?.id ?? null
  const serverOnly = Boolean(ownerId && !localEngine())
  const id = typeof source === 'string' ? source : source.id
  const loaded = typeof source === 'string' || serverOnly ? (id ? await sharedRoster({ data: { id } }) : null) : null
  if (typeof source === 'string' && !loaded) throw new Error('This roster is no longer available.')
  const original =
    typeof source === 'string' ? saveRosterSchema.parse({ ...loaded, name: loaded!.automaticName ? '' : loaded!.name }) : source
  let serverSave: ReviewedServerSave | undefined
  if (serverOnly) {
    if (!loaded) throw new Error('This roster is no longer available.')
    requireReviewedRoster(loaded, original)
    serverSave = { expectedVersion: loaded.updatedAt, operationId: crypto.randomUUID() }
  }
  const captured = structuredClone(original)
  const before = await priceSetup(captured)
  const changedFaction = picksAfterSetupChange(
    captured.picks,
    captured.picks.map((_pick, index) => before.units.find((unit) => unit.key === index)),
    captured,
    setup,
  )
  const candidate = {
    ...captured,
    ...structuredClone(setup),
    picks: changedFaction,
  }
  const after = await priceSetup(candidate)
  if ((localOwner()?.id ?? null) !== ownerId) throw new Error('The account changed during this review.')
  return { ownerId, serverSave, source: captured, candidate, before, after }
}

export async function verifySetupReview(review: RosterSetupReview) {
  if ((localOwner()?.id ?? null) !== review.ownerId) throw new Error('The account changed after this review. Reload before continuing.')
  const current = await priceSetup(review.candidate)
  if ((localOwner()?.id ?? null) !== review.ownerId) throw new Error('The account changed after this review. Reload before continuing.')
  if (JSON.stringify(current) !== JSON.stringify(review.after))
    throw new Error('The rules or points changed after this review. Go back and review the changes again.')
}
