import { groupBy, remember, uniqueBy } from './collections'
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
  type Modifier,
  nameOf,
  type Profile,
  targetOf,
} from './catalogue'
import type { EvaluationError, Selection } from './evaluate'
import { normalizedName, withoutFactionPrefix } from './name'
import { sameText } from './text'
import { modelCountOf } from './unitSize'
import { readText } from './textFacts'

/** An ability titled "Leader" or a leading association establishes that role; other attachments default to support. */
export type Attachment = {
  kind: 'leader' | 'support'
  targets: string[]
  /** Keyword phrases the text names, which a list's own rules can hand to other units. */
  keywords?: string[]
  requiresLeader?: true
  /** The other role the ability takes depending on the army, as Cato Sicarius leads unless the army includes Marneus Calgar. */
  swap?: AttachmentSwap
  /** Hosts taken only in some armies, which {@link inArmy} settles. */
  conditional?: AttachmentCondition[]
  /** Keyword sets a host holding every keyword of, and none it excludes, is admitted, which settled conditions give. */
  holding?: KeywordSet[]
  /** Hosts admitted only while both units hold `keyword`, which settled conditions give. */
  sharing?: { keyword: string; targets: string[]; keywords?: string[] }[]
  /** Bodyguards it leads beside one other leader, never one of its own; `beside` names what that other may be. */
  besideAnother?: BesideAnother[]
  /** Units it joins as part of them, outside the leader and support roles, in place of `targets`. */
  joins?: AttachmentJoin[]
}

/** Keywords a unit holds every one of, and none of `excluded`. */
export type KeywordSet = { keywords: string[]; excluded?: string[] }

/** Bodyguards in `targets` it leads beside another leader, which must be one of `besideNames` or hold one of `besideKeywords` where given. */
export type BesideAnother = { targets: string[]; besideNames?: string[]; besideKeywords?: string[] }

/**
 * Units a unit joins as part of them: those named, those holding every keyword, or any where it gives neither (`anyHost`),
 * once a leader holding every `ledBy` keyword leads them, beside no other joined unit holding one of `exclusive`.
 */
export type AttachmentJoin = { targets?: string[]; keywords?: string[]; anyHost?: true; ledBy?: string[]; exclusive?: string[] }

/**
 * Who a datasheet may join by its VS Data attachment record, each host named as the catalogue names its datasheets. VS
 * Data decides every host it names, in any role or army (`named`); the catalogue's own reading adds only hosts it never names.
 */
export type VsAttachment = {
  /** The role of `targets`, absent where the record names hosts only in some armies. */
  kind?: Attachment['kind']
  targets: string[]
  conditional?: AttachmentCondition[]
  named: string[]
  besideAnother?: BesideAnother[]
  joins?: AttachmentJoin[]
  /** As a bodyguard, the attachments it takes beyond the core one leader and one support unit. */
  capacity?: VsCapacity
  /** The catalogue's hosts VS Data does not name stay, all of them or these, where VS Data's are known wrong or unsettled. */
  catalogueHosts?: true | string[]
}

/**
 * A bodyguard's `leader` and `support` units, the second leader taken only once it fields `startingStrength` models; no
 * two the same where `distinct`, and at most `maximum` holding every keyword of each limit.
 */
export type VsCapacity = {
  leader?: number
  support?: number
  startingStrength?: number
  distinct?: true
  limits?: { keywords: string[]; maximum: number }[]
}

/** Hosts a unit takes only in some armies, until {@link inArmy} settles them; unsettled, every one is admitted. */
export type AttachmentCondition = {
  kind: Attachment['kind']
  targets?: string[]
  /** Keywords a host holding every one of is admitted, as `BATTLELINE`, `IMPERIUM` and `INFANTRY` are for an Inquisitor. */
  keywords?: string[]
  /** Keywords a host admitted by `keywords` must hold none of. */
  excludedKeywords?: string[]
  /** Groups of entry or Detachment ids, of each of which the army must hold one. */
  requires?: string[][]
  /** Entry or Detachment ids the army must hold none of. */
  excludes?: string[]
  /** A keyword the unit and its host must both hold, as a Mark of Chaos in Pactbound Zealots. */
  shared?: string
}

/** `kind` while the army does (`present`) or does not hold a unit with entry or keyword `id`. */
export type AttachmentSwap = { kind: Attachment['kind']; id: string; present: boolean }
export type AttachmentLimits = Record<Attachment['kind'], number> & {
  categories: Record<string, { name: string; maximum: number }>
  /**
   * A higher limit while every unit in `when` is attached, as a Noxious Blightbringer lets Poxwalkers take a second Leader
   * and the Visarch beside Yvraine lets a Ynnari unit take both. A limit raised several ways has a raise for each.
   */
  raises?: { kind: Attachment['kind']; maximum: number; when: string[] }[]
  /** More of a kind once the unit fields this many models, as twenty Kroot Carnivores take a second Leader. */
  growths?: { kind: Attachment['kind']; models: number; more: number }[]
  /** No two of its attached units the same datasheet. */
  distinct?: true
  /** At most `maximum` of its attached units holding every one of `keywords`, as one COMMAND SQUAD among two Leaders. */
  keywordLimits?: { keywords: string[]; maximum: number }[]
}

const CLAIM = /can be attached to the following units?/i
const REQUIRES_LEADER = /^\s*\(which already have a Leader\)\s*:/i

const BULLETED = /(?:^|\n)\s*(?:■|-)\s*([^\n]+)/g

/** `^^**Immortals, Lychguard**^^` inline, including the source's inverted `^^**` closer. */
const EMPHASISED = /\^\^\*\*(.+?)(?:\*\*\^\^|\^\^\*\*)/s

const GENERIC_SUBSTITUTION =
  /if a character unit from your army with the leader ability can be attached to (?:an?|the) (.+?), it can be attached to this unit instead/gi

const attachmentCache = new WeakMap<
  CatalogueIndex,
  { read: WeakMap<Definition, Attachment | null>; merged: WeakMap<Definition, Attachment | null> }
>()
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
  const ofKind = (kind: Attachment['kind']) =>
    constraints.filter((constraint) => normalizedName(constraintName(constraint, index)) === kind)
  const maximum = (kind: Attachment['kind']) => {
    const limits = ofKind(kind).map((constraint) => constraint.value)
    return limits.length ? Math.min(...limits) : 1
  }
  const modifiers = sources.flatMap((source) => source.modifiers ?? [])
  const raises = (['leader', 'support'] as const).flatMap((kind) =>
    ofKind(kind).flatMap((constraint) =>
      modifiers.flatMap((modifier) => {
        if (modifier.field !== constraint.id || typeof modifier.value !== 'number') return []
        const raised = modifier.type === 'set' ? modifier.value : modifier.type === 'increment' ? constraint.value + modifier.value : null
        const alternatives = raised === null ? null : attachedAlternatives(modifier.conditions, modifier.conditionGroups, 'and')
        return (alternatives ?? []).map((when) => ({ kind, maximum: raised!, when }))
      }),
    ),
  )
  const growths = (['leader', 'support'] as const).flatMap((kind) =>
    ofKind(kind).flatMap((constraint) =>
      modifiers.flatMap((modifier) => {
        const models = modifier.field === constraint.id && modifier.type === 'increment' ? growingWith(modifier) : null
        return models !== null && typeof modifier.value === 'number' ? [{ kind, models, more: modifier.value }] : []
      }),
    ),
  )
  const categories: AttachmentLimits['categories'] = {}
  for (const constraint of constraints) {
    const name = constraintName(constraint, index)
    if (!name || normalizedName(name) === 'leader' || normalizedName(name) === 'support') continue
    const key = constraint.childId ? `id:${constraint.childId}` : `name:${normalizedName(name)}`
    const existing = categories[key]
    categories[key] = { name, maximum: Math.min(existing?.maximum ?? Number.POSITIVE_INFINITY, constraint.value) }
  }
  return {
    leader: maximum('leader'),
    support: maximum('support'),
    categories,
    ...(raises.length ? { raises } : {}),
    ...(growths.length ? { growths } : {}),
  }
}

/** The model count the modifier waits on the unit reaching, or null when it waits on anything else. */
function growingWith(modifier: Modifier): number | null {
  const [condition, ...others] = modifier.conditions ?? []
  if (!condition || others.length || modifier.conditionGroups?.length) return null
  const counted = condition.childId === 'model' && condition.field === 'selections' && condition.scope === 'self'
  if (!counted) return null
  return condition.type === 'atLeast' ? condition.value : condition.type === 'greaterThan' ? condition.value + 1 : null
}

/**
 * Each set of units whose attachment together meets these conditions, or null when they wait on anything else, as
 * Death Riders take a second Leader with their Commissar beside either Lord Marshal Dreir or Lord Solar Leontus.
 */
function attachedAlternatives(
  conditions: readonly Condition[] = [],
  groups: readonly ConditionGroup[] = [],
  type: ConditionGroup['type'],
): string[][] | null {
  const attached = (condition: Condition) =>
    condition.field === 'associations' &&
    condition.scope === 'self' &&
    Boolean(condition.childId) &&
    ((condition.type === 'atLeast' && condition.value === 1) || (condition.type === 'greaterThan' && condition.value === 0))
  const parts = [
    ...conditions.map((condition) => (attached(condition) ? [[`id:${condition.childId}`]] : null)),
    ...groups.map((group) => attachedAlternatives(group.conditions, group.conditionGroups, group.type)),
  ]
  if (!parts.length || parts.some((part) => part === null)) return null
  const known = parts as string[][][]
  return type === 'or'
    ? known.flat()
    : known.reduce<string[][]>((sets, part) => sets.flatMap((set) => part.map((more) => [...set, ...more])), [[]])
}

/** The ids and categories a host's association limits can name this unit by. */
function attachmentCategoriesOf(definition: Definition, index: CatalogueIndex): string[] {
  const sources = definitionAndTarget(definition, index)
  return [
    ...new Set(
      sources.flatMap((source) =>
        [{ targetId: source.id, name: undefined }, ...(source.categoryLinks ?? [])].flatMap((category) => [
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
 * What a unit holds of its own, which an association asks about the unit itself, as Murdermind on a Chronomancer or a
 * Mark of Chaos: its catalogue tree, or for a VS pick what `ownByName` gives without one. `models` is its size, for the
 * capacity a bodyguard gains as it grows.
 */
export type OwnSelections = { holds: (childId: string | undefined, deep: boolean) => boolean; models: () => number }

const ownOf = (selection: Selection | OwnSelections, index: CatalogueIndex): OwnSelections =>
  'holds' in selection
    ? selection
    : { holds: (childId, deep) => selectionHas(selection, childId, deep, index), models: () => modelCountOf(selection, index) }

/**
 * A unit's own selections read from its datasheet and the names of what it holds, as a VS pick's allegiance, the keywords
 * that allegiance gives and its Enhancement: a condition on one of its selections holds where that selection's catalogue
 * entry or keyword bears one of `names`.
 */
export function ownByName(definition: Definition, index: CatalogueIndex, names: Iterable<string>, models: number): OwnSelections {
  const held = new Set([...names].map(ownName))
  const named = (childId: string) => {
    const entry = index.definitions.get(childId)
    return index.categories.get(childId)?.name ?? (entry ? nameOf(entry, index.definitions) : childId)
  }
  return {
    holds: (childId, deep) =>
      definitionHas(definition, childId, index) || (deep && childId !== undefined && held.has(ownName(named(childId)))),
    models: () => models,
  }
}

/** A selection's name as `ownByName` compares it: its letters and digits alone, without BSData's "upgrade". */
const ownName = (name: string) =>
  normalizedName(name)
    .replace(/\bupgrade\b/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')

/**
 * Which units this entry may be attached to, read out of its own ability text and,
 * given a selection, the associations that selection carries.
 *
 * Parsing prose is not a thing to do lightly, but for most entries the relationship
 * exists nowhere else: a sentence is what says a Plasmancer may join Immortals. Finding
 * nothing is therefore an ordinary answer, not a failure: a character with neither
 * simply cannot be attached, and every name that fails to match a datasheet is
 * dropped rather than guessed at.
 */
export function attachmentOf(definition: Definition, index: CatalogueIndex, selection?: Selection | OwnSelections): Attachment | null {
  const caches = cachesOf(index)
  const attachment = textAttachmentOf(definition, index)
  const vsData = vsAttachmentOf(definition, index)
  const hosts = vsHostsOf(index)
  if (!selection) return remember(caches.merged, definition, () => withVsData(attachment, vsData, hosts))

  const associated = attachmentFromAssociations(definition, ownOf(selection, index), index)
  if (!associated) return remember(caches.merged, definition, () => withVsData(attachment, vsData, hosts))
  return withVsData(
    {
      kind: attachment?.kind ?? associated.kind,
      targets: uniqueNormalizedNames([...(attachment?.targets ?? []), ...associated.targets]),
      ...(attachment?.keywords ? { keywords: attachment.keywords } : {}),
      ...(attachment?.requiresLeader ? { requiresLeader: true as const } : {}),
      ...(attachment?.swap ? { swap: attachment.swap } : {}),
    },
    vsData && withUnlockedHosts(vsData, associated, attachmentFromAssociations(definition, ownOf({ id: definition.id }, index), index)),
    hosts,
  )
}

const cachesOf = (index: CatalogueIndex) => remember(attachmentCache, index, () => ({ read: new WeakMap(), merged: new WeakMap() }))

/** Who the datasheet's own Leader or Support text says it may join, before associations or VS Data. */
const textAttachmentOf = (definition: Definition, index: CatalogueIndex) =>
  remember(cachesOf(index).read, definition, () => findAttachment(definition, index))

const vsAttachmentOf = (definition: Definition, index: CatalogueIndex) =>
  index.attachments?.[definition.id] ?? index.attachments?.[targetOf(definition, index.definitions).id]

const vsHostCache = new WeakMap<CatalogueIndex, ReadonlySet<string>>()
const vsHostsOf = (index: CatalogueIndex) => remember(vsHostCache, index, () => new Set((index.attachmentHosts ?? []).map(normalizedName)))

/**
 * The catalogue's reading with VS Data's record laid over it: VS Data alone decides the hosts it defines, `hosts`, and
 * the catalogue's reading stands for the rest, as datasheets VS Data has no unit for yet.
 */
function withVsData(read: Attachment | null, vsData: VsAttachment | undefined, hosts: ReadonlySet<string>): Attachment | null {
  const conditional = vsData?.conditional ?? []
  // A unit that joins others as part of them takes neither role. The catalogue's hosts VS Data never names stay, under
  // the record's exclusivity, as the leader and support readings keep theirs.
  if (vsData?.joins) {
    const deferred = deferredOf(vsData, hosts)
    const kept = (read?.targets ?? []).filter((target) => !deferred.has(normalizedName(target)))
    const exclusive = [...new Set(vsData.joins.flatMap((join) => join.exclusive ?? []))]
    const catalogue = kept.length ? [{ targets: kept, ...(exclusive.length ? { exclusive } : {}) }] : []
    return { kind: 'support', targets: [], joins: [...vsData.joins, ...catalogue] }
  }
  if (!vsData || (!vsData.targets.length && !conditional.length)) return read
  const deferred = deferredOf(vsData, hosts)
  const granted = new Set(vsData.targets.map(normalizedName))
  // The catalogue's order first, as its datasheets print their hosts, then the hosts only VS Data gives.
  const kept = (read?.targets ?? []).filter((target) => !deferred.has(normalizedName(target)) || granted.has(normalizedName(target)))
  return {
    kind: vsData.kind ?? read?.kind ?? conditional[0]!.kind,
    targets: uniqueNormalizedNames([...kept, ...vsData.targets]),
    ...(read?.keywords ? { keywords: read.keywords } : {}),
    ...(read?.requiresLeader ? { requiresLeader: true as const } : {}),
    ...(read?.swap ? { swap: read.swap } : {}),
    ...(conditional.length ? { conditional } : {}),
    ...(vsData.besideAnother ? { besideAnother: vsData.besideAnother } : {}),
  }
}

/**
 * Whether VS Data lets the datasheet `joinerEntryId` join a host of this name and keywords, in any army: true or false
 * where VS Data decides, undefined where the catalogue's reading stands, as for a host VS Data has no unit for, a joiner
 * it has no record of, or a pair `catalogueHosts` keeps. It reads entry IDs, so a list not yet built from VS Data asks it.
 */
export function vsDecidesHost(
  index: CatalogueIndex,
  joinerEntryId: string,
  hostName: string,
  hostKeywords?: readonly string[],
): boolean | undefined {
  const joiner = index.definitions.get(joinerEntryId)
  const vsData = joiner && vsAttachmentOf(joiner, index)
  if (!vsData || vsData.catalogueHosts === true) return undefined
  const host = normalizedName(hostName)
  if (!deferredOf(vsData, vsHostsOf(index)).has(host)) return undefined
  const decided = withVsData(null, vsData, vsHostsOf(index))
  return Boolean(decided && admitsHost(decided, hostName, hostKeywords))
}

/**
 * VS Data's record with the hosts the unit's own selection unlocks kept as the catalogue reads them, as Murdermind lets a
 * Chronomancer support Destroyer Cult units: VS Data's records say nothing of a unit's selections.
 */
function withUnlockedHosts(vsData: VsAttachment, selected: Attachment, unselected: Attachment | null): VsAttachment {
  if (vsData.catalogueHosts === true) return vsData
  const before = new Set((unselected?.targets ?? []).map(normalizedName))
  const unlocked = selected.targets.filter((target) => !before.has(normalizedName(target)))
  return unlocked.length ? { ...vsData, catalogueHosts: [...(vsData.catalogueHosts ?? []), ...unlocked] } : vsData
}

function deferredOf(vsData: VsAttachment, hosts: ReadonlySet<string>) {
  const named = vsData.named.map(normalizedName)
  if (vsData.catalogueHosts === true) return new Set(named)
  const kept = new Set((vsData.catalogueHosts ?? []).map(normalizedName))
  return new Set([...named, ...hosts].filter((host) => !kept.has(host)))
}

/**
 * The attachment a datasheet page shows: its ability text, or failing that its unselected associations, with every host
 * it takes in some army. Association targets are not shown alongside text because many name Legends and Crucible units
 * the printed datasheet does not.
 */
export function referenceAttachmentOf(definition: Definition, index: CatalogueIndex): Attachment | null {
  // A datasheet without ability text reads its hosts from its associations, which only a selection reads.
  const attachment = textAttachmentOf(definition, index)
    ? attachmentOf(definition, index)
    : attachmentOf(definition, index, { id: definition.id })
  if (!attachment) return null
  const datasheetNames = datasheetNamesOf(index)
  const targets = uniqueNormalizedNames([
    ...attachment.targets,
    ...(attachment.conditional ?? []).flatMap((condition) => condition.targets ?? []),
    ...(attachment.joins ?? []).flatMap((join) => join.targets ?? []),
  ])
  // Ability text prints a host in capitals and without the Legends or Crucible mark its datasheet's name carries, so each
  // is named as its datasheet is, or as every datasheet it names the start of; a keyword host reads as units of it.
  const keywords = new Set(attachment.keywords ?? [])
  const named = (target: string): string[] => {
    const name =
      ['', ' [legends]', ' [crucible]'].map((mark) => datasheetNames.exact.get(`${normalizedName(target)}${mark}`)).find(Boolean) ??
      datasheetNames.loose.get(looseName(target))
    if (name) return [name]
    const started = [...datasheetNames.exact].flatMap(([key, value]) => (key.startsWith(`${normalizedName(target)} with `) ? [value] : []))
    if (started.length) return started.toSorted()
    return [keywords.has(normalizedName(target)) ? `${target} units` : target]
  }
  return { ...attachment, targets: uniqueNormalizedNames(targets.flatMap(named)) }
}

/** A name without spacing or plurals, as text prints "PLAGUE BEARERS" for Plaguebearers and "GUARDSMAN" for Guardsmen. */
const looseName = (name: string) =>
  normalizedName(name)
    .split(' ')
    .map((word) => word.replace(/men$/, 'man').replace(/ies$/, 'y').replace(/s$/, ''))
    .join('')

const datasheetNameCache = new WeakMap<CatalogueIndex, { exact: ReadonlyMap<string, string>; loose: ReadonlyMap<string, string> }>()
const datasheetNamesOf = (index: CatalogueIndex) =>
  remember(datasheetNameCache, index, () => {
    const exact = new Map<string, string>()
    for (const entries of index.datasheets.values())
      for (const id of entries) {
        const datasheet = index.definitions.get(id)
        // A hidden datasheet is omitted from the reference, so a host only it answers to keeps its printed name.
        const name = datasheet && !datasheet.hidden && nameOf(datasheet, index.definitions)
        if (name && !exact.has(normalizedName(name))) exact.set(normalizedName(name), name)
      }
    // A loose name two datasheets share names neither.
    const byLoose = groupBy([...exact.values()], looseName)
    const loose = new Map([...byLoose].flatMap(([key, sharing]) => (sharing.length === 1 ? [[key, sharing[0]!]] : [])))
    return { exact, loose }
  })

function attachmentFromAssociations(definition: Definition, own: OwnSelections, index: CatalogueIndex): Attachment | null {
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
    const answers = selfAnswers(association, own).join('')
    const targets = remember(byAnswers, answers, () =>
      candidates
        .filter((candidate) => definitionHas(candidate, association.childId, index) && associationHolds(association, own, candidate, index))
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

function selfAnswers(group: Association | ConditionGroup, own: OwnSelections): number[] {
  return [
    ...(group.conditions ?? []).flatMap((condition) =>
      condition.field === 'selections' && condition.queryFromSelf
        ? [own.holds(condition.childId, condition.includeChildSelections === true) ? 1 : 0]
        : [],
    ),
    ...(group.conditionGroups ?? []).flatMap((nested) => selfAnswers(nested, own)),
  ]
}

function associationHolds(association: Association, own: OwnSelections, candidate: Definition, index: CatalogueIndex): boolean {
  const results = [
    ...(association.conditions ?? []).map((condition) => associationConditionHolds(condition, own, candidate, index)),
    ...(association.conditionGroups ?? []).map((group) => associationGroupHolds(group, own, candidate, index)),
  ]
  return results.length > 0 && results.every(Boolean)
}

function associationGroupHolds(group: ConditionGroup, own: OwnSelections, candidate: Definition, index: CatalogueIndex): boolean {
  const results = [
    ...(group.conditions ?? []).map((condition) => associationConditionHolds(condition, own, candidate, index)),
    ...(group.conditionGroups ?? []).map((nested) => associationGroupHolds(nested, own, candidate, index)),
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

function associationConditionHolds(condition: Condition, own: OwnSelections, candidate: Definition, index: CatalogueIndex): boolean {
  let measured: number
  if (condition.field === 'associations') measured = 0
  else if (condition.field !== 'selections') return false
  else if (condition.queryFromSelf) measured = own.holds(condition.childId, condition.includeChildSelections === true) ? 1 : 0
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
          } else if (target.type !== 'upgrade' && target.type !== 'unit')
            visit((entry === target ? [entry] : [entry, target]).flatMap(childrenOf))
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
  for (const [title, text, modifiers] of statements(definition, index)) {
    const claim = readText(text, index.textFacts, attachmentClaim, (facts) => facts.attachment ?? null)
    if (!claim) continue
    const categorized = claim.names.flatMap((name) => [name, ...categoryTargets(name, index)])
    const keywords = claim.names.filter(isKeywordTarget).map(normalizedName)
    const substitutions = attachmentSubstitutions(index)
    const targets = categorized.flatMap((name) => [name, ...(substitutions.get(normalizedName(name)) ?? [])])
    return {
      kind: attachmentKind(title),
      targets: uniqueNormalizedNames(targets),
      ...(keywords.length ? { keywords } : {}),
      ...withSwap(modifiers),
      ...(claim.requiresLeader ? { requiresLeader: true as const } : {}),
    }
  }
  return null
}

/** Who a Leader or Support ability says its model can join, as its words list them. */
export type AttachmentClaim = { names: string[]; requiresLeader?: true }

export function attachmentClaim(text: string): AttachmentClaim | null {
  const claim = CLAIM.exec(text)
  if (!claim) return null
  const named = names(text)
  if (!named.length) return null
  return { names: named, ...(REQUIRES_LEADER.test(text.slice(claim.index + claim[0].length)) ? { requiresLeader: true as const } : {}) }
}

/** The units a text lets a Leader join this unit in place of. */
export function substitutedUnits(text: string): string[] {
  const readable = text.replaceAll(/[\^*]/g, '').replaceAll('\u00a0', ' ').replaceAll(/\s+/g, ' ')
  return [...readable.matchAll(GENERIC_SUBSTITUTION)].flatMap((match) => {
    const base = match[1]?.replace(/\s+unit$/i, '').trim()
    return base ? [base] : []
  })
}

function attachmentSubstitutions(index: CatalogueIndex) {
  return remember(substitutionCache, index, () => {
    const found = new Map<string, string[]>()
    for (const definition of index.definitions.values()) {
      const target = targetOf(definition, index.definitions)
      if (definition.type !== 'unit' && target.type !== 'unit') continue
      const substitute = nameOf(definition, index.definitions)
      for (const [, text] of statements(definition, index)) {
        for (const base of readText(text, index.textFacts, substitutedUnits, (facts) => facts.substitutes ?? [])) {
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
    return uniqueNormalizedNames(found)
  })
}

const uniqueNormalizedNames = (values: readonly string[]) => uniqueBy(values, normalizedName)

/**
 * Whether a unit may take this attachment: by name, or by the keywords it holds in
 * this list. A Tempestus Scions unit is Battleline only while Bridgehead Strike and
 * its Warlord say so, which no datasheet link records.
 */
export function admitsHost(attachment: Attachment, hostName: string, hostKeywords?: readonly string[]): boolean {
  const named = (targets: readonly string[] = []) => targets.some((target) => sameText(target, hostName))
  const held = new Set((hostKeywords ?? []).map(heldKeyword))
  const holds = (keywords: readonly string[] = [], excluded: readonly string[] = []) =>
    keywords.length > 0 &&
    keywords.every((keyword) => held.has(heldKeyword(keyword))) &&
    !excluded.some((keyword) => held.has(heldKeyword(keyword)))
  return (
    named(attachment.targets) ||
    (attachment.keywords ?? []).some((phrase) => phrase.split(' ').every((word) => held.has(word))) ||
    (attachment.holding ?? []).some((set) => holds(set.keywords, set.excluded)) ||
    (attachment.joins ?? []).some((join) => join.anyHost || named(join.targets) || holds(join.keywords)) ||
    // A host whose keywords are not known is not refused for a keyword it may hold.
    (attachment.sharing ?? []).some(
      (entry) => (!hostKeywords || held.has(heldKeyword(entry.keyword))) && (named(entry.targets) || holds(entry.keywords)),
    ) ||
    // Unsettled, a host any army lets the unit join is admitted, as an imported list's groups are read before its army is.
    (attachment.conditional ?? []).some((condition) => named(condition.targets) || holds(condition.keywords, condition.excludedKeywords))
  )
}

const heldKeyword = (keyword: string) => withoutFactionPrefix(normalizedName(keyword))

/**
 * The attachment as judged against a host not yet in the list, which may still take the keyword a settled condition asks
 * both units to share, as a Chosen unit added in Pactbound Zealots takes its Mark of Chaos once fielded.
 */
export function beforeHostChoices(attachment: Attachment): Attachment {
  if (!attachment.sharing) return attachment
  const { sharing, ...rest } = attachment
  const holding = [...(rest.holding ?? []), ...sharing.flatMap((entry) => (entry.keywords ? [{ keywords: entry.keywords }] : []))]
  return {
    ...rest,
    targets: uniqueNormalizedNames([...rest.targets, ...sharing.flatMap((entry) => entry.targets)]),
    ...(holding.length ? { holding } : {}),
  }
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
  | { rule: 'exclusive'; holder: T }

/** The attachment facts of a datasheet in a list, read once for both judging and the client. */
export function attachmentPartyOf(definition: Definition, index: CatalogueIndex, selection?: Selection | OwnSelections) {
  const attachment = attachmentOf(definition, index, selection)
  const limits = withVsCapacity(attachmentLimitsOf(definition, index), vsAttachmentOf(definition, index)?.capacity)
  const models = selection && limits.growths ? ownOf(selection, index).models() : 0
  const grown = (kind: Attachment['kind']) =>
    limits[kind] +
    (limits.growths ?? []).reduce((more, growth) => more + (growth.kind === kind && models >= growth.models ? growth.more : 0), 0)
  const associationMax = definition.constraints
    ?.filter((constraint) => constraint.type === 'max' && constraint.field === 'associations')
    .map((constraint) => constraint.value)
  return {
    attachment,
    attachmentLimits: { ...limits, leader: grown('leader'), support: grown('support') },
    attachmentCategories: attachment ? attachmentCategoriesOf(definition, index) : [],
    ...(associationMax?.length && Math.min(...associationMax) < 1 ? { unattachable: true as const } : {}),
  }
}

/** The catalogue's limits with VS Data's capacity for the bodyguard laid over them, its raises from attached units kept. */
function withVsCapacity(limits: AttachmentLimits, capacity: VsCapacity | undefined): AttachmentLimits {
  if (!capacity) return limits
  const { leader = 1, support = 1, startingStrength, distinct, limits: keywordLimits = [] } = capacity
  return {
    leader: startingStrength ? 1 : leader,
    support,
    categories: {},
    ...(limits.raises ? { raises: limits.raises } : {}),
    ...(startingStrength && leader > 1 ? { growths: [{ kind: 'leader' as const, models: startingStrength, more: leader - 1 }] } : {}),
    ...(distinct ? { distinct } : {}),
    ...(keywordLimits.length ? { keywordLimits } : {}),
  }
}

/** Whether `attachment` lets its unit lead `host` beside `partner`, the other leader there. */
const leadsBeside = (attachment: Attachment | null | undefined, host: AttachmentParty, partner: AttachmentParty) =>
  (attachment?.besideAnother ?? []).some(
    (entry) =>
      entry.targets.some((target) => sameText(target, host.name)) &&
      ((!entry.besideNames && !entry.besideKeywords) ||
        (entry.besideNames ?? []).some((name) => sameText(name, partner.name)) ||
        (entry.besideKeywords ?? []).some((keyword) => holdsKeyword(partner, keyword))),
  )

/** Whether a unit holds a keyword in this list, or might: one whose keywords are not known is not refused for it. */
const holdsKeyword = (party: AttachmentParty, keyword: string) =>
  !party.keywords || party.keywords.some((held) => heldKeyword(held) === heldKeyword(keyword))

/** Why a unit may not join `host` as part of it: no join of its admits the host, or its leader, or a unit joined there already. */
function joinRefusals<T extends AttachmentParty>(
  joins: readonly AttachmentJoin[],
  joiner: AttachmentParty,
  host: AttachmentParty,
  occupants: readonly T[],
  companions: readonly AttachmentParty[],
): AttachmentRefusal<T>[] {
  const fitting = joins.filter((join) => admitsHost({ kind: 'support', targets: [], joins: [join] }, host.name, host.keywords))
  if (!fitting.length) return [{ rule: 'host' }]
  // "Led by a CRYPTEK model" is met by whatever attached character holds the keywords, a Cryptek being a Support unit.
  const attached = companions.filter((other) => other.attachment && !other.attachment.joins)
  const led = fitting.filter(
    (join) => !join.ledBy || attached.some((leader) => join.ledBy!.every((keyword) => holdsKeyword(leader, keyword))),
  )
  if (!led.length) return [{ rule: 'leaderless' }]
  // Only a unit already joined shuts another out, either's exclusive keywords held by the other, so a clash is said once.
  const joined = occupants.filter((other) => other !== joiner && other.attachment?.joins)
  const excludes = (exclusive: readonly string[] | undefined, other: AttachmentParty) =>
    Boolean(other.keywords && exclusive?.some((keyword) => holdsKeyword(other, keyword)))
  const clashOf = (join: AttachmentJoin) =>
    joined.find((other) => excludes(join.exclusive, other) || other.attachment!.joins!.some((theirs) => excludes(theirs.exclusive, joiner)))
  if (led.some((join) => !clashOf(join))) return []
  return [{ rule: 'exclusive', holder: clashOf(led[0]!) as T }]
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
  // A unit that joins another as part of it takes no place among its leader and support units.
  if (attachment.joins)
    return [
      ...joinRefusals<T>(attachment.joins, joiner, host, occupants, companions),
      ...(joiner.unattachable ? [{ rule: 'unattachable' as const }] : []),
    ]
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
  const same = occupants.filter((other) => other.attachment?.kind === attachment.kind && !other.attachment.joins)
  // A raise counts everything attached, as a Warlock Conclave the official app lists after both the Leaders it makes room for.
  const named = new Set([joiner, ...occupants, ...companions].flatMap((party) => party.attachmentCategories ?? []))
  const raised = (limits.raises ?? []).filter(
    (raise) => raise.kind === attachment.kind && raise.maximum > limits[attachment.kind] && raise.when.every((key) => named.has(key)),
  )
  // A second leader that may lead beside the first, or that the first may lead beside, makes room for both.
  const partner = attachment.kind === 'leader' && same.length === 1 ? same[0]! : undefined
  const beside =
    partner !== undefined &&
    limits.leader < 2 &&
    !sameText(partner.name, joiner.name) &&
    (leadsBeside(attachment, host, partner) || leadsBeside(partner.attachment, host, joiner))
  const allowed = Math.max(limits[attachment.kind], ...raised.map((raise) => raise.maximum), beside ? 2 : 0)
  // A datasheet that raises the limit says two of the same Leader still cannot share a unit, which the data does not record.
  const twin = raised.length || limits.distinct ? same.find((other) => sameText(other.name, joiner.name)) : undefined
  if (twin) return [...refusals, { rule: 'full', limit: 1, holder: twin }]
  if (same.length >= allowed) return [...refusals, { rule: 'full', limit: allowed, holder: same[0]! }]
  const fullCategory = (joiner.attachmentCategories ?? []).flatMap((category) => {
    const limit = limits.categories[category]
    return limit && occupants.filter((other) => other.attachmentCategories?.includes(category)).length >= limit.maximum ? [limit] : []
  })[0]
  if (fullCategory) refusals.push({ rule: 'category', ...fullCategory })
  const attached = occupants.filter((other) => !other.attachment?.joins)
  const fullKeywords = (limits.keywordLimits ?? []).find(
    ({ keywords, maximum }) =>
      keywords.every((keyword) => holdsKeyword(joiner, keyword) && joiner.keywords) &&
      attached.filter((other) => other.keywords && keywords.every((keyword) => holdsKeyword(other, keyword))).length >= maximum,
  )
  if (fullKeywords) refusals.push({ rule: 'category', name: titleCaseKeywords(fullKeywords.keywords), maximum: fullKeywords.maximum })
  return refusals
}

const titleCaseKeywords = (keywords: readonly string[]) =>
  keywords.map((keyword) => keyword.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())).join(' ')

export function attachmentErrors(
  units: readonly { entryId: string; attachedTo?: number }[],
  index: CatalogueIndex,
  selections: readonly (Selection | OwnSelections | undefined)[] = [],
  /** Each unit's keyword names in this list, by position. */
  keywords: readonly (readonly string[] | undefined)[] = [],
  detachmentIds: readonly string[] = [],
): EvaluationError[] {
  const errors: EvaluationError[] = []
  const army = armyIds(
    units.map((unit) => unit.entryId),
    index,
    detachmentIds,
  )
  const parties = units.map((unit, position): AttachmentParty & { definition?: Definition } => {
    const definition = index.definitions.get(unit.entryId)
    const party = definition ? attachmentPartyOf(definition, index, selections[position]) : { attachment: null }
    return {
      definition,
      name: definition?.name ?? unit.entryId,
      keywords: keywords[position],
      ...party,
      attachment: inArmy(party.attachment, army, keywords[position]),
    }
  })
  const occupants = new Map<number, typeof parties>()
  units.forEach((unit, position) => {
    const { definition, name, attachment } = parties[position]!
    const error = (message: string) => errors.push({ entryId: unit.entryId, entryName: name, message })
    if (unit.attachedTo === undefined) {
      // Core rules: each Support unit in a roster must be attached to a Bodyguard unit; a Leader may stand alone. A unit
      // that joins another as part of it and finds none to join takes no part in the battle, which leaves the list legal.
      const required =
        definition &&
        !attachment?.joins &&
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
    for (const refusal of refusals) error(errorMessage(refusal, attachment, host.name, index))
    if (refusals.some((refusal) => refusal.rule === 'full' || refusal.rule === 'category' || refusal.rule === 'exclusive')) return
    occupants.set(unit.attachedTo, [...already, joiner])
  })
  return errors
}

function errorMessage(
  refusal: AttachmentRefusal<{ definition?: Definition }>,
  { kind, joins }: Attachment,
  hostName: string,
  index: CatalogueIndex,
): string {
  switch (refusal.rule) {
    case 'host':
      return joins ? `cannot join ${hostName}` : `cannot be attached to ${hostName}`
    case 'leaderless':
      return joins ? `cannot join ${hostName} without the character it needs` : `cannot support ${hostName} without an attached Leader`
    case 'exclusive':
      return `cannot join ${hostName}, which ${nameOf(refusal.holder.definition ?? { id: '' }, index.definitions)} has already joined`
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
function statements(definition: Definition, index: CatalogueIndex): [string, string, readonly Modifier[]][] {
  const found: [string, string, readonly Modifier[]][] = []

  const fromProfile = (profile: Profile, title: string) => {
    for (const characteristic of profile.characteristics ?? []) {
      if (characteristic.$text) found.push([title, characteristic.$text, profile.modifiers ?? []])
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

const attachmentKind = (title: string): Attachment['kind'] => (title.trim().toLowerCase() === 'leader' ? 'leader' : 'support')

/** A rename of the ability to the other role that waits only on whether the army holds one unit. */
function withSwap(modifiers: readonly Modifier[]): { swap: AttachmentSwap } | Record<string, never> {
  for (const modifier of modifiers) {
    const [condition, ...others] = modifier.conditions ?? []
    if (modifier.field !== 'name' || modifier.type !== 'set' || typeof modifier.value !== 'string') continue
    if (!['leader', 'support'].includes(modifier.value.trim().toLowerCase())) continue
    if (!condition?.childId || others.length || modifier.conditionGroups?.length) continue
    if (condition.field !== 'selections' || condition.scope !== 'force') continue
    const present = condition.type === 'atLeast' && condition.value === 1
    const absent = condition.type === 'lessThan' && condition.value === 1
    if (present || absent) return { swap: { kind: attachmentKind(modifier.value), id: condition.childId, present } }
  }
  return {}
}

/** The ids and keyword ids an army's units answer to, and its Detachments, which an attachment's swap and conditions ask about. */
export function armyIds(entryIds: readonly string[], index: CatalogueIndex, detachmentIds: readonly string[] = []): Set<string> {
  return new Set([
    ...detachmentIds,
    ...entryIds.flatMap((id) => {
      const definition = index.definitions.get(id)
      if (!definition) return []
      const target = targetOf(definition, index.definitions)
      return [
        definition.id,
        target.id,
        ...[definition, target].flatMap((source) => (source.categoryLinks ?? []).map((link) => link.targetId)),
      ]
    }),
  ])
}

/** Every role the attachment can take, its own first, as a reference page lists Cato Sicarius both leading and supporting. */
export const attachmentRoles = (attachment: Attachment): Attachment['kind'][] =>
  attachment.swap && attachment.swap.kind !== attachment.kind ? [attachment.kind, attachment.swap.kind] : [attachment.kind]

/**
 * The attachment as this army has it, its swap and conditions settled. `army` holds the army's entry, keyword and
 * Detachment ids; `keywords` are the unit's own, which a condition both units must share asks about.
 */
export function inArmy<T extends Attachment | null>(attachment: T, army: ReadonlySet<string>, keywords?: readonly string[]): T {
  if (!attachment?.swap && !attachment?.conditional) return attachment
  const { swap, conditional = [], ...rest } = attachment
  const swapped = swap && army.has(swap.id) === swap.present ? swap.kind : rest.kind
  // A unit whose keywords are not known is not refused for a keyword it may hold.
  const held = keywords && new Set(keywords.map(heldKeyword))
  const holding = conditional.filter(
    (condition) =>
      (condition.requires ?? []).every((group) => group.some((id) => army.has(id))) &&
      !(condition.excludes ?? []).some((id) => army.has(id)) &&
      (condition.shared === undefined || !held || held.has(heldKeyword(condition.shared))),
  )
  // A unit that joins only under conditions takes the role of those that hold, as Cato Sicarius supports Victrix Honour
  // Guard beside Marneus Calgar and leads them without him.
  const kind =
    !rest.targets.length && !rest.keywords?.length && !holding.some((condition) => condition.kind === swapped)
      ? (holding[0]?.kind ?? swapped)
      : swapped
  const own = holding.filter((condition) => condition.kind === kind)
  const targets = uniqueNormalizedNames([
    ...rest.targets,
    ...own.flatMap((condition) => (condition.shared ? [] : (condition.targets ?? []))),
  ])
  const holdingKeywords = own.flatMap((condition) =>
    condition.shared || !condition.keywords
      ? []
      : [{ keywords: condition.keywords, ...(condition.excludedKeywords ? { excluded: condition.excludedKeywords } : {}) }],
  )
  const sharing = own.flatMap((condition) =>
    condition.shared
      ? [{ keyword: condition.shared, targets: condition.targets ?? [], ...(condition.keywords ? { keywords: condition.keywords } : {}) }]
      : [],
  )
  return {
    ...rest,
    kind,
    targets,
    ...(holdingKeywords.length ? { holding: holdingKeywords } : {}),
    ...(sharing.length ? { sharing } : {}),
  } as T
}

function names(text: string): string[] {
  const claim = CLAIM.exec(text)
  if (!claim) return []
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
