/**
 * Gathering a unit's entries back into the kinds of model a datasheet names.
 *
 * The catalogue splits a kind of model into one entry per loadout — a veteran with a
 * bolt rifle beside a veteran with a combi-weapon — which is bookkeeping, not what a
 * player sees on the datasheet. Those entries share a unit profile, and that is what
 * gathers them back into the sergeant and the veterans he leads. Where the catalogue
 * gives no profile, the name the loadouts agree on stands in for one.
 */

import type { CatalogueIndex, Definition } from './catalogue'
import { childrenOf, MAX_DEPTH, modelProfileOf, resolve } from './definitions'
import { hiddenByRules, type Selection } from './evaluate'
import { defaultSelection } from './expand'
import { allAt, countAt } from './selection'
import { type ChoiceOptions, unitChoices } from './unitChoices'
import { wargearOf } from './wargear'

/**
 * A kind of model in a unit, as the datasheet names it, and the wargear it carries.
 *
 * Counts are deliberately absent: they live on the choice each row points at, so a
 * caller reads one number rather than holding a second copy free to disagree.
 */
export type ModelRowSource = { choiceKey: string; optionId: string }

export type ModelRow = ModelRowSource & {
  name: string
  alternatives?: ModelRowSource[]
  pieces?: string[]
}

export type ModelKind = {
  name: string
  /**
   * Wargear every model of this kind carries. `count` is stated only when it is not
   * simply one each — a swap having taken some of them away.
   */
  fixed: { name: string; count?: number }[]
  members: { id: string; choiceKey: string | null; baseCount: number }[]
  /** Wargear taken through a choice, in the order the data holds it. */
  rows: ModelRow[]
  /**
   * Swaps the datasheet allows that the catalogue does not describe, one row per
   * alternative so every one of them is always on screen whether taken or not.
   */
  swaps?: { key: string; gives: string[]; takes: string[]; count: number; max: number; free: boolean }[]
}

export const modelRowSources = (row: ModelRow): readonly ModelRowSource[] => [row, ...(row.alternatives ?? [])]

export const modelRowCount = (row: ModelRow, countOf: (source: ModelRowSource) => number) =>
  modelRowSources(row).reduce((total, source) => total + countOf(source), 0)

export function optionPieces(
  optionId: string,
  index: CatalogueIndex,
  options: ChoiceOptions = {},
  selected: readonly Selection[] = [],
): string[] | undefined {
  const fallback = selected.length ? null : defaultSelection(optionId, index, options)
  const selections = selected.length ? selected : fallback ? [fallback] : []
  const seen = new Set<string>()
  const pieces = selections
    .flatMap((selection) => wargearOf(selection, index).map((piece) => piece.name))
    .filter((name) => {
      const key = name.trim().toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return pieces.length ? pieces : undefined
}

type Member = { id: string; name: string; choiceKey: string | null; baseCount: number }

/** One entry the catalogue offers as a model, and the profile it names it by, if any. */
type Loadout = { profile: string | null; member: Member }

export function modelKindsOf(entryId: string, selection: Selection, index: CatalogueIndex, options: ChoiceOptions = {}): ModelKind[] {
  const choices = unitChoices(entryId, selection, index, options)
  const found: Loadout[] = []

  const remember = (profile: string | null, member: Member) => {
    // A model reached both as a loadout of its kind and as the owner of a choice is
    // one model. The loadout is kept, because that is where its count is changed.
    if (!found.some((present) => present.member.id === member.id)) found.push({ profile, member })
  }

  for (const choice of choices) {
    for (const option of choice.options) {
      if (option.profile === undefined) continue
      remember(option.profile, { id: option.id, name: option.name, choiceKey: choice.key, baseCount: 0 })
    }
    const owner = choice.owner
    if (!owner) continue
    const trail = choice.key.split('/')
    const depth = trail.indexOf(owner.id)
    remember(owner.profile, {
      id: owner.id,
      name: owner.name,
      choiceKey: null,
      baseCount: depth < 0 ? 0 : countAt(selection, trail.slice(0, depth + 1)),
    })
  }
  /*
   * The models the data insists on complete a set of cards; they do not begin one.
   * A datasheet the catalogue offers no kind of model for is one the rules source
   * describes better — it names the weapons, the abilities and the swaps a card needs
   * — and saying nothing here is how that reading gets asked for.
   */
  if (!found.length) return []
  for (const standing of standingModels(entryId, selection, index, options)) remember(standing.profile, standing.member)

  // What each loadout carries on its own, read from its own defaults so that a
  // loadout nobody has taken yet still knows its weapon.
  const carriedBy = new Map(
    found.map(({ member }) => {
      const base = defaultSelection(member.id, index, options)
      return [member.id, base ? wargearOf(base, index).map((piece) => piece.name) : []] as const
    }),
  )
  const carriedOf = (id: string) => carriedBy.get(id) ?? []
  const owns = (id: string) => choices.some((choice) => choice.owner?.id === id)
  // The widest set that still says what the entries said is the one gathered, so the
  // unit gives way to the group and the group to the loadouts, and a pairing that
  // cannot be drawn as rows costs only its own card. Only the entries a choice offers:
  // a model standing in the unit by itself is counted on its own card rather than by a
  // row, so gathering it under a shared name would leave its weapon nowhere to appear.
  const loose = found.filter((entry) => !entry.profile && entry.member.choiceKey)
  const nameOf = (entry: Loadout) => {
    const siblings = loose.filter((other) => other.member.choiceKey === entry.member.choiceKey)
    return (siblings.length > 1 ? sharedName(siblings.map((other) => other.member.name)) : null) ?? entry.member.name
  }
  const gathered = new Map<string, { key: string; named: string }>()
  const gather = (key: string, named: string, group: readonly Loadout[]) => {
    for (const entry of group) gathered.set(entry.member.id, { key, named })
  }
  for (const [name, group] of groupBy(loose, nameOf)) {
    if (gathers(group, carriedOf, owns)) {
      gather(`kind:${name}`, name, group)
      continue
    }
    for (const [choiceKey, part] of groupBy(group, (entry) => entry.member.choiceKey ?? entry.member.id)) {
      if (gathers(part, carriedOf, owns)) gather(`kind:${name}/${choiceKey}`, name, part)
      else for (const entry of part) gather(entry.member.id, entry.member.name, [entry])
    }
  }

  const kinds = new Map<string, { profile: string | null; named: string | null; members: Member[] }>()
  for (const entry of found) {
    const gathering = gathered.get(entry.member.id)
    const key = entry.profile ?? gathering?.key ?? entry.member.id
    const kind = kinds.get(key) ?? { profile: entry.profile, named: entry.profile ? null : (gathering?.named ?? null), members: [] }
    kind.members.push(entry.member)
    kinds.set(key, kind)
  }

  const kindsOf = [...kinds.values()].map(({ profile, named, members }) => {
    const carried = members.map((member) => carriedOf(member.id))
    const shared = (carried[0] ?? []).filter((name) => carried.every((list) => list.includes(name)))

    // One loadout at a time, in the order the data holds them, so the weapons read
    // down the card the way the datasheet lists them.
    const rows: ModelKind['rows'] = []
    const addRow = (row: ModelKind['rows'][number]) => {
      const existing = rows.find((candidate) => candidate.name.trim().toLocaleLowerCase() === row.name.trim().toLocaleLowerCase())
      if (!existing) {
        rows.push(row)
        return
      }
      const source = { choiceKey: row.choiceKey, optionId: row.optionId }
      if (existing.choiceKey === source.choiceKey && existing.optionId === source.optionId) return
      existing.alternatives = [...(existing.alternatives ?? []), source]
    }
    members.forEach((member, position) => {
      const owned = choices.filter((choice) => choice.owner?.id === member.id)
      if (owned.length) {
        for (const choice of owned) {
          for (const option of choice.options) {
            const pieces = optionPieces(option.id, index, options)
            addRow({ name: option.name, choiceKey: choice.key, optionId: option.id, ...(pieces ? { pieces } : {}) })
          }
        }
        return
      }
      // A loadout holding no choice of its own *is* the choice: taking one is taking
      // the weapon that tells it apart from its siblings.
      if (!member.choiceKey) return
      for (const name of carried[position] ?? []) {
        if (shared.includes(name)) continue
        addRow({ name, choiceKey: member.choiceKey, optionId: member.id })
      }
    })

    return {
      name:
        named ??
        kindName(
          members.map((member) => member.name),
          profile,
        ),
      fixed: shared.filter((name) => !rows.some((row) => row.name === name)).map((name) => ({ name })),
      members: members.map(({ id, choiceKey, baseCount }) => ({ id, choiceKey, baseCount })),
      rows,
    }
  })

  // The models a unit must have come before the ones it may add, the way a
  // datasheet's composition lists them.
  return kindsOf.toSorted(
    (left, right) => Number(right.members.some((member) => !member.choiceKey)) - Number(left.members.some((member) => !member.choiceKey)),
  )
}

/**
 * The models a datasheet stands in the unit itself.
 *
 * A choice reports only what a player may change, so the models the data insists on
 * are named nowhere else — and a squad's sergeant is nearly always one of them. He is
 * read from the datasheet and counted from the selection, the way the owner of a
 * choice is: how many of him there are is the catalogue's answer, not the player's.
 *
 * Only what the unit is actually holding. A model no selection stands would be a card
 * for something the squad does not have and cannot ask for. Upgrades are walked through
 * rather than stopped at, because a catalogue can bundle a whole squad size into one —
 * a Jakhals pack is written as "8 chainblades", with the eight Jakhals inside it.
 */
function standingModels(entryId: string, selection: Selection, index: CatalogueIndex, options: ChoiceOptions): Loadout[] {
  const entry = index.definitions.get(entryId)
  if (!entry) return []
  const roster = [...(options.roster ?? []), selection]
  const found: Loadout[] = []
  const walk = (definition: Definition, trail: string[], left: number, seen: Set<string>) => {
    const target = resolve(definition, index)
    if (left <= 0 || seen.has(target.id)) return
    const visited = new Set(seen).add(target.id)
    for (const child of childrenOf(target, index)) {
      if (hiddenByRules(child.definition, index, { ...options, roster })) continue
      const inner = resolve(child.definition, index)
      const here = [...trail, child.id]
      const held = allAt(selection, here).reduce((total, node) => total + (node.count ?? 1), 0)
      if (inner.type === 'model' && held > 0) {
        found.push({
          profile: modelProfileOf(child.definition, index),
          member: { id: child.id, name: inner.name ?? child.id, choiceKey: null, baseCount: held },
        })
      }
      walk(child.definition, here, left - 1, visited)
    }
  }
  walk(entry, [], options.depth ?? MAX_DEPTH, new Set())
  return found
}

/**
 * What each key gathers, in the order the keys first appear.
 *
 * `Map.groupBy` says the same thing, but it is ES2024 and this project pins its
 * library floor at ES2023. Replace this when that floor moves.
 */
function groupBy<T>(entries: readonly T[], keyOf: (entry: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const entry of entries) {
    const key = keyOf(entry)
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }
  return groups
}

/**
 * The name a kind of model goes by, taken from what its loadouts have in common.
 *
 * The agreement has to end on a word, or it is a coincidence of spelling rather than
 * a name: "Sternguard Veteran w/ " is every loadout's prefix, while two unrelated
 * models could agree as far as "Fooba" and mean nothing by it.
 */
function kindName(names: readonly string[], profile: string | null): string {
  const [first = '', ...rest] = names
  if (!rest.length) return first || (profile ?? '')
  return sharedName(names) ?? plainName(names) ?? profile ?? first
}

/**
 * The entry that names the model outright, where one of them does.
 *
 * A squad's rank and file are written as a plain entry beside the loadouts one of
 * them may take — "Tactical Marine", then "Tactical Marine w/ special weapon" — and
 * the plain one is what the kind is called. The catalogue's own profile is no help
 * there: an eleventh-edition datasheet names the profile after the squad, so a card
 * drawn from it would read as the whole unit rather than as the models standing on it.
 */
function plainName(names: readonly string[]): string | null {
  const base = names.toSorted((one, other) => one.length - other.length)[0] ?? ''
  const named = (name: string) => name === base || (name.startsWith(base) && /^[^\p{L}\p{N}]/u.test(name.slice(base.length)))
  return base && names.every(named) ? base : null
}

/** The name those loadouts agree on, or nothing when they agree on no whole word. */
function sharedName(names: readonly string[]): string | null {
  const [first = '', ...rest] = names
  if (!first || !rest.length) return null
  let shared = 0
  while (shared < first.length && rest.every((name) => name[shared] === first[shared])) shared++
  if (!/[^\p{L}\p{N}]$/u.test(first.slice(0, shared))) return null
  // A name ends where the loadout begins. Loadouts that agree past the "w/" agree on
  // part of a weapon — a gauss flayer and a gauss reaper are both gauss — so the name
  // is cut at the separator rather than at the last word the two happen to share.
  const words = first.slice(0, shared).trim().split(/\s+/)
  const separator = (word: string) => /[^\p{L}\p{N}]/u.test(word)
  const cut = words.findLastIndex((word, position) => position > 0 && separator(word))
  const named = words.slice(0, cut < 0 ? words.length : cut)
  // What a name is joined to its loadout by is written either way round — "w/" or
  // "with" — and neither is part of the name. A model is named in the case a datasheet
  // prints it in, so a trailing lowercase word is the sentence, not the model.
  const joining = (word: string) => separator(word) || word === word.toLocaleLowerCase()
  while (named.length > 1 && joining(named.at(-1) ?? '')) named.pop()
  return named.join(' ') || null
}

/**
 * Whether these loadouts are one kind of model the catalogue filed a weapon at a time.
 *
 * They are the same model when a row per weapon says everything the separate entries
 * said: each differs from the rest by exactly one weapon, and no two by the same one.
 * A loadout pairing two weapons is a pairing the player cannot break, and one holding
 * a choice of its own has more to say than a row, so both stay as they were written.
 */
function gathers(group: readonly Loadout[], carried: (id: string) => readonly string[], owns: (id: string) => boolean): boolean {
  if (group.length < 2 || group.some((entry) => owns(entry.member.id))) return false
  const lists = group.map((entry) => carried(entry.member.id))
  const shared = new Set((lists[0] ?? []).filter((name) => lists.every((list) => list.includes(name))))
  const apart = lists.map((list) => list.filter((name) => !shared.has(name)))
  if (apart.some((list) => list.length !== 1)) return false
  const weapons = apart.map((list) => list[0])
  return new Set(weapons).size === weapons.length
}
