import type { CombatPhase } from './combat'
import { joinKey } from './text'
import type { Datasheet, DatasheetCharacteristicKind, DatasheetProfileKind, StructuredDatasheetProfile } from './datasheet'
import { remember } from './collections'

// Profile types and characteristic names are a small catalogue vocabulary, and attack plans classify them per candidate.
const profileKinds = new Map<string, DatasheetProfileKind>()
const characteristicKindsByName = new Map<string, DatasheetCharacteristicKind>()

export const datasheetProfileKind = (type: string): DatasheetProfileKind => remember(profileKinds, type, () => profileKindOf(type))

/** The phase a weapon profile type attacks in; null for a profile that is not a weapon. */
export function weaponPhase(type: string): CombatPhase | null {
  const kind = datasheetProfileKind(type)
  return kind === 'ranged-weapon' ? 'ranged' : kind === 'melee-weapon' ? 'melee' : null
}

function profileKindOf(type: string): DatasheetProfileKind {
  switch (joinKey(type)) {
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
  base: 'base-size',
  basesize: 'base-size',
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

export const datasheetCharacteristicKind = (name: string): DatasheetCharacteristicKind =>
  remember(characteristicKindsByName, name, () => characteristicKinds[joinKey(name)] ?? 'other')

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

/** The unit profiles' Base characteristic, as the datacards write a base size: one value, or a `Model: size` line per model when they differ. */
export function profileBaseSize(profiles: readonly DatasheetProfile[]): string | null {
  const bases = profiles.flatMap((profile) => {
    const value = profile.values.find((characteristic) => datasheetCharacteristicKindOf(characteristic) === 'base-size')?.value.trim()
    return value && datasheetProfileKindOf(profile) === 'unit' ? [{ name: profile.name, value }] : []
  })
  if (new Set(bases.map((base) => base.value)).size <= 1) return bases[0]?.value ?? null
  return bases.map((base) => `${base.name}: ${base.value}`).join('\n')
}
