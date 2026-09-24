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
