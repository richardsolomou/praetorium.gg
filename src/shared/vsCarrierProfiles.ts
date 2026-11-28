import type { CombatCarrier } from '../core/combatLoadout'
import type { Datasheet } from '../core/datasheet'
import { datasheetCharacteristicKind } from '../core/datasheetStructure'
import { normalizedName, normalizedNameVariants } from '../core/name'
import { splitWeaponKeywords } from '../core/ruleReference'
import { wargearKey } from '../core/wargearNames'
import { inBook } from './vsDataPoints'
import { namesWeaponLine, type VsProfilesIndex, type VsStatValues, type WeaponLine } from './vsDataProfiles'
import { ARTICLE, vsKeySpelling } from './wargearSpellings'

/**
 * VS Data's carriers with each weapon naming the datasheet profiles it fires. A datasheet can print a weapon once for each
 * kind of model, so a weapon fires the profiles the catalogue's own carrier of its model fires under that name; else every
 * profile of its name, in VS Data's spelling; else those any catalogue carrier fires under it, as a Librarian's Force
 * Weapon is several profiles named otherwise.
 */
export function vsCarriersFiring(
  carriers: readonly CombatCarrier[],
  profiles: readonly Datasheet['profiles'][number][],
  catalogue: readonly CombatCarrier[],
): CombatCarrier[] {
  // VS Data and BSData each print a leading article on names the other prints without one.
  const keyOf = (name: string) => wargearKey(name, true).replace(ARTICLE, '')
  const vsKeys = new Set(carriers.flatMap((carrier) => carrier.weapons.map((weapon) => keyOf(weapon.name))))
  const spelled = (name: string) => vsKeySpelling(wargearKey(name, true), vsKeys)
  const fired = catalogue.flatMap((carrier) =>
    carrier.weapons.flatMap((weapon) =>
      weapon.profileIds ? [{ model: normalizedName(carrier.name), key: spelled(weapon.name), ids: weapon.profileIds }] : [],
    ),
  )
  return carriers.map((carrier) => {
    // A model may be named in the singular by one source and the plural by the other, as Aggressor and Aggressors.
    const models = normalizedNameVariants(carrier.name)
    // A model fights with its first weapon unless the player picks another, so its weapons keep the order the catalogue's
    // carrier of that model holds them in, then the datasheet's.
    const own = fired.filter((entry) => models.includes(entry.model))
    const at = (weapon: CombatCarrier['weapons'][number]) => {
      const held = own.findIndex((entry) => entry.ids.some((id) => weapon.profileIds?.includes(id)))
      const printed = profiles.findIndex((profile) => weapon.profileIds?.includes(profile.id))
      return held >= 0 ? held : own.length + (printed < 0 ? profiles.length : printed)
    }
    return {
      ...carrier,
      weapons: carrier.weapons
        .map((weapon) => {
          if (weapon.profileIds) return weapon
          const key = keyOf(weapon.name)
          const named = [...new Set(profiles.filter((profile) => spelled(profile.name) === key).map((profile) => profile.id))]
          const profileIds =
            own.find((entry) => entry.key === key)?.ids ?? (named.length ? named : fired.find((entry) => entry.key === key)?.ids)
          return profileIds ? { ...weapon, profileIds } : weapon
        })
        .toSorted((left, right) => at(left) - at(right)),
    }
  })
}

const LABELS = {
  range: 'Range',
  attacks: 'A',
  'ballistic-skill': 'BS',
  'weapon-skill': 'WS',
  strength: 'S',
  'armour-penetration': 'AP',
  damage: 'D',
  keywords: 'Keywords',
} as const satisfies Partial<Record<keyof VsStatValues, string>>

type Profile = Datasheet['profiles'][number]

// A characteristic no roll makes, as a Torrent weapon's skill, is printed `-` by some catalogue profiles and `N/A` by
// others, and keywords in any case and order.
const valueKey = (value: string) => (value.trim() === '-' ? 'n/a' : value.trim().toLowerCase())
const keywordsKey = (value: string) => JSON.stringify(splitWeaponKeywords(value.toLowerCase()).toSorted())
const characteristic = (profile: Profile, kind: keyof VsStatValues) =>
  profile.values.find((entry) => datasheetCharacteristicKind(entry.name) === kind)
const printsValues = (line: WeaponLine, profile: Profile) =>
  line.melee === (profile.type === 'Melee Weapons') &&
  profile.values.every(({ name, value, baseValue }) => {
    const kind = datasheetCharacteristicKind(name) as keyof VsStatValues
    const own = line.values[kind]
    const key = kind === 'keywords' ? keywordsKey : valueKey
    return !own || key(own) === key(baseValue ?? value)
  })
/** The catalogue profile a VS Data line stands for: the first naming it, else the first printing its values. */
const printedAs = (printed: readonly Profile[], line: WeaponLine) =>
  printed.find((profile) => namesWeaponLine(line, profile)) ?? printed.find((profile) => printsValues(line, profile))

/**
 * A characteristic as VS Data prints it, changed as the catalogue changes it on the profile the line stands for: the
 * catalogue applies a unit's abilities to its weapons, as Corvus Blackstar's to Ignores Cover, where VS Data prints the
 * weapon alone. A value VS Data prints otherwise than the catalogue's base is VS Data's.
 */
function modified(kind: keyof VsStatValues, value: string, catalogue: Profile['values'][number] | undefined) {
  if (catalogue?.baseValue === undefined || catalogue.baseValue === catalogue.value) return { value }
  const sources = catalogue.modifiers ? { modifiers: catalogue.modifiers } : {}
  if (kind !== 'keywords') return valueKey(catalogue.baseValue) === valueKey(value) ? { value: catalogue.value, baseValue: value, ...sources } : { value }
  const held = (list: string) => new Set(splitWeaponKeywords(list).map((keyword) => keyword.toLowerCase()))
  const base = held(catalogue.baseValue)
  const own = held(value)
  const added = splitWeaponKeywords(catalogue.value).filter((keyword) => !base.has(keyword.toLowerCase()) && !own.has(keyword.toLowerCase()))
  return added.length ? { value: [value, ...added].filter(Boolean).join(', '), baseValue: value, ...sources } : { value }
}

/** A VS Data weapon profile as a datasheet prints one, its skill the one its phase uses, with the catalogue's changes. */
const profileOf = (line: WeaponLine, catalogue: Profile | undefined): Profile => ({
  id: line.id,
  name: line.name,
  type: line.melee ? 'Melee Weapons' : 'Ranged Weapons',
  values: (Object.keys(LABELS) as (keyof typeof LABELS)[]).flatMap((kind) => {
    // A weapon VS Data prints without keywords can still be given some.
    const value = line.values[kind] ?? (kind === 'keywords' ? '' : undefined)
    if (value === undefined || kind === (line.melee ? 'ballistic-skill' : 'weapon-skill')) return []
    const written = modified(kind, value, catalogue && characteristic(catalogue, kind))
    return written.value ? [{ name: LABELS[kind], ...written }] : []
  }),
})

/**
 * A VS pick's weapons as VS Data prints them, with each carried weapon firing the VS Data profiles of the wargear it is,
 * in the order `catalogueFiring` (`vsCarriersFiring`) keeps; null where VS Data prints no weapon profiles for the
 * datasheet, or a weapon the catalogue fires has none or one it cannot read, which leaves the unit to the catalogue's
 * profiles.
 */
export function vsDataFiring(
  index: VsProfilesIndex | undefined,
  catalogueId: string,
  entryId: string,
  catalogueFiring: readonly CombatCarrier[],
  catalogueProfiles: readonly Datasheet['profiles'][number][],
): { weapons: Datasheet['profiles']; carriers: CombatCarrier[] } | null {
  const unit = inBook(index?.units, catalogueId, entryId)
  const lines = unit ? index?.lines[unit]?.weapons : undefined
  if (!lines?.length) return null
  const byId = new Map(catalogueProfiles.map((profile) => [profile.id, profile]))
  // Weapons attack in the order the datasheet prints them, and a weapon fires its first mode unless the player picks
  // another, so both keep the catalogue's order of the profiles the lines stand for, then VS Data's.
  const inOrderOf = (printed: readonly Profile[], among: readonly WeaponLine[]) => {
    const at = (line: WeaponLine) => {
      const found = printed.indexOf(printedAs(printed, line)!)
      return found < 0 ? printed.length : found
    }
    return among.toSorted((left, right) => at(left) - at(right))
  }
  // A line stands for the profiles its own weapons fire in the catalogue before any other the datasheet prints.
  const standsFor = new Map<string, Profile[]>()
  const fires = (weapon: CombatCarrier['weapons'][number]) => {
    const printed = (weapon.profileIds ?? []).flatMap((id) => byId.get(id) ?? [])
    const own = lines.filter((line) => line.wargear && weapon.wargear?.includes(line.wargear))
    for (const line of own) {
      const found = printedAs(printed, line)
      if (found) standsFor.set(line.id, [...(standsFor.get(line.id) ?? []), found])
    }
    return inOrderOf(printed, own).map((line) => line.id)
  }
  const firing = catalogueFiring.map((carrier) => carrier.weapons.map(fires))
  // VS Data names a Hunter mode without the targets it is limited to, which leaves it unreadable here.
  const targetless = new Set(lines.filter((line) => / - hunter$/i.test(line.name)).map((line) => line.id))
  // Models the catalogue prints the weapon differently for, as a Stormboy's Slugga with Lethal Hits beside the Nob's
  // without, cannot share VS Data's one line, so the unit keeps the catalogue's profiles.
  const printing = (profile: Profile) => JSON.stringify(profile.values.map(({ name, value }) => [name, value]))
  const split = [...standsFor.values()].some((profiles) => new Set(profiles.map(printing)).size > 1)
  const unread = split || catalogueFiring.some((carrier, at) =>
    carrier.weapons.some(
      (weapon, step) => (weapon.profileIds?.length && !firing[at]![step]!.length) || firing[at]![step]!.some((id) => targetless.has(id)),
    ),
  )
  if (unread) return null
  const carriers = catalogueFiring.map((carrier, at) => ({
    ...carrier,
    weapons: carrier.weapons.map(({ profileIds: _catalogue, ...weapon }, step) => {
      const profileIds = firing[at]![step]!
      return profileIds.length ? { ...weapon, profileIds } : weapon
    }),
  }))
  return {
    weapons: inOrderOf(catalogueProfiles, lines).map((line) => profileOf(line, standsFor.get(line.id)?.[0] ?? printedAs(catalogueProfiles, line))),
    carriers,
  }
}
