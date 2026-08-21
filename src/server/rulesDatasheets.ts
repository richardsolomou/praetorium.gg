import path from 'node:path'
import { factionDirectories, joinKey, readOptionalList, titleCase } from './rulesSource'

/**
 * What a datasheet says a unit is built from: its kinds of model, what each carries,
 * and what it may carry instead.
 *
 * The catalogue we price from splits a kind of model into one entry per loadout, which
 * is bookkeeping rather than what a datasheet says. This is the datasheet's own answer,
 * read from the rules source, so a sergeant standing beside his veterans is a fact
 * rather than a shape inferred from the pricing data.
 */

export type UnitComposition = {
  unitId: string
  models: {
    name: string
    /** The profile the kind shares with its siblings, when the data separates the two. */
    profile: string | null
    min: number
    max: number
    leader: boolean
    /**
     * The weapons it starts with. The id is kept because names repeat across
     * factions — several books have a "Power weapon", and only the id says which.
     */
    weapons: { id: string; name: string }[]
  }[]
  /** What a kind of model may carry instead of what it starts with. */
  options: {
    /** The upstream id, so a player's pick can point at one swap and stay pointed. */
    id: string
    /** The kind this applies to, as the composition names it. */
    model: string | null
    gives: { id: string; name: string }[]
    /** Each entry is one alternative; an alternative may be several weapons at once. */
    takes: { id: string; name: string }[][]
    /** Whether the swap costs points, which decides whether it can be offered at all. */
    free: boolean
  }[]
}

/** A weapon as the rules source describes it, ready to be shown as a profile. */
export type LoadedWeapon = {
  name: string
  melee: boolean
  profiles: { name: string; melee: boolean; range: string; stats: { name: string; value: string }[]; keywords: string[] }[]
}

type RawWargearOption = {
  id?: string
  unit_id?: string
  is_free?: boolean
  replaces?: string[]
  replacement?: string[]
  replacement_choice?: string[][]
  model_constraint?: { model_name?: string }
}

type RawComposition = {
  unit_id?: string
  models?: {
    name?: string
    profile_name?: string
    min?: number
    max?: number
    is_leader_model?: boolean
    default_weapon_ids?: string[]
  }[]
}

type RawWeapon = {
  id?: string
  name?: string
  type?: string
  profiles?: {
    name?: string
    range?: number | string
    stats?: Record<string, number | string | null>
    keywords?: { keyword_id?: string; parameters?: Record<string, number | string> }[]
  }[]
}

/** The order a datasheet prints weapon characteristics in. */
const RANGED_STATS = ['A', 'BS', 'S', 'AP', 'D']
const MELEE_STATS = ['A', 'WS', 'S', 'AP', 'D']

/** "anti" with a target and a threshold reads as "Anti-Infantry 4+" on the card. */
function keywordLabel(keyword: { keyword_id?: string; parameters?: Record<string, number | string> }) {
  const name = titleCase((keyword.keyword_id ?? '').replaceAll('-', ' '))
  const target = keyword.parameters?.target_keyword
  const threshold = keyword.parameters?.threshold
  if (target && threshold) return `${name}-${target} ${threshold}+`
  const value = keyword.parameters ? Object.values(keyword.parameters)[0] : undefined
  return value === undefined ? name : `${name} ${value}`
}

/**
 * Weapons by id, and the name of everything else a model can carry.
 *
 * Both are needed before a composition can be read, because a composition holds ids
 * and only this says what they are. Not everything carried is a weapon: a shield has a
 * name and a rule but no profile, and a swap that grants one still has to name it.
 */
export function loadWeapons(core: string): { weapons: Map<string, LoadedWeapon>; names: Map<string, string> } {
  const weapons = new Map<string, LoadedWeapon>()
  const names = new Map<string, string>()

  for (const faction of factionDirectories(core)) {
    for (const weapon of readOptionalList<RawWeapon>(path.join(core, faction, 'weapons.json'))) {
      if (!weapon.id || !weapon.name) continue
      names.set(weapon.id, weapon.name)
      weapons.set(weapon.id, toWeapon({ ...weapon, name: weapon.name }))
    }
  }
  for (const faction of factionDirectories(core)) {
    for (const item of readOptionalList<RawWeapon>(path.join(core, faction, 'wargear.json'))) {
      if (item.id && item.name && !names.has(item.id)) names.set(item.id, item.name)
    }
  }
  return { weapons, names }
}

function toWeapon(weapon: RawWeapon & { name: string }): LoadedWeapon {
  const melee = (weapon.type ?? '').toLocaleLowerCase() === 'melee'
  return {
    name: weapon.name,
    melee,
    profiles: (weapon.profiles ?? []).map((profile) => {
      // Whether a row is melee belongs to the profile rather than the weapon: a
      // staff of light is typed as something that shoots and strikes in melee
      // too, and only the profile says which of the two this row is. Read the
      // wrong way it prints a fighting weapon with a ballistic skill and a range
      // of `Melee"`.
      const fights = melee || String(profile.range ?? '').toLocaleLowerCase() === 'melee' || profile.stats?.WS !== undefined
      return {
        name: profile.name ?? weapon.name,
        melee: fights,
        range: fights ? 'Melee' : profile.range === undefined ? '-' : `${profile.range}"`,
        stats: (fights ? MELEE_STATS : RANGED_STATS).map((stat) => {
          const value = profile.stats?.[stat]
          // A torrent weapon needs no roll to hit, and the data says so by leaving
          // the characteristic out. A datasheet prints the rest as "3+".
          if (value === undefined || value === null) return { name: stat, value: '-' }
          const skill = stat === 'WS' || stat === 'BS'
          return { name: stat, value: `${value}${skill ? '+' : ''}` }
        }),
        keywords: (profile.keywords ?? []).map(keywordLabel),
      }
    }),
  }
}

/** The kinds of model each datasheet is built from, keyed the way datasheets are routed. */
export function loadCompositions(core: string, weaponNames: ReadonlyMap<string, string>): Map<string, UnitComposition> {
  const compositions = new Map<string, UnitComposition>()
  // A weapon the id table does not know is left out rather than named after its id,
  // which would put a slug in front of a player.
  const named = (ids: readonly string[]) => ids.flatMap((id) => (weaponNames.has(id) ? [{ id, name: weaponNames.get(id)! }] : []))

  for (const faction of factionDirectories(core)) {
    for (const raw of readOptionalList<RawComposition>(path.join(core, faction, 'unit-compositions.json'))) {
      if (!raw.unit_id || !raw.models?.length) continue
      const models = (raw.models ?? []).flatMap((model) =>
        model.name
          ? [
              {
                name: model.name,
                profile: model.profile_name ?? null,
                min: model.min ?? 0,
                max: model.max ?? model.min ?? 0,
                leader: Boolean(model.is_leader_model),
                weapons: named(model.default_weapon_ids ?? []),
              },
            ]
          : [],
      )
      if (models.length) compositions.set(joinKey(raw.unit_id), { unitId: raw.unit_id, models, options: [] })
    }
  }

  for (const faction of factionDirectories(core)) {
    for (const raw of readOptionalList<RawWargearOption>(path.join(core, faction, 'wargear-options.json'))) {
      const composition = raw.unit_id ? compositions.get(joinKey(raw.unit_id)) : undefined
      if (!composition || !raw.id) continue
      const takes = [...(raw.replacement ? [raw.replacement] : []), ...(raw.replacement_choice ?? [])]
        .map(named)
        .filter((one) => one.length)
      if (!takes.length) continue
      composition.options.push({
        id: raw.id,
        model: raw.model_constraint?.model_name ?? null,
        gives: named(raw.replaces ?? []),
        takes,
        free: raw.is_free !== false,
      })
    }
  }

  return compositions
}
