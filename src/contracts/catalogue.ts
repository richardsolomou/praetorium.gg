import type { UnitGroup } from '../core/unitGroups'
import type { RuleDocument } from './rules'

export type DatasheetSearchReason = {
  kind: 'keyword' | 'ability' | 'weapon' | 'weapon keyword' | 'wargear'
  value: string
}

export type UnitSummary = {
  id: string
  slug: string
  name: string
  points: number | null
  group: UnitGroup
  limit: number | null
  allied: boolean
  alliedFaction: string | null
  matchReasons?: DatasheetSearchReason[]
}

export type AbilityKind = 'core' | 'faction' | 'datasheet' | 'rule' | 'upgrade' | 'wargear'

export type DatasheetRelationship = {
  kind?: 'leader' | 'support'
  name: string
  entryId: string | null
  route: { catalogueId: string; slug: string } | null
}

export type Datasheet = {
  id: string
  slug: string
  referenceRoute: { catalogueId: string; slug: string } | null
  name: string
  points: number | null
  keywords: string[]
  profiles: {
    id: string
    name: string
    type: string
    count?: number
    values: { name: string; value: string; baseValue?: string; modifiers?: string[] }[]
  }[]
  abilities: { id: string; name: string; source?: string; description: string | null; kind: AbilityKind }[]
  composition: string[]
  loadout: string | null
  wargearOptions: string[]
  wargearGroups?: { instruction: string; options: string[] }[]
  baseSize: string | null
  transport: string | null
  costs: { models: string; cost: string; keyword: string | null; faction: string | null; detachment: string | null }[]
  attachments: DatasheetRelationship[]
  leaders: DatasheetRelationship[]
  supporters: DatasheetRelationship[]
  keywordRules: { name: string; description: string }[]
}

export type DatasheetProfileKind = 'unit' | 'ranged-weapon' | 'melee-weapon' | 'transport' | 'rule' | 'other'

export type DatasheetCharacteristicKind =
  | 'movement'
  | 'toughness'
  | 'save'
  | 'wounds'
  | 'leadership'
  | 'objective-control'
  | 'invulnerable-save'
  | 'range'
  | 'attacks'
  | 'ballistic-skill'
  | 'weapon-skill'
  | 'strength'
  | 'armour-penetration'
  | 'damage'
  | 'keywords'
  | 'other'

export type StructuredDatasheetCharacteristic = Datasheet['profiles'][number]['values'][number] & {
  kind: DatasheetCharacteristicKind
}

export type StructuredDatasheetProfile = Omit<Datasheet['profiles'][number], 'values'> & {
  kind: DatasheetProfileKind
  values: StructuredDatasheetCharacteristic[]
}

export type CanonicalSourceName = 'definitions' | 'points' | 'rules' | 'datacards' | 'battlemaster'

export type CanonicalFieldResolution = {
  sources: CanonicalSourceName[]
  strategy: 'single-source' | 'sources-agree' | 'merged' | 'source-priority' | 'fallback' | 'unresolved'
}

export type CanonicalDatasheet = Omit<Datasheet, 'profiles'> & {
  catalogueId: string
  faction: string
  attribution: string | null
  profiles: StructuredDatasheetProfile[]
  provenance: {
    definitions: { revision: string; entryId: string }
    datacards: { revision: string; resolution: 'external-reference' | 'normalized-name' } | null
    rules: { revision: string; unitId: string; resolution: 'external-reference' } | null
    fields: {
      identity: CanonicalFieldResolution
      points: CanonicalFieldResolution
      keywords: CanonicalFieldResolution
      profiles: CanonicalFieldResolution
      abilities: CanonicalFieldResolution
      composition: CanonicalFieldResolution
      loadout: CanonicalFieldResolution
      wargear: CanonicalFieldResolution
      baseSize: CanonicalFieldResolution
      transport: CanonicalFieldResolution
      costs: CanonicalFieldResolution
      relationships: CanonicalFieldResolution
    }
  }
}

export type CanonicalCatalogueIssue = {
  kind:
    | 'missing-source-record'
    | 'source-name-fallback'
    | 'source-field-conflict'
    | 'source-field-fallback'
    | 'unclassified-profile'
    | 'unclassified-characteristic'
  severity: 'notice' | 'warning'
  catalogueId: string
  entryId: string
  path: string
  message: string
}

export type CanonicalCatalogue = {
  format: 'praetorium.canonical-catalogue.v1'
  compilerVersion: 1
  revisions: Record<string, string>
  datasheets: CanonicalDatasheet[]
  ruleDocuments: (RuleDocument & { provenance: { datacards: { revision: string } } })[]
  issues: CanonicalCatalogueIssue[]
}
