import type { z } from 'zod'
import { ROSTER_NAME_MAX_LENGTH } from '../core/battle'
import { variantName } from '../core/rosterVariants'
import { app } from './app'
import { calculateRosterTotals } from '../shared/pricing'
import type { saveRosterSchema } from '../contracts/schemas'

export async function saveOwnedRoster(
  userId: string,
  data: z.infer<typeof saveRosterSchema>,
  baseRosterId: string | null = null,
  copiedFromRosterId: string | null = null,
) {
  const instance = app()
  const automaticName = !data.name
  const totals = automaticName
    ? calculateRosterTotals(
        { ...data, units: data.picks },
        await instance.catalogueFor(data.catalogueId),
        await instance.rosterLabelRulesFor(data.catalogueId),
      )
    : null
  return instance.service.saveRoster(userId, {
    ...data,
    name: data.name || totals?.label || '',
    automaticName,
    baseRosterId,
    copiedFromRosterId,
  })
}

/**
 * A new roster holding everything a readable one does as this player reads it, at their
 * default visibility. Nothing is written to the source.
 * Only an owned roster has variants: a variant joins the original's group and is numbered
 * after the group's base; a copy of an automatically named roster is named automatically.
 */
export async function copySavedRoster(userId: string, id: string, variant: boolean) {
  const instance = app()
  const access = await instance.service.rosterAccess(id, userId)
  if (!access || (variant && !access.editable)) return null
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
    pointsBudget: roster.pointsBudget,
    picks: roster.picks,
    waivedRules: roster.waivedRules,
    optionalRules: roster.optionalRules,
    prep: roster.prep,
    visibility: rosterVisibility,
    source: roster.source,
  }
  return { ...(await saveOwnedRoster(userId, data, variant ? roster.id : null, variant ? null : roster.id)), data }
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
