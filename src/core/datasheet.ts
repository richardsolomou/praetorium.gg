import type { PrintedTransport } from './transport'
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
  /** Keywords only some models have, such as a command squad's CHARACTER officer; `keywords` also lists them. */
  modelKeywords?: { models: string[]; keywords: string[] }[]
  profiles: {
    id: string
    name: string
    type: string
    count?: number
    equipmentName?: string
    values: { name: string; value: string; baseValue?: string; modifiers?: string[] }[]
  }[]
  abilities: {
    id: string
    name: string
    source?: string
    description: string | null
    kind: AbilityKind
    /** The keyword a granted ability is limited to, when only some models in the unit have it. */
    models?: string
  }[]
  composition: string[]
  loadout: string | null
  wargearOptions: string[]
  wargearGroups?: { instruction: string; options: string[] }[]
  baseSize: string | null
  transport: string | null
  /** How many models `composition` prints, for pages that cannot read its lines. */
  modelCount?: string
  /** What `transport` states, for rules that cannot read its text. */
  transportCapacity?: PrintedTransport
  costs: { models: string; cost: string; keyword: string | null; faction: string | null; detachment: string | null; copies?: string }[]
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
  | 'base-size'
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
