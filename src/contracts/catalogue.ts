import type { UnitGroup } from '../core/unitGroups'

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
