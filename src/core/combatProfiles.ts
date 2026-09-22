import type { Datasheet, DatasheetCharacteristicKind } from '../contracts/catalogue'
import { datasheetProfilesByKind } from './datasheetStructure'
import type { CombatCarrier } from './combatLoadout'
import { sameWargear, wargearBaseName } from './wargear'
import { combatSchema, diceExpression, type CombatInput, type CombatWeapon } from './combat'

type Profile = ReturnType<typeof datasheetProfilesByKind>['profiles'][number]
const value = (profile: Profile, kind: DatasheetCharacteristicKind) => profile.values.find((entry) => entry.kind === kind)?.value.trim()
const integer = (text: string | undefined) => (text !== undefined && /^-?\d+\+?$/.test(text) ? Number(text.replace('+', '')) : null)
const normalized = (text: string) =>
  text
    .replaceAll(/\p{Pd}/gu, '-')
    .replaceAll(/[[\]]/g, '')
    .trim()
    .toLowerCase()

const weaponAbility = (text: string) => normalized(text).replace(/^pistol$/, 'close-quarters')

export function combatTarget(sheet: Datasheet, models: number): { target: CombatInput['target'] | null; error: string | null } {
  const profiles = datasheetProfilesByKind(sheet).unit
  const feelNoPain = sheet.abilities.flatMap((ability) => {
    if (ability.kind !== 'core' || (ability.source && models !== 1)) return []
    const match = /^feel\s+no\s+pain\s+([2-6])\+$/.exec(normalized(ability.name))
    return match ? [Number(match[1])] : []
  })
  if (
    profiles.some((profile) => {
      const invulnerable = value(profile, 'invulnerable-save')
      return invulnerable !== undefined && invulnerable !== '-' && integer(invulnerable) === null
    })
  )
    return { target: null, error: 'This unit has an unsupported invulnerable save.' }
  const targets = profiles.map((profile) => ({
    models,
    toughness: integer(value(profile, 'toughness')),
    save: integer(value(profile, 'save')),
    wounds: integer(value(profile, 'wounds')),
    invulnerable: integer(value(profile, 'invulnerable-save')),
    feelNoPain: feelNoPain.length ? Math.min(...feelNoPain) : null,
  }))
  if (!targets.length) return { target: null, error: 'This unit has no model profiles.' }
  if (targets.some((target) => JSON.stringify(target) !== JSON.stringify(targets[0])))
    return {
      target: null,
      error: 'Targets with different model defences are not supported yet. Choose a unit whose models share Toughness, Save and Wounds.',
    }
  const target = combatSchema.shape.target.safeParse(targets[0])
  return target.success
    ? { target: target.data, error: null }
    : { target: null, error: 'This unit has missing or unsupported defensive characteristics.' }
}

export function combatWeapons(sheet: Datasheet, targetKeywords: readonly string[], phase: CombatInput['options']['phase']) {
  const keywords = new Set(targetKeywords.map(normalized))
  const profiles = datasheetProfilesByKind(sheet)[phase]
  return profiles.map((profile) => {
    const unsupported: string[] = []
    const weapon: CombatWeapon = {
      count: profile.count ?? 0,
      attacks: diceExpression(value(profile, 'attacks') ?? '') ?? { dice: 0, sides: 6, bonus: 0 },
      skill: integer(value(profile, phase === 'ranged' ? 'ballistic-skill' : 'weapon-skill')) ?? 0,
      strength: integer(value(profile, 'strength')) ?? 0,
      ap: integer(value(profile, 'armour-penetration')) ?? 1,
      damage: diceExpression(value(profile, 'damage') ?? '') ?? { dice: 0, sides: 6, bonus: 0 },
      torrent: false,
      lethal: false,
      sustained: 0,
      devastating: false,
      criticalWound: 6,
      twinLinked: false,
      ignoresCover: false,
      psychic: false,
      blast: 0,
      rapidFire: 0,
      melta: 0,
      heavy: false,
      lance: false,
    }
    const seen = new Set<string>()
    for (const written of (value(profile, 'keywords') ?? '')
      .split(/,|;/)
      .map((part) => part.trim())
      .filter((part) => part && part !== '-')) {
      const [ability = '', restriction] = normalized(written).split(/\s*:\s*/)
      if (restriction && !restriction.split('/').some((keyword) => keywords.has(keyword.trim()))) continue
      const numbered = /^(sustained hits|rapid fire|melta|blast)\s+(\d+)$/.exec(ability)
      const anti = /^anti-(.+) ([2-6])\+$/.exec(ability)
      const kind = numbered?.[1] ?? (anti ? 'anti' : weaponAbility(ability))
      if (seen.has(kind)) {
        if (kind !== 'close-quarters') unsupported.push(`${written} (multiple instances)`)
        continue
      }
      seen.add(kind)
      switch (kind) {
        case 'torrent':
          weapon.torrent = true
          weapon.skill ||= 2
          break
        case 'lethal hits':
          weapon.lethal = true
          break
        case 'sustained hits':
          weapon.sustained = Number(numbered?.[2])
          break
        case 'devastating wounds':
          weapon.devastating = true
          break
        case 'twin-linked':
          weapon.twinLinked = true
          break
        case 'ignores cover':
          weapon.ignoresCover = true
          break
        case 'psychic':
          weapon.psychic = true
          break
        case 'blast':
          weapon.blast = Number(numbered?.[2] ?? 1)
          break
        case 'rapid fire':
          weapon.rapidFire = Number(numbered?.[2])
          break
        case 'melta':
          weapon.melta = Number(numbered?.[2])
          break
        case 'heavy':
          weapon.heavy = true
          break
        case 'lance':
          weapon.lance = true
          break
        case 'anti':
          if (anti?.[1] && keywords.has(anti[1])) weapon.criticalWound = Number(anti[2])
          break
        case 'assault':
        case 'close-quarters':
        case 'extra attacks':
        case 'hazardous':
        case 'precision':
          break
        default:
          unsupported.push(written)
      }
    }
    const parsed = combatSchema.shape.weapons.element.safeParse(weapon)
    const valid = parsed.success && weapon.attacks.dice + weapon.attacks.bonus > 0 && weapon.damage.dice + weapon.damage.bonus > 0
    return {
      profile,
      weapon: valid && !unsupported.length ? weapon : null,
      error: unsupported.length
        ? `Unsupported: ${unsupported.join(', ')}.`
        : valid
          ? null
          : 'Missing or unsupported weapon characteristics or count.',
    }
  })
}

export type CombatWeaponChoice = { key: string; label: string; value: string; options: { value: string; label: string }[] }

export function combatPlan(
  sheet: Datasheet,
  carriers: readonly CombatCarrier[],
  targetKeywords: readonly string[],
  phase: CombatInput['options']['phase'],
  preferences: Readonly<Record<string, string>> = {},
) {
  const profiles = combatWeapons(sheet, targetKeywords, phase)
  const counts = new Map<string, number>()
  const choices: CombatWeaponChoice[] = []
  const errors: string[] = []
  const choose = (key: string, label: string, options: CombatWeaponChoice['options']) => {
    const selected = options.find((option) => option.value === preferences[key]) ?? options[0]
    if (selected && options.length > 1) choices.push({ key, label, options, value: selected.value })
    return selected?.value
  }
  const has = (profile: Profile, keyword: string) =>
    (value(profile, 'keywords') ?? '').split(/,|;/).some((written) => weaponAbility(written) === keyword)
  const unrestricted = sheet.keywords.some((keyword) => ['monster', 'vehicle'].includes(normalized(keyword)))
  const accounted = new Map<string, number>()
  for (const [at, carrier] of carriers.entries()) {
    const equipment = carrier.weapons.flatMap((piece) => {
      const modes = profiles.filter(({ profile }) => sameWargear(piece.name, profile.name))
      for (const { profile } of modes) accounted.set(profile.id, (accounted.get(profile.id) ?? 0) + piece.count)
      if (!modes.length) return []
      const selected = choose(
        `${phase}:${at}:${wargearBaseName(piece.name)}`,
        `${carrier.name} · ${piece.name}`,
        modes.map(({ profile }) => ({ value: profile.id, label: profile.name })),
      )
      const mode = modes.find(({ profile }) => profile.id === selected)!
      return [{ ...mode, count: piece.count }]
    })
    const add = (entry: (typeof equipment)[number], count = entry.count) => {
      if (count > 0) counts.set(entry.profile.id, (counts.get(entry.profile.id) ?? 0) + count)
    }
    if (phase === 'ranged') {
      const ordinary = equipment.filter(({ profile }) => !has(profile, 'close-quarters'))
      const close = equipment.filter(({ profile }) => has(profile, 'close-quarters'))
      const group = choose(`ranged:${at}:group`, `${carrier.name} shooting`, [
        ...(ordinary.length ? [{ value: 'ordinary', label: 'Ranged weapons' }] : []),
        ...(close.length && !unrestricted ? [{ value: 'close', label: 'Close-Quarters weapons' }] : []),
      ])
      const selected = unrestricted ? equipment : group === 'close' ? close : ordinary
      selected.forEach((entry) => add(entry))
    } else {
      const normal = equipment.filter(({ profile }) => !has(profile, 'extra attacks'))
      const partial = normal.filter((entry) => entry.count < carrier.models)
      if (partial.length > 1) errors.push(`${carrier.name}: melee allocation needs individual model ownership.`)
      const ordered = [...partial, ...normal.filter((entry) => entry.count >= carrier.models)]
      const selected = choose(
        `melee:${at}:weapon`,
        `${carrier.name} melee`,
        ordered.map(({ profile }) => ({ value: profile.id, label: profile.name })),
      )
      const main = normal.find(({ profile }) => profile.id === selected)
      if (main) {
        add(main, Math.min(main.count, carrier.models))
        const remainder = carrier.models - main.count
        const fallback = normal.find((entry) => entry.count >= carrier.models)
        if (remainder > 0 && fallback) add(fallback, remainder)
      }
      equipment.filter(({ profile }) => has(profile, 'extra attacks')).forEach((entry) => add(entry))
    }
  }
  for (const { profile } of profiles) {
    if (accounted.get(profile.id) !== profile.count) errors.push(`${profile.name}: equipped weapons could not be matched to their models.`)
  }
  const used = profiles.flatMap((entry) => {
    const count = counts.get(entry.profile.id) ?? 0
    return count ? [{ ...entry, count }] : []
  })
  for (const entry of used) if (entry.error) errors.push(`${entry.profile.name}: ${entry.error}`)
  return {
    used,
    choices,
    errors: [...new Set(errors)],
    weapons: used.flatMap(({ weapon, count }) => (weapon ? [{ ...weapon, count }] : [])),
  }
}
