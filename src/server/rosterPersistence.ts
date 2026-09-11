import { FORMAT_RULE_IDS, OPTIONAL_RULE_IDS, type FormatRuleId, type OptionalRuleId } from '../core/battle'
import type { Repository } from '../db/repository'
import { picksSchema, savedPrepSchema } from './schemas'

export function rosterFromRow(row: NonNullable<Awaited<ReturnType<Repository['roster']>>>, includePrep = false) {
  return {
    id: row.id,
    name: row.name,
    catalogueId: row.catalogueId,
    detachmentIds: detachmentIds(row.detachmentId),
    disposition: row.disposition,
    limit: row.limit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    picks: picksSchema.parse(JSON.parse(row.picks)),
    prep: includePrep && row.prep ? savedPrepSchema.parse(JSON.parse(row.prep)) : null,
    waivedRules: waivedRulesFrom(row.waivedRules),
    optionalRules: optionalRulesFrom(row.optionalRules),
    borrowedDetachmentId: row.borrowedDetachmentId,
    visibility: row.visibility,
    source: row.source,
  }
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

export function detachmentIds(value: string | null): string[] {
  if (!value) return []
  if (!value.startsWith('[')) return [value]
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
}
