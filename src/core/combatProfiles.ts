import { groupBy, RecentlyUsed, remember, uniqueBy } from './collections'
import type { Datasheet, DatasheetCharacteristicKind } from './datasheet'
import { datasheetCharacteristicKind, datasheetProfileKind, datasheetProfilesByKind } from './datasheetStructure'
import { combatEquipmentMatches, combatModelMatches, type CombatCarrier } from './combatLoadout'
import { wargearBaseName, wargearKey } from './wargear'
import { combatSchema, diceExpression, type CombatInput, type CombatWeapon, type CombatPhase } from './combat'
import { combatKeyword, combatKeywordApplies, normalizeCombatKeyword as normalized } from './combatKeywords'
import { splitWeaponKeywords } from './ruleReference'
import { joinKey } from './text'

type Profile = ReturnType<typeof datasheetProfilesByKind>['profiles'][number]
const value = (profile: Profile, kind: DatasheetCharacteristicKind) => profile.values.find((entry) => entry.kind === kind)?.value.trim()
const integer = (text: string | undefined) => (text !== undefined && /^-?\d+\+?$/.test(text) ? Number(text.replace('+', '')) : null)
/**
 * The target as allocation groups (05.03) in datasheet order, with a label for each so a player can reorder them.
 * Carriers say how many models each profile has; they are only consulted when the profiles' defences differ.
 * Models holding different `splitKeywords` are separate groups, each listing the ones it holds.
 */
export function combatTarget(
  sheet: Datasheet,
  models: number,
  startingModels = models,
  carriers: readonly CombatCarrier[] = [],
  splitKeywords: readonly string[] = [],
): { target: CombatInput['target'] | null; labels: string[]; keywords: string[][]; error: string | null } {
  const refuse = (error: string) => ({ target: null, labels: [], keywords: [], error })
  const profiles = datasheetProfilesByKind(sheet).unit
  const feelNoPain = sheet.abilities.flatMap((ability) => {
    if (ability.kind !== 'core' || ability.models || (ability.source && startingModels !== 1)) return []
    const match = /^feel\s+no\s+pain\s+([2-6])\+$/.exec(normalized(ability.name))
    return match ? [Number(match[1])] : []
  })
  if (
    profiles.some((profile) => {
      const invulnerable = value(profile, 'invulnerable-save')
      return invulnerable !== undefined && invulnerable !== '-' && integer(invulnerable) === null
    })
  )
    return refuse('This unit has an unsupported invulnerable save.')
  if (!profiles.length) return refuse('This unit has no model profiles.')
  const carriedBy = (carrier: CombatCarrier, index: number) => combatModelMatches(carrier, profiles[index]!)
  const defences = profiles.map((profile, index) => ({
    name: profile.name,
    toughness: integer(value(profile, 'toughness')),
    save: integer(value(profile, 'save')),
    wounds: integer(value(profile, 'wounds')),
    invulnerable: integer(value(profile, 'invulnerable-save')),
    keywords: splitKeywords.filter((keyword) =>
      carriers.some((carrier) => carriedBy(carrier, index) && carrier.keywords?.some((held) => normalized(held) === normalized(keyword))),
    ),
  }))
  const key = ({ name: _name, ...stats }: (typeof defences)[number]) => JSON.stringify(stats)
  let counted: { defence: (typeof defences)[number]; models: number }[]
  if (defences.every((defence) => key(defence) === key(defences[0]!))) counted = [{ defence: defences[0]!, models }]
  else {
    const counts = defences.map(() => 0)
    for (const carrier of carriers) {
      if (carrier.unitWide) continue
      const matching = defences.flatMap((_, index) => (carriedBy(carrier, index) ? [index] : []))
      if (matching.length !== 1) return refuse(`${carrier.name} could not be matched to a model profile.`)
      counts[matching[0]!]! += carrier.models
    }
    if (counts.reduce((total, count) => total + count, 0) !== models) return refuse("Choose the defender's surviving models.")
    counted = defences.map((defence, index) => ({ defence, models: counts[index]! }))
  }
  const groups = new Map<string, { labels: string[]; keywords: string[]; group: Record<string, number | null> }>()
  for (const { defence, models: count } of counted) {
    if (!count) continue
    const existing = groups.get(key(defence))
    if (existing) {
      existing.labels.push(defence.name)
      existing.group.models = (existing.group.models ?? 0) + count
    } else {
      const { name, keywords, ...stats } = defence
      groups.set(key(defence), { labels: [name], keywords, group: { ...stats, models: count } })
    }
  }
  const target = combatSchema.shape.target.safeParse({
    groups: [...groups.values()].map((entry) => entry.group),
    feelNoPain: feelNoPain.length ? Math.min(...feelNoPain) : null,
  })
  return target.success
    ? {
        target: target.data,
        labels: [...groups.values()].map((entry) => entry.labels.join(' · ')),
        keywords: [...groups.values()].map((entry) => entry.keywords),
        error: null,
      }
    : refuse('This unit has missing or unsupported defensive characteristics.')
}

const parsedWeapons = new RecentlyUsed<string, ReturnType<typeof parseWeapon>>(5_000)

/** A weapon profile's characteristics and abilities, which depend on everything but how many are carried. */
const parsedWeapon = (profile: Profile, targetKeywords: readonly string[], phase: CombatPhase) =>
  remember(parsedWeapons, JSON.stringify([phase, targetKeywords, profile.name, profile.values]), () =>
    parseWeapon(profile, targetKeywords, phase),
  )

function parseWeapon(profile: Profile, targetKeywords: readonly string[], phase: CombatPhase) {
  const unsupported: string[] = []
  const baseSkill = integer(
    profile.values.find((entry) => entry.kind === (phase === 'ranged' ? 'ballistic-skill' : 'weapon-skill'))?.baseValue,
  )
  const weapon: CombatWeapon = {
    count: 1,
    ...(baseSkill ? { baseSkill } : {}),
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
  for (const written of splitWeaponKeywords(value(profile, 'keywords'))) {
    const ability = combatKeyword(written)
    if (!ability) {
      unsupported.push(written)
      continue
    }
    if (!combatKeywordApplies(ability, targetKeywords)) continue
    const { kind } = ability
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
        weapon.sustained = ability.amount!
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
      case 'indirect fire':
        weapon.indirectFire = true
        break
      case 'psychic':
        weapon.psychic = true
        break
      case 'blast':
        weapon.blast = Number(ability.amount)
        break
      case 'cleave':
        weapon.cleave = Number(ability.amount)
        break
      case 'one shot':
        weapon.oneShot = true
        break
      case 'rapid fire':
        weapon.rapidFire = ability.amount!
        break
      case 'melta':
        weapon.melta = ability.amount!
        break
      case 'heavy':
        weapon.heavy = true
        break
      case 'lance':
        weapon.lance = true
        break
      case 'anti':
        weapon.criticalWound = ability.critical!
        break
      case 'conversion':
        weapon.conversion = 'successfulCriticalHit'
        break
      case 'assault':
      case 'close-quarters':
      case 'extra attacks':
      case 'hazardous':
      case 'precision':
        break
    }
  }
  const parsed = combatSchema.shape.weapons.element.safeParse(weapon)
  return {
    weapon,
    unsupported,
    valid: parsed.success && weapon.attacks.dice + weapon.attacks.bonus > 0 && weapon.damage.dice + weapon.damage.bonus > 0,
  }
}

// Only this printing omits "successful", so a 4 a penalty would fail still crits; sheets hold keyword rule text as tokens, so its name identifies it.
const conversionIgnoresFailure = (sheet: Datasheet) =>
  sheet.keywordRules.some(({ name }) => joinKey(name) === joinKey('Conversion (Thunderkyn)'))

export function combatWeapons(sheet: Datasheet, targetKeywords: readonly string[], phase: CombatPhase) {
  return datasheetProfilesByKind(sheet)[phase].map((profile) => {
    const { weapon, unsupported, valid: characteristics } = parsedWeapon(profile, targetKeywords, phase)
    const count = profile.count ?? 0
    const valid = characteristics && Number.isInteger(count) && count >= 1 && count <= 100
    return {
      profile,
      weapon:
        valid && !unsupported.length
          ? { ...weapon, count, ...(weapon.conversion && conversionIgnoresFailure(sheet) ? { conversion: 'criticalHit' as const } : {}) }
          : null,
      error: unsupported.length
        ? `Unsupported: ${unsupported.join(', ')}.`
        : valid
          ? null
          : 'Missing or unsupported weapon characteristics or count.',
    }
  })
}

export type CombatWeaponChoice = { key: string; label: string; value: string; options: { value: string; label: string }[] }

export const SHOOTING_TYPE_KEY = 'ranged:shooting-type'
const SHOOTING_TYPES = {
  normal: 'Normal',
  'engaged-target': 'Normal, target engaged',
  assault: 'Assault (advanced this turn)',
  'close-quarters': 'Close-quarters (engaged)',
} as const
type ShootingType = keyof typeof SHOOTING_TYPES

const has = (profile: Profile, keyword: string) =>
  splitWeaponKeywords(value(profile, 'keywords')).some((written) => combatKeyword(written)?.kind === keyword)
const namesMonsterOrVehicle = (keywords: readonly string[]) =>
  keywords.some((keyword) => ['monster', 'vehicle'].includes(normalized(keyword)))

const canFire = (sheet: Datasheet, profile: Profile, type: ShootingType) => {
  if (type === 'assault') return has(profile, 'assault')
  if (type === 'engaged-target') return !has(profile, 'blast')
  if (type === 'close-quarters') return namesMonsterOrVehicle(sheet.keywords) ? !has(profile, 'blast') : has(profile, 'close-quarters')
  return true
}

/** The weapon as it attacks under a shooting type, or null when that type cannot use it. */
export function weaponInShootingType<Weapon extends Pick<CombatWeapon, 'hitModifier' | 'conversion'>>(
  sheet: Datasheet,
  profile: Profile,
  weapon: Weapon,
  type: ShootingType,
) {
  if (!canFire(sheet, profile, type)) return null
  const penalised =
    type === 'engaged-target' || (type === 'close-quarters' && namesMonsterOrVehicle(sheet.keywords) && !has(profile, 'close-quarters'))
  // An engaged target is never beyond Conversion's distance.
  const eligible = type === 'close-quarters' ? { ...weapon, conversion: undefined } : weapon
  return penalised ? { ...eligible, hitModifier: (eligible.hitModifier ?? 0) - 1 } : eligible
}

/** A unit shoots with one type, so what it may choose is what any member allows, and a saved type it cannot use is normal shooting. */
export function resolveShootingType(
  members: readonly { sheet: Datasheet; carriers: readonly CombatCarrier[] }[],
  targetKeywords: readonly string[],
  preferences: Readonly<Record<string, string>>,
) {
  const carried = members.flatMap(({ sheet, carriers }) =>
    datasheetProfilesByKind(sheet).ranged.filter((profile) =>
      carriers.some(({ weapons }) => weapons.some((piece) => combatEquipmentMatches(piece, profile))),
    ),
  )
  const types: ShootingType[] = [
    'normal',
    ...(namesMonsterOrVehicle(targetKeywords) ? (['engaged-target'] as const) : []),
    ...(carried.some((profile) => has(profile, 'assault')) ? (['assault'] as const) : []),
    ...(members.some(({ sheet }) => namesMonsterOrVehicle(sheet.keywords)) || carried.some((profile) => has(profile, 'close-quarters'))
      ? (['close-quarters'] as const)
      : []),
  ]
  return { types, chosen: types.find((type) => type === preferences[SHOOTING_TYPE_KEY]) ?? 'normal' }
}

export const shootingTypeChoice = (types: readonly ShootingType[], chosen: ShootingType): CombatWeaponChoice => ({
  key: SHOOTING_TYPE_KEY,
  label: 'Shooting type',
  value: chosen,
  options: types.map((type) => ({ value: type, label: SHOOTING_TYPES[type] })),
})

export function combatPlan(
  sheet: Datasheet,
  carriers: readonly CombatCarrier[],
  targetKeywords: readonly string[],
  phase: CombatPhase,
  preferences: Readonly<Record<string, string>> = {},
  excluded: ReadonlySet<string> = new Set(),
  shootingType: ShootingType = 'normal',
) {
  const counts = new Map<string, number>()
  const choices: CombatWeaponChoice[] = []
  const errors: string[] = []
  const choose = (key: string, label: string, options: CombatWeaponChoice['options']) => {
    const selected = options.find((option) => option.value === preferences[key]) ?? options[0]
    if (selected && options.length > 1) choices.push({ key, label, options, value: selected.value })
    return selected?.value
  }
  const selectedSheet = {
    ...sheet,
    profiles: sheet.profiles.map((profile) => ({
      ...profile,
      values: profile.values.map((entry) => {
        if (datasheetProfileKind(profile.type) !== `${phase}-weapon` || datasheetCharacteristicKind(entry.name) !== 'keywords') return entry
        const keywords = [...new Set(splitWeaponKeywords(entry.value))]
        const applying = keywords.filter((word) => {
          const parsed = combatKeyword(word)
          return parsed && combatKeywordApplies(parsed, targetKeywords)
        })
        const groups = groupBy(applying, (word) => combatKeyword(word)!.kind)
        const omitted = new Set<string>()
        for (const [kind, alternatives] of groups) {
          if (alternatives.length < 2 || kind === 'close-quarters') continue
          // Alternatives that differ only in which targets they reach, as Lethal Hits and Lethal Hits: Non-Monster/Vehicle
          // against Infantry, do the same here and are no choice.
          const distinct = uniqueBy(alternatives, (word) => {
            const { target, ...effect } = combatKeyword(word)!
            return JSON.stringify(kind === 'anti' ? { ...effect, target } : effect)
          })
          const selected = choose(
            `${phase}:ability:${profile.id}:${kind}`,
            `${profile.name} · Weapon ability`,
            distinct.map((word) => ({ value: word, label: word })),
          )
          alternatives.filter((word) => word !== selected).forEach((word) => omitted.add(word))
        }
        return omitted.size ? { ...entry, value: keywords.filter((word) => !omitted.has(word)).join(', ') } : entry
      }),
    })),
  }
  const profiles = combatWeapons(selectedSheet, targetKeywords, phase)
  const unrestricted = namesMonsterOrVehicle(sheet.keywords)
  const accounted = new Map<string, number>()
  const idleModes = new Set<string>()
  for (const [at, carrier] of carriers.entries()) {
    const equipment = carrier.weapons.flatMap((piece) => {
      const modes = profiles.filter(({ profile }) => combatEquipmentMatches(piece, profile))
      for (const { profile } of modes) accounted.set(profile.id, (accounted.get(profile.id) ?? 0) + piece.count)
      if (!modes.length) return []
      const modeKey = `${phase}:${at}:${wargearBaseName(piece.name, true)}`
      const selected = choose(
        modeKey,
        `${carrier.name} · ${piece.name}`,
        modes.map(({ profile }) => ({ value: profile.id, label: profile.name })),
      )
      const mode = modes.find(({ profile }) => profile.id === selected)!
      return [{ ...mode, count: piece.count, modeKey }]
    })
    const attacking = new Set<string>()
    const add = (entry: (typeof equipment)[number], count = entry.count) => {
      if (
        entry.weapon?.oneShot &&
        choose(`${phase}:${at}:${entry.profile.id}:one-shot`, `${carrier.name} · ${entry.profile.name}`, [
          { value: 'available', label: 'One Shot available' },
          { value: 'spent', label: 'Already fired' },
        ]) === 'spent'
      )
        return
      if (count > 0) {
        attacking.add(entry.modeKey)
        counts.set(entry.profile.id, (counts.get(entry.profile.id) ?? 0) + count)
      }
    }
    if (phase === 'ranged') {
      const allowed = equipment.filter(({ profile }) => canFire(sheet, profile, shootingType))
      if (shootingType === 'close-quarters') {
        allowed.forEach((entry) => add(entry))
      } else {
        const ordinary = allowed.filter(({ profile }) => !has(profile, 'close-quarters'))
        const close = allowed.filter(({ profile }) => has(profile, 'close-quarters'))
        const group = choose(`ranged:${at}:group`, `${carrier.name} shooting`, [
          ...(ordinary.length ? [{ value: 'ordinary', label: 'Ranged weapons' }] : []),
          ...(close.length && !unrestricted ? [{ value: 'close', label: 'Close-Quarters weapons' }] : []),
        ])
        const selected = unrestricted ? allowed : group === 'close' ? close : ordinary
        selected.forEach((entry) => add(entry))
      }
    } else {
      if (carrier.unitWide && equipment.length) {
        errors.push(`${carrier.name}: melee allocation needs individual model ownership.`)
        continue
      }
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
    for (const { modeKey } of equipment) if (!attacking.has(modeKey)) idleModes.add(modeKey)
  }
  for (const { profile } of profiles) {
    if (accounted.get(profile.id) !== profile.count) errors.push(`${profile.name}: equipped weapons could not be matched to their models.`)
  }
  const used = profiles.flatMap((entry) => {
    const count = counts.get(entry.profile.id) ?? 0
    if (!count) return []
    return [
      {
        ...entry,
        count,
        weapon: phase === 'ranged' && entry.weapon ? weaponInShootingType(sheet, entry.profile, entry.weapon, shootingType) : entry.weapon,
      },
    ]
  })
  const active = used.filter((entry) => !excluded.has(wargearKey(entry.profile.name, true)))
  for (const entry of active) if (entry.error) errors.push(`${entry.profile.name}: ${entry.error}`)
  return {
    used,
    active,
    choices: choices.filter((choice) => !idleModes.has(choice.key)),
    errors: [...new Set(errors)],
    weapons: active.flatMap(({ weapon, count }) => (weapon ? [{ ...weapon, count }] : [])),
  }
}
