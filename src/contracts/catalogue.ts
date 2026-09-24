import type { UnitGroup } from '../core/unitGroups'
import type { Datasheet, StructuredDatasheetProfile } from '../core/datasheet'
import type { RuleDocument } from './rules'

export type {
  AbilityKind,
  Datasheet,
  DatasheetCharacteristicKind,
  DatasheetProfileKind,
  DatasheetRelationship,
  StructuredDatasheetCharacteristic,
  StructuredDatasheetProfile,
} from '../core/datasheet'

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

export type CanonicalDetachment = {
  catalogueId: string
  faction: string
  factionSlug: string
  id: string
  slug: string
  name: string
  points: number | null
  dispositions: string[]
  rules: { name: string; description: string | null }[]
  enhancements: { name: string; points: number | null; description: string | null }[]
  upgrades: { name: string; points: number | null; description: string | null }[]
  stratagems: {
    id: string
    name: string
    cp: number
    type: string | null
    phases: string[]
    turn: string | null
    description: string | null
  }[]
  keywordRules: { name: string; description: string }[]
  attribution: string
  provenance: {
    definitions: { revision: string; detachmentId: string }
    rules: { revision: string }
    datacards: { revision: string }
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
  detachments: CanonicalDetachment[]
  ruleDocuments: (RuleDocument & { provenance: { datacards: { revision: string } } })[]
  issues: CanonicalCatalogueIssue[]
}
