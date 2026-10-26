import { uniqueBy, remember } from './collections'
import {
  type Association,
  type CatalogueIndex,
  compares,
  type Condition,
  type ConditionGroup,
  type Definition,
  definitionAndTarget,
  groupCounts,
  type InfoGroup,
  nameOf,
  type Profile,
  targetOf,
} from './catalogue'
import type { EvaluationError, Selection } from './evaluate'
import { normalizedName, withoutFactionPrefix } from './name'
import { sameText } from './text'

/** Only an ability titled "Leader" establishes that role; other attachments default to support. */
export type Attachment = {
  kind: 'leader' | 'support'
  targets: string[]
  /** Keyword phrases the text names, which a list's own rules can hand to other units. */
  keywords?: string[]
  requiresLeader?: true
}
export type AttachmentLimits = Record<Attachment['kind'], number> & {
  categories: Record<string, { name: string; maximum: number }>
}

const CLAIM = /can be attached to the following units?/i
const REQUIRES_LEADER = /^\s*\(which already have a Leader\)\s*:/i

const BULLETED = /(?:^|\n)\s*(?:■|-)\s*([^\n]+)/g

/** `^^**Immortals, Lychguard**^^` inline, including the source's inverted `^^**` closer. */
const EMPHASISED = /\^\^\*\*(.+?)(?:\*\*\^\^|\^\^\*\*)/s

const GENERIC_SUBSTITUTION =
  /if a character unit from your army with the leader ability can be attached to (?:an?|the) (.+?), it can be attached to this unit instead/gi

const attachmentCache = new WeakMap<CatalogueIndex, WeakMap<Definition, Attachment | null>>()
const substitutionCache = new WeakMap<CatalogueIndex, ReadonlyMap<string, readonly string[]>>()
const categoryTargetCache = new WeakMap<CatalogueIndex, readonly string[]>()
const associationCandidateCache = new WeakMap<CatalogueIndex, readonly Definition[]>()
const modelCategoryCache = new WeakMap<CatalogueIndex, WeakMap<Definition, ReadonlySet<string>>>()
/** An association's targets by its answers about the unit's own selection, the only input that varies between calls. */
const associationTargetCache = new WeakMap<CatalogueIndex, WeakMap<Association, Map<string, string[]>>>()

export function attachmentLimitsOf(definition: Definition, index: CatalogueIndex): AttachmentLimits {
  const sources = definitionAndTarget(definition, index)
  const constraints = sources
    .flatMap((source) => source.constraints ?? [])
    .filter((constraint) => {
      return constraint.field === 'associations' && constraint.scope === 'self' && constraint.type === 'max'
    })
  const maximum = (kind: Attachment['kind']) => {
    const limits = constraints.flatMap((constraint) =>
      normalizedName(constraintName(constraint, index)) === kind ? [constraint.value] : [],
    )
    return limits.length ? Math.min(...limits) : 1
  }
  const categories: AttachmentLimits['categories'] = {}
  for (const constraint of constraints) {
    const name = constraintName(constraint, index)
    if (!name || normalizedName(name) === 'leader' || normalizedName(name) === 'support') continue
    const key = constraint.childId ? `id:${constraint.childId}` : `name:${normalizedName(name)}`
    const existing = categories[key]
    categories[key] = { name, maximum: Math.min(existing?.maximum ?? Number.POSITIVE_INFINITY, constraint.value) }
  }
  return { leader: maximum('leader'), support: maximum('support'), categories }
}

function attachmentCategoriesOf(definition: Definition, index: CatalogueIndex): string[] {
  const sources = definitionAndTarget(definition, index)
  return [
    ...new Set(
      sources.flatMap((source) =>
        (source.categoryLinks ?? []).flatMap((category) => [
          `id:${category.targetId}`,
          ...(category.name ? [`name:${normalizedName(category.name)}`] : []),
        ]),
      ),
    ),
  ]
}

const constraintName = (constraint: { childId?: string; childName?: string }, index: CatalogueIndex) =>
  constraint.childName ?? index.categories.get(constraint.childId ?? '')?.name ?? ''

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
  const attachment = remember(
    remember(attachmentCache, index, () => new WeakMap()),
    definition,
    () => findAttachment(definition, index),
  )
  if (!selection) return attachment ?? null

  const associated = attachmentFromAssociations(definition, selection, index)
  if (!associated) return attachment ?? null
  return {
    kind: attachment?.kind ?? associated.kind,
    targets: uniqueNormalizedNames([...(attachment?.targets ?? []), ...associated.targets]),
    ...(attachment?.keywords ? { keywords: attachment.keywords } : {}),
    ...(attachment?.requiresLeader ? { requiresLeader: true as const } : {}),
  }
}

/**
 * The attachment a datasheet page shows: its ability text, or failing that its unselected associations.
 * Association targets are not shown alongside text because many name Legends and Crucible units the printed datasheet does not.
 */
export const referenceAttachmentOf = (definition: Definition, index: CatalogueIndex) =>
  attachmentOf(definition, index) ?? attachmentOf(definition, index, { id: definition.id })

function attachmentFromAssociations(definition: Definition, selection: Selection, index: CatalogueIndex): Attachment | null {
  const sources = definitionAndTarget(definition, index)
  const associations = sources.flatMap((source) =>
    (source.associations ?? []).flatMap((association) => {
      const kind = associationKind(association)
      return kind && association.action === 'group' && association.childId === 'unit' ? [{ association, kind }] : []
    }),
  )
  if (!associations.length) return null

  const candidates = remember(associationCandidateCache, index, () =>
    [...new Set([...index.datasheets.values()].flatMap((entries) => [...entries]))]
      .map((id) => index.definitions.get(id))
      .filter((candidate): candidate is Definition => Boolean(candidate)),
  )
  const byAssociation = remember(associationTargetCache, index, () => new WeakMap())
  const found: Attachment[] = []
  for (const { association, kind } of associations) {
    const byAnswers = remember(byAssociation, association, () => new Map<string, string[]>())
    const answers = selfAnswers(association, selection, index).join('')
    const targets = remember(byAnswers, answers, () =>
      candidates
        .filter(
          (candidate) => definitionHas(candidate, association.childId, index) && associationHolds(association, selection, candidate, index),
        )
        .map((candidate) => nameOf(candidate, index.definitions)),
    )
    if (targets.length) found.push({ kind, targets })
  }
  if (!found.length) return null
  return { kind: found[0]!.kind, targets: uniqueNormalizedNames(found.flatMap((attachment) => attachment.targets)) }
}

/** A required join under its own name (Loyal Protector) acts as a Support unit; optional retinue joins depend on who leads the host, which this does not model. */
const associationKind = (association: Association): Attachment['kind'] | null => {
  const name = association.name?.trim().toLowerCase()
  if (name === 'leading') return 'leader'
  if (name === 'supporting' || (association.min ?? 0) >= 1) return 'support'
  return null
}

function selfAnswers(group: Association | ConditionGroup, selection: Selection, index: CatalogueIndex): number[] {
  return [
    ...(group.conditions ?? []).flatMap((condition) =>
      condition.field === 'selections' && condition.queryFromSelf
        ? [selectionHas(selection, condition.childId, condition.includeChildSelections === true, index) ? 1 : 0]
        : [],
    ),
    ...(group.conditionGroups ?? []).flatMap((nested) => selfAnswers(nested, selection, index)),
  ]
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
  const counted = groupCounts(group.type, met, group.value)
  if (counted !== undefined) return counted
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
  return compares(condition.type, measured, condition.value) ?? false
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
  return (
    [definition, target].some(
      (source) => source.id === childId || source.categoryLinks?.some((category) => category.targetId === childId),
    ) || modelCategoriesOf(target, index).has(childId)
  )
}

/** Core rules 02.05.01: a unit has all the keywords of all its models, so a unit is matched by any model it can include. */
function modelCategoriesOf(unit: Definition, index: CatalogueIndex): ReadonlySet<string> {
  return remember(
    remember(modelCategoryCache, index, () => new WeakMap()),
    unit,
    () => {
      const found = new Set<string>()
      const visit = (entries: readonly Definition[]) => {
        for (const entry of entries) {
          const target = targetOf(entry, index.definitions)
          if (target.type === 'model') {
            for (const source of [entry, target]) for (const category of source.categoryLinks ?? []) found.add(category.targetId)
          } else if (target.type !== 'upgrade' && target.type !== 'unit') visit(childrenOf(target))
        }
      }
      if (unit.type === 'unit') visit(childrenOf(unit))
      return found
    },
  )
}

const childrenOf = (definition: Definition): Definition[] => [
  ...(definition.selectionEntries ?? []),
  ...(definition.selectionEntryGroups ?? []),
  ...(definition.entryLinks ?? []),
]

function findAttachment(definition: Definition, index: CatalogueIndex): Attachment | null {
  for (const [title, text] of statements(definition, index)) {
    const claim = CLAIM.exec(text)
    if (!claim) continue
    const named = names(text)
    if (!named.length) continue
    const categorized = named.flatMap((name) => [name, ...categoryTargets(name, index)])
    const keywords = named.filter(isKeywordTarget).map(normalizedName)
    const substitutions = attachmentSubstitutions(index)
    const targets = categorized.flatMap((name) => [name, ...(substitutions.get(normalizedName(name)) ?? [])])
    const afterClaim = text.slice(claim.index + claim[0].length)
    return {
      kind: title.trim().toLowerCase() === 'leader' ? 'leader' : 'support',
      targets: uniqueNormalizedNames(targets),
      ...(keywords.length ? { keywords } : {}),
      ...(REQUIRES_LEADER.test(afterClaim) ? { requiresLeader: true as const } : {}),
    }
  }
  return null
}

function attachmentSubstitutions(index: CatalogueIndex) {
  return remember(substitutionCache, index, () => {
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
          if (!substitutes.some((name) => sameText(name, substitute))) substitutes.push(substitute)
          found.set(normalizedName(base), substitutes)
        }
      }
    }
    return found
  })
}

const isKeywordTarget = (name: string) => normalizedName(name).split(' ').toSorted().join(' ') === 'battleline imperium infantry'

function categoryTargets(name: string, index: CatalogueIndex) {
  if (!isKeywordTarget(name)) return []
  const required = normalizedName(name).split(' ')

  return remember(categoryTargetCache, index, () => {
    const found: string[] = []
    for (const definition of index.definitions.values()) {
      const target = targetOf(definition, index.definitions)
      if (definition.type !== 'unit' && target.type !== 'unit') continue
      const categories = new Set(
        [...(definition.categoryLinks ?? []), ...(target.categoryLinks ?? [])].map((link) =>
          withoutFactionPrefix(normalizedName(link.name ?? '')),
        ),
      )
      if (required.every((category) => categories.has(category))) found.push(nameOf(definition, index.definitions))
    }
    const targets = uniqueNormalizedNames(found)
    return targets
  })
}

const uniqueNormalizedNames = (values: readonly string[]) => uniqueBy(values, normalizedName)

/**
 * Whether a unit may take this attachment: by name, or by the keywords it holds in
 * this list. A Tempestus Scions unit is Battleline only while Bridgehead Strike and
 * its Warlord say so, which no datasheet link records.
 */
export function admitsHost(attachment: Attachment, hostName: string, hostKeywords: readonly string[] = []): boolean {
  if (attachment.targets.some((target) => sameText(target, hostName))) return true
  const held = new Set(hostKeywords.map((keyword) => withoutFactionPrefix(normalizedName(keyword))))
  return (attachment.keywords ?? []).some((phrase) => phrase.split(' ').every((word) => held.has(word)))
}

/**
 * Why a unit standing on its own is illegal, when the data insists it joins one.
 *
 * A minimum on `associations` is the catalogue saying this datasheet is never
 * fielded alone — a Judiciar has no Leader ability of its own and only exists
 * beside a Bodyguard unit. The constraint carries the sentence to say, so the
 * player is told which units will take it rather than that a number is short.
 */
function attachmentRequirement(definition: Definition, index: CatalogueIndex): string | null {
  const sources = definitionAndTarget(definition, index)
  const required = sources
    .flatMap((source) => source.constraints ?? [])
    .find((constraint) => constraint.field === 'associations' && constraint.type === 'min' && constraint.value >= 1)
  if (!required) return null
  const name = nameOf(definition, index.definitions)
  return (
    required.message
      ?.replace(/^\{this\}\s+/, '')
      .replaceAll('{this}', name)
      .replace(/\.$/, '') ?? 'must be attached to another unit'
  )
}

/** What judging an attachment reads of one unit in a list. */
export type AttachmentParty = {
  name: string
  attachment: Attachment | null
  attachmentLimits?: AttachmentLimits
  attachmentCategories?: readonly string[]
  /** The unit's keyword names in this list. */
  keywords?: readonly string[]
  /** A maximum of zero on `associations`: the datasheet joins nothing. */
  unattachable?: true
}

export type AttachmentRefusal<T> =
  | { rule: 'host' }
  | { rule: 'leaderless' }
  | { rule: 'unattachable' }
  | { rule: 'full'; limit: number; holder: T }
  | { rule: 'category'; name: string; maximum: number }

/** The attachment facts of a datasheet in a list, read once for both judging and the client. */
export function attachmentPartyOf(definition: Definition, index: CatalogueIndex, selection?: Selection) {
  const attachment = attachmentOf(definition, index, selection)
  const associationMax = definition.constraints
    ?.filter((constraint) => constraint.type === 'max' && constraint.field === 'associations')
    .map((constraint) => constraint.value)
  return {
    attachment,
    attachmentLimits: attachmentLimitsOf(definition, index),
    attachmentCategories: attachment ? attachmentCategoriesOf(definition, index) : [],
    ...(associationMax?.length && Math.min(...associationMax) < 1 ? { unattachable: true as const } : {}),
  }
}

/**
 * Every rule that stops `joiner` joining `host`, beside the units already counted against its limits.
 *
 * The attach menus and the list's errors both ask this, so a menu never offers a
 * pairing the list then calls illegal. A full host or category ends the judgement,
 * since the joiner is then not counted among the host's occupants. A Leader may be
 * listed after the Support unit that needs it, so `companions` is everything attached.
 */
export function attachmentRefusals<T extends AttachmentParty>(
  joiner: AttachmentParty & { attachment: Attachment },
  host: AttachmentParty,
  occupants: readonly T[],
  companions: readonly AttachmentParty[] = occupants,
): AttachmentRefusal<T>[] {
  const { attachment } = joiner
  const refusals: AttachmentRefusal<T>[] = []
  if (!admitsHost(attachment, host.name, host.keywords)) refusals.push({ rule: 'host' })
  if (
    attachment.requiresLeader &&
    !companions.some((other) => other.attachment?.kind === 'leader' && admitsHost(other.attachment, host.name, host.keywords))
  ) {
    refusals.push({ rule: 'leaderless' })
  }
  if (joiner.unattachable) refusals.push({ rule: 'unattachable' })
  const limits = host.attachmentLimits ?? { leader: 1, support: 1, categories: {} }
  const same = occupants.filter((other) => other.attachment?.kind === attachment.kind)
  if (same.length >= limits[attachment.kind]) return [...refusals, { rule: 'full', limit: limits[attachment.kind], holder: same[0]! }]
  const fullCategory = (joiner.attachmentCategories ?? []).flatMap((category) => {
    const limit = limits.categories[category]
    return limit && occupants.filter((other) => other.attachmentCategories?.includes(category)).length >= limit.maximum ? [limit] : []
  })[0]
  if (fullCategory) refusals.push({ rule: 'category', ...fullCategory })
  return refusals
}

export function attachmentErrors(
  units: readonly { entryId: string; attachedTo?: number }[],
  index: CatalogueIndex,
  selections: readonly (Selection | undefined)[] = [],
  /** Each unit's keyword names in this list, by position. */
  keywords: readonly (readonly string[] | undefined)[] = [],
): EvaluationError[] {
  const errors: EvaluationError[] = []
  const parties = units.map((unit, position): AttachmentParty & { definition?: Definition } => {
    const definition = index.definitions.get(unit.entryId)
    return {
      definition,
      name: definition?.name ?? unit.entryId,
      keywords: keywords[position],
      ...(definition ? attachmentPartyOf(definition, index, selections[position]) : { attachment: null }),
    }
  })
  const occupants = new Map<number, typeof parties>()
  units.forEach((unit, position) => {
    const { definition, name, attachment } = parties[position]!
    const error = (message: string) => errors.push({ entryId: unit.entryId, entryName: name, message })
    if (unit.attachedTo === undefined) {
      // Core rules: each Support unit in a roster must be attached to a Bodyguard unit; a Leader may stand alone.
      const required =
        definition &&
        (attachmentRequirement(definition, index) ?? (attachment?.kind === 'support' ? 'must be attached to a Bodyguard unit' : null))
      if (required) error(required)
      return
    }
    if (unit.attachedTo === position) {
      error('cannot be attached to itself')
      return
    }
    const host = parties[unit.attachedTo]
    if (!host) {
      error('names a missing attachment target')
      return
    }
    if (!attachment) {
      error('cannot be attached to another unit')
      return
    }
    const joiner = { ...parties[position]!, attachment }
    const already = occupants.get(unit.attachedTo) ?? []
    const companions = parties.filter((_, at) => at !== position && units[at]!.attachedTo === unit.attachedTo)
    const refusals = attachmentRefusals(joiner, host, already, companions)
    for (const refusal of refusals) error(errorMessage(refusal, attachment.kind, host.name, index))
    if (refusals.some((refusal) => refusal.rule === 'full' || refusal.rule === 'category')) return
    occupants.set(unit.attachedTo, [...already, joiner])
  })
  return errors
}

function errorMessage(
  refusal: AttachmentRefusal<{ definition?: Definition }>,
  kind: Attachment['kind'],
  hostName: string,
  index: CatalogueIndex,
): string {
  switch (refusal.rule) {
    case 'host':
      return `cannot be attached to ${hostName}`
    case 'leaderless':
      return `cannot support ${hostName} without an attached Leader`
    case 'unattachable':
      return 'allows no attachments'
    case 'category':
      return `cannot be attached to ${hostName}, which already has ${refusal.maximum} ${refusal.name}`
    case 'full': {
      const other = nameOf(refusal.holder.definition ?? { id: '' }, index.definitions)
      if (kind === 'leader') {
        return refusal.limit === 1
          ? `cannot lead ${hostName}, which is already led by ${other}`
          : `cannot lead ${hostName}, which already has ${refusal.limit} Leaders`
      }
      return refusal.limit === 1
        ? `cannot support ${hostName}, which is already supported by ${other}`
        : `cannot support ${hostName}, which already has ${refusal.limit} Support units`
    }
  }
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
  const afterClaim = text.slice(claim.index + claim[0].length).replace(REQUIRES_LEADER, '')
  const bulleted = [...afterClaim.matchAll(BULLETED)].flatMap((match) => (match[1] ? [match[1]] : []))
  if (bulleted.length) return bulleted.map(clean).filter(Boolean)
  const emphasised = EMPHASISED.exec(afterClaim)
  if (emphasised?.[1]) return emphasised[1].split(',').map(clean).filter(Boolean)
  return afterClaim.replace(/^:\s*/, '').split(',').map(clean).filter(Boolean)
}

/** Strips the markup the text carries and the case it shouts in. */
const clean = (name: string) =>
  name
    .replace(/[†‡].*$/s, '')
    .replaceAll(/[\^*■]/g, '')
    .replace(/\.$/, '')
    .trim()
