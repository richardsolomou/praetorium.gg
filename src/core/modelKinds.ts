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
import { allAt, updateSelection } from './selection'
import { type ChoiceOptions, unitChoices } from './unitChoices'
import { sameWargear, wargearOf } from './wargear'

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
  separatePieces?: boolean
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
}

export const modelRowSources = (row: ModelRow): readonly ModelRowSource[] => [row, ...(row.alternatives ?? [])]

export const modelRowCount = (row: ModelRow, countOf: (source: ModelRowSource) => number) =>
  modelRowSources(row).reduce((total, source) => total + countOf(source), 0)

/** Nested choices own their equipment; their container must not count it again. */
export const modelRowPieces = (row: ModelRow, rows: readonly ModelRow[]) =>
  (row.pieces ?? [row.name]).filter(
    (piece) =>
      !rows.some(
        (other) =>
          other !== row &&
          sameWargear(other.name, piece) &&
          modelRowSources(row).some((source) => other.choiceKey.startsWith(`${source.choiceKey}/${source.optionId}/`)),
      ),
  )

export function optionPieces(
  optionId: string,
  index: CatalogueIndex,
  options: ChoiceOptions = {},
  selected: readonly Selection[] = [],
): string[] | undefined {
  const pieces = optionWargear(optionId, index, options, selected).map((piece) => piece.name)
  return pieces.length ? pieces : undefined
}

export function choiceOptionWargear(
  choiceKey: string,
  optionId: string,
  selection: Selection,
  index: CatalogueIndex,
  options: ChoiceOptions = {},
) {
  const path = choiceKey.split('/')
  const nested = allAt(selection, [...path, optionId])
  const direct = allAt(selection, path).filter((entry) => entry.id === optionId)
  return optionWargear(optionId, index, options, nested.length ? nested : direct)
}

export function optionWargear(optionId: string, index: CatalogueIndex, options: ChoiceOptions = {}, selected: readonly Selection[] = []) {
  const fallback = selected.length ? null : defaultSelection(optionId, index, options)
  const selections = selected.length ? selected : fallback ? [fallback] : []
  const found = new Map<string, { name: string; count: number }>()
  for (const selection of selections) {
    for (const piece of wargearOf(selection, index, selection.count ?? 1)) {
      const key = piece.name.trim().toLocaleLowerCase()
      const present = found.get(key)
      found.set(key, { name: present?.name ?? piece.name, count: (present?.count ?? 0) + piece.count })
    }
  }
  return [...found.values()]
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
      baseCount: depth < 0 ? 0 : allAt(selection, trail.slice(0, depth + 1)).reduce((total, model) => total + (model.count ?? 1), 0),
    })
  }
  // The models the data insists on complete a set of cards; they do not begin one.
  if (!found.length) return []
  for (const standing of standingModels(entryId, selection, index, options)) remember(standing.profile, standing.member)

  // Read defaults for unselected variants, excluding owned choices but retaining their fixed siblings.
  const carriedBy = new Map(
    found.map(({ member }) => {
      const base = defaultSelection(member.id, index, options)
      const owned = choices.filter((choice) => choice.owner?.id === member.id)
      const outside = base
        ? owned.reduce((tree, choice) => {
            const trail = choice.key.split('/')
            const offered = new Set(choice.options.map((option) => option.id))
            return updateSelection(tree, trail.slice(trail.indexOf(member.id) + 1), (held) => ({
              ...held,
              selections: held.selections?.filter((child) => !offered.has(child.id)),
            }))
          }, base)
        : null
      return [member.id, outside ? wargearOf(outside, index).map((piece) => piece.name) : []] as const
    }),
  )
  const carriedOf = (id: string) => carriedBy.get(id) ?? []
  const owns = (id: string) => choices.some((choice) => choice.owner?.id === id)
  // Standing models have no editable source, so only offered variants join a named pool.
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
    const definition = index.definitions.get(entry.member.id)
    const embeddedProfile = definition && resolve(definition, index).profiles?.some((profile) => profile.typeName === 'Unit')
    // A shared stat line does not make one model's nested choices available to its squadmates.
    const standingApart =
      !entry.member.choiceKey &&
      !plainName(found.filter((other) => other.profile === entry.profile && !owns(other.member.id)).map((other) => other.member.name))
    const separateLinkedModel = entry.profile && !embeddedProfile && (standingApart || owns(entry.member.id))
    const key = separateLinkedModel ? entry.member.id : (entry.profile ?? gathering?.key ?? entry.member.id)
    const kind = kinds.get(key) ?? { profile: entry.profile, named: entry.profile ? null : (gathering?.named ?? null), members: [] }
    kind.members.push(entry.member)
    kinds.set(key, kind)
  }

  const kindsOf = [...kinds.values()].map(({ profile, named, members }) => {
    const carried = members.map((member) => carriedOf(member.id))
    const shared = (carried[0] ?? []).filter((name) => carried.every((list) => list.includes(name)))

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
            const base = pieces && pieces.length > 1 ? defaultSelection(option.id, index, options) : null
            const nested = base ? unitChoices(option.id, base, index, options) : []
            const separatePieces =
              pieces?.every((piece) =>
                nested.some((slot) => slot.options.some((candidate) => candidate.default && sameWargear(candidate.name, piece))),
              ) && nested.length > 1
            addRow({
              name: option.name,
              choiceKey: choice.key,
              optionId: option.id,
              ...(pieces ? { pieces } : {}),
              ...(separatePieces ? { separatePieces: true } : {}),
            })
          }
        }
        return
      }
      // One variant is one allocation, including weapons that must be taken together.
      if (!member.choiceKey) return
      const pieces = (carried[position] ?? []).filter((name) => !shared.includes(name))
      if (pieces.length)
        addRow({ name: pieces.join(' and '), choiceKey: member.choiceKey, optionId: member.id, ...(pieces.length > 1 ? { pieces } : {}) })
    })

    // A weapon only some of this kind carry, held by a model the data stands rather
    // than one a choice offers, has no choice to be counted by — so it is stated as
    // the wargear of however many of that model there are. An ordinary Tactical
    // Marine's boltgun is the case: his squadmates gave theirs up for a flamer or a
    // lascannon, so the boltgun is not the whole kind's, and naming it nowhere left
    // a ten-man squad reading as though only the sergeant had one.
    const apart = new Map<string, number>()
    members.forEach((member, position) => {
      if (member.choiceKey || !member.baseCount) return
      for (const name of carried[position] ?? []) {
        if (shared.includes(name) || rows.some((row) => row.name === name)) continue
        apart.set(name, (apart.get(name) ?? 0) + member.baseCount)
      }
    })

    return {
      name:
        named ??
        kindName(
          members.map((member) => member.name),
          profile,
        ),
      fixed: [
        ...shared.filter((name) => !rows.some((row) => row.name === name)).map((name) => ({ name })),
        ...[...apart].map(([name, count]) => ({ name, count })),
      ],
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

/** Distinct equipment bundles can share a card; nested choices need their own model identity. */
function gathers(group: readonly Loadout[], carried: (id: string) => readonly string[], owns: (id: string) => boolean): boolean {
  if (group.length < 2 || group.some((entry) => owns(entry.member.id))) return false
  const lists = group.map((entry) => carried(entry.member.id))
  const shared = new Set((lists[0] ?? []).filter((name) => lists.every((list) => list.includes(name))))
  const apart = lists.map((list) => list.filter((name) => !shared.has(name)))
  if (apart.some((list) => !list.length)) return false
  const weapons = apart.map((list) => JSON.stringify(list.toSorted()))
  return new Set(weapons).size === weapons.length
}
