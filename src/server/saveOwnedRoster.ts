import type { z } from 'zod'
import { ROSTER_NAME_MAX_LENGTH } from '../core/battle'
import { variantName } from '../core/rosterVariants'
import { app } from './app'
import { calculateRosterTotals } from '../shared/pricing'
import type { saveRosterSchema } from '../contracts/schemas'

export async function saveOwnedRoster(userId: string, data: z.infer<typeof saveRosterSchema>, baseRosterId: string | null = null) {
  const instance = app()
  const automaticName = !data.name
  const totals = automaticName
    ? calculateRosterTotals(
        { ...data, units: data.picks },
        await instance.catalogueFor(data.catalogueId),
        await instance.rosterLabelRulesFor(),
      )
    : null
  return instance.service.saveRoster(userId, {
    ...data,
    name: data.name || totals?.label || '',
    automaticName,
    baseRosterId,
  })
}

/**
 * A new roster holding everything an owned one does, at the owner's default visibility.
 * A variant joins the original's group and is numbered after the group's base; a copy of
 * an automatically named roster is named automatically either way.
 */
export async function copyOwnedRoster(userId: string, id: string, variant: boolean) {
  const instance = app()
  const access = await instance.service.rosterAccess(id, userId)
  if (!access?.editable) return null
  const { roster } = access
  const { rosterVisibility } = await instance.service.playerDefaults(userId)
  const data: z.infer<typeof saveRosterSchema> = {
    name: variant
      ? await variantNameFor(userId, roster)
      : roster.automaticName
        ? ''
        : `Copy of ${roster.name}`.slice(0, ROSTER_NAME_MAX_LENGTH),
    catalogueId: roster.catalogueId,
    detachmentIds: roster.detachmentIds,
    disposition: roster.disposition,
    borrowedDetachmentId: roster.borrowedDetachmentId,
    limit: roster.limit,
    picks: roster.picks,
    waivedRules: roster.waivedRules,
    optionalRules: roster.optionalRules,
    prep: roster.prep,
    visibility: rosterVisibility,
    source: roster.source,
  }
  return { ...(await saveOwnedRoster(userId, data, variant ? roster.id : null)), data }
}

async function variantNameFor(userId: string, roster: { id: string; name: string; automaticName: boolean; baseRosterId: string | null }) {
  const group = await app().service.rosterGroup(userId, roster)
  const base = group.find((saved) => saved.id === (roster.baseRosterId ?? roster.id)) ?? roster
  return base.automaticName
    ? ''
    : variantName(
        base.name,
        group.map((saved) => saved.name),
      )
}
