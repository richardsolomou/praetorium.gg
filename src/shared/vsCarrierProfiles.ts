import type { CombatCarrier } from '../core/combatLoadout'
import type { Datasheet } from '../core/datasheet'
import { normalizedName, normalizedNameVariants } from '../core/name'
import { wargearKey } from '../core/wargearNames'
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
