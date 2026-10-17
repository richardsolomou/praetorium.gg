import { FORMAT_RULE_IDS, OPTIONAL_RULE_IDS, type FormatRuleId, type OptionalRuleId } from '../core/battle'
import { picksSchema, savedPrepSchema } from '../contracts/schemas'
import type { SpacetimeOperator } from './spacetimeOperator'
import { currentRosterIds } from '../core/retiredCatalogueIds'
import { withoutUnitNotes } from '../core/unitNotes'
import { detachmentIds } from '../core/savedRoster'

export { detachmentIds }

type RosterColumns = {
  detachmentIds: readonly string[]
  picks: readonly unknown[]
  prep: { reminders?: readonly unknown[]; remindersEnabled?: boolean } | null
  waivedRules?: readonly string[]
  optionalRules?: readonly string[]
  borrowedDetachmentId?: string | null
  baseRosterId?: string | null
  copiedFromRosterId?: string | null
}

/** Encodes a roster's columns for storage; `rosterFromRow` reads them back. */
export function rosterRow<R extends RosterColumns>(roster: R) {
  return {
    ...roster,
    detachmentId: JSON.stringify(roster.detachmentIds),
    picks: JSON.stringify(roster.picks),
    prep: roster.prep
      ? JSON.stringify({ ...roster.prep, reminders: roster.prep.reminders ?? [], remindersEnabled: roster.prep.remindersEnabled ?? true })
      : null,
    tags: '[]',
    waivedRules: JSON.stringify(roster.waivedRules ?? []),
    optionalRules: JSON.stringify(roster.optionalRules ?? []),
    borrowedDetachmentId: roster.borrowedDetachmentId ?? null,
    baseRosterId: roster.baseRosterId ?? null,
    copiedFromRosterId: roster.copiedFromRosterId ?? null,
  }
}

export function rosterFromRow(row: NonNullable<Awaited<ReturnType<SpacetimeOperator['roster']>>>, includePrep = false) {
  const prep = includePrep && row.prep ? savedPrepSchema.parse(JSON.parse(row.prep)) : null
  return currentRosterIds({
    id: row.id,
    name: row.name,
    automaticName: row.automaticName,
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
    copiedFromRosterId: row.copiedFromRosterId ?? null,
    locked: row.locked,
    archived: row.archived,
    visibility: row.visibility,
    source: row.source,
  })
}

/**
 * The saved roster as somebody other than its owner reads it: without unit notes, and with no
 * variant base, which can be a list the reader may not open.
 */
export function readerRosterFromRow(row: NonNullable<Awaited<ReturnType<SpacetimeOperator['roster']>>>) {
  const roster = { ...rosterFromRow(row), baseRosterId: null }
  return { ...roster, picks: withoutUnitNotes(roster.picks) }
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
