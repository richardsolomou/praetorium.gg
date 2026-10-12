import { FORMAT_RULE_IDS, OPTIONAL_RULE_IDS, type FormatRuleId, type OptionalRuleId } from '../core/battle'
import { picksSchema, savedPrepSchema } from '../contracts/schemas'
import type { SpacetimeOperator } from './spacetimeOperator'
import { currentRosterIds } from '../core/retiredCatalogueIds'
import { withoutUnitNotes } from '../core/unitNotes'
import { detachmentIds } from '../core/savedRoster'

export { detachmentIds }

export function rosterFromRow(row: NonNullable<Awaited<ReturnType<SpacetimeOperator['roster']>>>, includePrep = false) {
  const prep = includePrep && row.prep ? savedPrepSchema.parse(JSON.parse(row.prep)) : null
  return currentRosterIds({
    id: row.id,
    name: row.name,
    automaticName: row.automaticName ?? !row.name,
    catalogueId: row.catalogueId,
    detachmentIds: detachmentIds(row.detachmentId),
    disposition: row.disposition,
    limit: row.limit,
    pointsBudget: row.pointsBudget ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    picks: picksSchema.parse(JSON.parse(row.picks)),
    ...(includePrep
      ? {
          prep,
          reminders: prep?.reminders ?? [],
          remindersEnabled: prep?.remindersEnabled ?? true,
        }
      : { prep: null }),
    waivedRules: waivedRulesFrom(row.waivedRules),
    optionalRules: optionalRulesFrom(row.optionalRules),
    borrowedDetachmentId: row.borrowedDetachmentId,
    baseRosterId: row.baseRosterId,
    locked: row.locked ?? false,
    visibility: row.visibility,
    source: row.source,
  })
}

/** The saved roster as somebody other than its owner reads it: unit notes only when the owner shares them. */
export function readerRosterFromRow(row: NonNullable<Awaited<ReturnType<SpacetimeOperator['roster']>>>) {
  const roster = rosterFromRow(row)
  const shared = row.prep ? savedPrepSchema.parse(JSON.parse(row.prep)).shareNotes : false
  return shared ? roster : { ...roster, picks: withoutUnitNotes(roster.picks) }
}

export function optionalRulesFrom(value: string | null): OptionalRuleId[] {
  if (!value) return []
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is OptionalRuleId => OPTIONAL_RULE_IDS.some((known) => known === id)) : []
}

export function waivedRulesFrom(value: string | null): FormatRuleId[] {
  if (!value) return []
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is FormatRuleId => FORMAT_RULE_IDS.some((known) => known === id)) : []
}
