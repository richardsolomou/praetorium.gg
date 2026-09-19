import type { Datasheet, DatasheetCharacteristicKind, DatasheetProfileKind, StructuredDatasheetProfile } from '../contracts/catalogue'

const normalized = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '')

export function datasheetProfileKind(type: string): DatasheetProfileKind {
  switch (normalized(type)) {
    case 'unit':
      return 'unit'
    case 'rangedweapons':
      return 'ranged-weapon'
    case 'meleeweapons':
      return 'melee-weapon'
    case 'transport':
      return 'transport'
    case 'abilities':
      return 'rule'
    default:
      return 'other'
  }
}

const characteristicKinds: Readonly<Record<string, DatasheetCharacteristicKind>> = {
  m: 'movement',
  move: 'movement',
  movement: 'movement',
  t: 'toughness',
  toughness: 'toughness',
  sv: 'save',
  save: 'save',
  w: 'wounds',
  wounds: 'wounds',
  ld: 'leadership',
  leadership: 'leadership',
  oc: 'objective-control',
  objectivecontrol: 'objective-control',
  insv: 'invulnerable-save',
  invulnerablesave: 'invulnerable-save',
  range: 'range',
  a: 'attacks',
  attacks: 'attacks',
  bs: 'ballistic-skill',
  ballisticskill: 'ballistic-skill',
  ws: 'weapon-skill',
  weaponskill: 'weapon-skill',
  s: 'strength',
  strength: 'strength',
  ap: 'armour-penetration',
  armourpenetration: 'armour-penetration',
  armorpenetration: 'armour-penetration',
  d: 'damage',
  damage: 'damage',
  keywords: 'keywords',
}

export function datasheetCharacteristicKind(name: string): DatasheetCharacteristicKind {
  return characteristicKinds[normalized(name)] ?? 'other'
}

type DatasheetCharacteristic = Datasheet['profiles'][number]['values'][number] & { kind?: DatasheetCharacteristicKind }
type DatasheetProfile = Omit<Datasheet['profiles'][number], 'values'> & {
  kind?: DatasheetProfileKind
  values: DatasheetCharacteristic[]
}

export function datasheetProfileKindOf(profile: Pick<DatasheetProfile, 'type' | 'kind'>): DatasheetProfileKind {
  return profile.kind ?? datasheetProfileKind(profile.type)
}

export function datasheetCharacteristicKindOf(characteristic: Pick<DatasheetCharacteristic, 'name' | 'kind'>): DatasheetCharacteristicKind {
  return characteristic.kind ?? datasheetCharacteristicKind(characteristic.name)
}

export function structureDatasheetProfiles(profiles: readonly DatasheetProfile[]): StructuredDatasheetProfile[] {
  return profiles.map((profile) => ({
    ...profile,
    kind: datasheetProfileKindOf(profile),
    values: profile.values.map((value) => ({ ...value, kind: datasheetCharacteristicKindOf(value) })),
  }))
}

export function datasheetProfilesByKind(sheet: Pick<Datasheet, 'profiles'>) {
  const profiles = structureDatasheetProfiles(sheet.profiles)
  return {
    profiles,
    unit: profiles.filter((profile) => profile.kind === 'unit'),
    ranged: profiles.filter((profile) => profile.kind === 'ranged-weapon'),
    melee: profiles.filter((profile) => profile.kind === 'melee-weapon'),
    transport: profiles.filter((profile) => profile.kind === 'transport'),
    rules: profiles.filter((profile) => profile.kind === 'rule' || profile.kind === 'other'),
  }
}
