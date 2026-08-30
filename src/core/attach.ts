import {
  type Association,
  type CatalogueIndex,
  type Condition,
  type ConditionGroup,
  type Definition,
  type InfoGroup,
  nameOf,
  type Profile,
  targetOf,
} from './catalogue'
import type { EvaluationError, Selection } from './evaluate'

/**
 * A character joining a unit, as eleventh edition writes it.
 *
 * `leader` is the unit's Leader; `support` is a character attached alongside one.
 * The data does not say which in a field — the distinction is that a Leader's
 * ability is titled "Leader", where a supporting character's is titled after the
 * model. So `support` is the weaker claim and therefore the default: mislabelling
 * a leader reads as the wrong word on a row, where inventing a Leader where the
 * data does not have one would tell a player something untrue about the game.
 */
export type Attachment = { kind: 'leader' | 'support'; targets: string[] }

const CLAIM = /can be attached to the following units?/i

const BULLETED = /(?:^|\n)\s*(?:■|-)\s*([^\n]+)/g

/** `^^**Immortals, Lychguard**^^` inline, including the source's inverted `^^**` closer. */
const EMPHASISED = /\^\^\*\*(.+?)(?:\*\*\^\^|\^\^\*\*)/s

const GENERIC_SUBSTITUTION =
  /if a character unit from your army with the leader ability can be attached to (?:an?|the) (.+?), it can be attached to this unit instead/gi

const attachmentCache = new WeakMap<CatalogueIndex, WeakMap<Definition, Attachment | null>>()
const substitutionCache = new WeakMap<CatalogueIndex, ReadonlyMap<string, readonly string[]>>()
const categoryTargetCache = new WeakMap<CatalogueIndex, readonly string[]>()
const associationCandidateCache = new WeakMap<CatalogueIndex, readonly Definition[]>()

/**
 * Which units this entry may be attached to, read out of its own ability text.
 *
 * This is parsing prose, which is not a thing to do lightly — but the relationship
 * exists nowhere else. There is no link, no category and no constraint that says a
 * Plasmancer may join Immortals; there is a sentence saying so. Finding nothing is
 * therefore an ordinary answer, not a failure: a character with no such sentence
 * simply cannot be attached, and every name that fails to match a datasheet is
 * dropped rather than guessed at.
 */
export function attachmentOf(definition: Definition, index: CatalogueIndex, selection?: Selection): Attachment | null {
  const cached = attachmentCache.get(index)
  let attachment = cached?.get(definition)
  if (!cached?.has(definition)) {
    attachment = findAttachment(definition, index)
    const entries = cached ?? new WeakMap<Definition, Attachment | null>()
    entries.set(definition, attachment)
    if (!cached) attachmentCache.set(index, entries)
  }
  if (!selection) return attachment ?? null

  const associated = attachmentFromAssociations(definition, selection, index)
  if (!associated) return attachment ?? null
  return {
    kind: attachment?.kind ?? associated.kind,
    targets: uniqueNames([...(attachment?.targets ?? []), ...associated.targets]),
  }
}

function attachmentFromAssociations(definition: Definition, selection: Selection, index: CatalogueIndex): Attachment | null {
  const sources = [...new Set([definition, targetOf(definition, index.definitions)])]
  const associations = sources.flatMap((source) =>
    (source.associations ?? []).flatMap((association) => {
      const kind = associationKind(association)
      return kind && association.action === 'group' && association.childId === 'unit' ? [{ association, kind }] : []
    }),
  )
  if (!associations.length) return null

  const candidates =
    associationCandidateCache.get(index) ??
    [...new Set([...index.datasheets.values()].flatMap((entries) => [...entries]))]
      .map((id) => index.definitions.get(id))
      .filter((candidate): candidate is Definition => Boolean(candidate))
  if (!associationCandidateCache.has(index)) associationCandidateCache.set(index, candidates)
  const found: Attachment[] = []
  for (const { association, kind } of associations) {
    const targets = candidates
      .filter((candidate) => associationHolds(association, selection, candidate, index))
      .map((candidate) => nameOf(candidate, index.definitions))
    if (targets.length) found.push({ kind, targets })
  }
  if (!found.length) return null
  return { kind: found[0]!.kind, targets: uniqueNames(found.flatMap((attachment) => attachment.targets)) }
}

const associationKind = (association: Association): Attachment['kind'] | null => {
  const name = association.name?.trim().toLocaleLowerCase()
  if (name === 'leading') return 'leader'
  if (name === 'supporting') return 'support'
  return null
}

function associationHolds(association: Association, selection: Selection, candidate: Definition, index: CatalogueIndex): boolean {
  const results = [
    ...(association.conditions ?? []).map((condition) => associationConditionHolds(condition, selection, candidate, index)),
    ...(association.conditionGroups ?? []).map((group) => associationGroupHolds(group, selection, candidate, index)),
  ]
  return results.length > 0 && results.every(Boolean)
}

function associationGroupHolds(group: ConditionGroup, selection: Selection, candidate: Definition, index: CatalogueIndex): boolean {
  const results = [
    ...(group.conditions ?? []).map((condition) => associationConditionHolds(condition, selection, candidate, index)),
    ...(group.conditionGroups ?? []).map((nested) => associationGroupHolds(nested, selection, candidate, index)),
  ]
  if (!results.length) return false
  const met = results.filter(Boolean).length
  if (group.type === 'and') return met === results.length
  if (group.type === 'or') return met > 0
  if (group.type === 'atLeast') return met >= (group.value ?? 1)
  if (group.type === 'atMost') return met <= (group.value ?? 0)
  if (group.type === 'equalTo') return met === (group.value ?? 0)
  if (group.type === 'count') return met >= (group.min ?? 0) && met <= (group.max ?? Number.POSITIVE_INFINITY)
  return false
}

function associationConditionHolds(condition: Condition, selection: Selection, candidate: Definition, index: CatalogueIndex): boolean {
  let measured: number
  if (condition.field === 'associations') measured = 0
  else if (condition.field !== 'selections') return false
  else if (condition.queryFromSelf)
    measured = selectionHas(selection, condition.childId, condition.includeChildSelections === true, index) ? 1 : 0
  else measured = definitionHas(candidate, condition.childId, index) ? 1 : 0

  if (condition.type === 'instanceOf') return measured > 0
  if (condition.type === 'notInstanceOf') return measured === 0
  if (condition.type === 'atLeast') return measured >= condition.value
  if (condition.type === 'atMost') return measured <= condition.value
  if (condition.type === 'equalTo') return measured === condition.value
  if (condition.type === 'greaterThan') return measured > condition.value
  if (condition.type === 'lessThan') return measured < condition.value
  return false
}

function selectionHas(selection: Selection, childId: string | undefined, deep: boolean, index: CatalogueIndex): boolean {
  const definition = index.definitions.get(selection.id)
  if (definition && definitionHas(definition, childId, index)) return true
  return deep && Boolean(selection.selections?.some((child) => selectionHas(child, childId, true, index)))
}

function definitionHas(definition: Definition, childId: string | undefined, index: CatalogueIndex): boolean {
  if (!childId || childId === 'any') return true
  const target = targetOf(definition, index.definitions)
  if (childId === 'model-or-unit') return target.type === 'model' || target.type === 'unit'
  if (childId === 'model' || childId === 'unit' || childId === 'upgrade') return target.type === childId
  return [definition, target].some(
    (source) => source.id === childId || source.categoryLinks?.some((category) => category.targetId === childId),
  )
}

function findAttachment(definition: Definition, index: CatalogueIndex): Attachment | null {
  for (const [title, text] of statements(definition, index)) {
    if (!CLAIM.test(text)) continue
    const named = names(text)
    if (!named.length) continue
    const categorized = named.flatMap((name) => [name, ...categoryTargets(name, index)])
    const substitutions = attachmentSubstitutions(index)
    const targets = categorized.flatMap((name) => [name, ...(substitutions.get(normalizedName(name)) ?? [])])
    return { kind: title.trim().toLowerCase() === 'leader' ? 'leader' : 'support', targets: uniqueNames(targets) }
  }
  return null
}

function attachmentSubstitutions(index: CatalogueIndex) {
  const cached = substitutionCache.get(index)
  if (cached) return cached

  const found = new Map<string, string[]>()
  for (const definition of index.definitions.values()) {
    const target = targetOf(definition, index.definitions)
    if (definition.type !== 'unit' && target.type !== 'unit') continue
    const substitute = nameOf(definition, index.definitions)
    for (const [, text] of statements(definition, index)) {
      const readable = text.replaceAll(/[\^*]/g, '').replaceAll('\u00a0', ' ').replaceAll(/\s+/g, ' ')
      for (const match of readable.matchAll(GENERIC_SUBSTITUTION)) {
        const base = match[1]?.replace(/\s+unit$/i, '').trim()
        if (!base) continue
        const substitutes = found.get(normalizedName(base)) ?? []
        if (!substitutes.some((name) => normalizedName(name) === normalizedName(substitute))) substitutes.push(substitute)
        found.set(normalizedName(base), substitutes)
      }
    }
  }
  substitutionCache.set(index, found)
  return found
}

/** How an attachment target is written down before it is matched, here and wherever names meet. */
export const normalizedName = (name: string) => name.toLocaleLowerCase().replaceAll('\u00a0', ' ').replaceAll(/\s+/g, ' ').trim()

function categoryTargets(name: string, index: CatalogueIndex) {
  const required = normalizedName(name).replace('battleliine', 'battleline').split(' ').toSorted()
  if (required.join(' ') !== 'battleline imperium infantry') return []

  const cached = categoryTargetCache.get(index)
  if (cached) return cached

  const found: string[] = []
  for (const definition of index.definitions.values()) {
    const target = targetOf(definition, index.definitions)
    if (definition.type !== 'unit' && target.type !== 'unit') continue
    const categories = new Set(
      [...(definition.categoryLinks ?? []), ...(target.categoryLinks ?? [])].map((link) =>
        normalizedName(link.name ?? '').replace(/^faction:\s*/, ''),
      ),
    )
    if (required.every((category) => categories.has(category))) found.push(nameOf(definition, index.definitions))
  }
  const targets = uniqueNames(found)
  categoryTargetCache.set(index, targets)
  return targets
}

function uniqueNames(values: readonly string[]) {
  const seen = new Set<string>()
  return values.filter((name) => {
    const normalized = normalizedName(name)
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

/**
 * The other units in the list that are the same unit as this one, by position.
 *
 * An Attached unit is one unit however many entries the list keeps it in: the
 * bodyguard unit, its Leader, and its Support unit. So a
 * character reaches its siblings through the unit they all joined rather than
 * through each other — asking only what this entry is attached to would tell a
 * Chronomancer nothing about the Overlord standing beside it, and an enhancement
 * that speaks of the bearer's unit means every model in it.
 */
export function attachedUnit(units: readonly { attachedTo?: number }[], position: number): number[] {
  const host = units[position]?.attachedTo ?? position
  return units.flatMap((unit, at) => (at !== position && (at === host || unit.attachedTo === host) ? [at] : []))
}

export function attachmentErrors(
  units: readonly { entryId: string; attachedTo?: number }[],
  index: CatalogueIndex,
  selections: readonly (Selection | undefined)[] = [],
): EvaluationError[] {
  const errors: EvaluationError[] = []
  const occupied = { leader: new Map<number, number>(), support: new Map<number, number>() }
  units.forEach((unit, position) => {
    if (unit.attachedTo === undefined) return
    const definition = index.definitions.get(unit.entryId)
    const name = definition?.name ?? unit.entryId
    const error = (message: string) => errors.push({ entryId: unit.entryId, entryName: name, message })
    if (unit.attachedTo === position) {
      error('cannot be attached to itself')
      return
    }
    const host = units[unit.attachedTo]
    if (!host) {
      error('names a missing attachment target')
      return
    }
    const attachment = definition && attachmentOf(definition, index, selections[position])
    if (!attachment) {
      error('cannot be attached to another unit')
      return
    }
    const hostName = index.definitions.get(host.entryId)?.name ?? host.entryId
    if (!attachment.targets.some((target) => target.localeCompare(hostName, undefined, { sensitivity: 'accent' }) === 0)) {
      error(`cannot be attached to ${hostName}`)
    }
    const associationMax = definition?.constraints
      ?.filter((constraint) => constraint.type === 'max' && constraint.field === 'associations')
      .map((constraint) => constraint.value)
    if (associationMax?.length && Math.min(...associationMax) < 1) error('allows no attachments')
    if (!attachment) return
    const already = occupied[attachment.kind].get(unit.attachedTo)
    if (already === undefined) {
      occupied[attachment.kind].set(unit.attachedTo, position)
      return
    }
    const other = nameOf(index.definitions.get(units[already]?.entryId ?? '') ?? { id: '' }, index.definitions)
    error(
      attachment.kind === 'leader'
        ? `cannot lead ${hostName}, which is already led by ${other}`
        : `cannot support ${hostName}, which is already supported by ${other}`,
    )
  })
  return errors
}

/**
 * Every ability on the entry, as title and words.
 *
 * A book reaches most of its characters through a link, and the abilities are on
 * the datasheet the link points at — so both are read, the link first because it
 * may add one of its own.
 */
function statements(definition: Definition, index: CatalogueIndex): [string, string][] {
  const found: [string, string][] = []

  const fromProfile = (profile: Profile, title: string) => {
    for (const characteristic of profile.characteristics ?? []) {
      if (characteristic.$text) found.push([title, characteristic.$text])
    }
  }

  const fromGroup = (group: InfoGroup) => {
    for (const profile of group.profiles ?? []) fromProfile(profile, group.name ?? profile.name ?? '')
  }

  const read = (source: Definition) => {
    for (const group of source.infoGroups ?? []) fromGroup(group)
    for (const profile of source.profiles ?? []) fromProfile(profile, profile.name ?? '')
    // A shared ability is linked rather than repeated, and the link may rename it.
    for (const link of source.infoLinks ?? []) {
      const target = index.shared.get(link.targetId)
      if (!target) continue
      if ('characteristics' in target) fromProfile(target, link.name ?? target.name ?? '')
      else fromGroup({ ...target, name: link.name ?? target.name })
    }
  }

  read(definition)
  const target = targetOf(definition, index.definitions)
  if (target !== definition) read(target)

  return found
}

function names(text: string): string[] {
  const claim = CLAIM.exec(text)
  if (!claim || claim.index === undefined) return []
  const afterClaim = text.slice(claim.index + claim[0].length)
  const bulleted = [...afterClaim.matchAll(BULLETED)].flatMap((match) => (match[1] ? [match[1]] : []))
  if (bulleted.length) return bulleted.map(clean).filter(Boolean)
  const emphasised = EMPHASISED.exec(afterClaim)
  if (emphasised?.[1]) return emphasised[1].split(',').map(clean).filter(Boolean)
  return afterClaim.replace(/^:\s*/, '').split(',').map(clean).filter(Boolean)
}

/** Strips the markup the text carries and the case it shouts in. */
const clean = (name: string) =>
  name
    .replaceAll(/[\^*■]/g, '')
    .replace(/\.$/, '')
    .trim()
