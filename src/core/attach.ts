import { type CatalogueIndex, type Definition, type InfoGroup, nameOf, type Profile, targetOf } from './catalogue'
import type { EvaluationError } from './evaluate'

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

const CLAIM = 'can be attached to the following units'

const BULLETED = /(?:^|\n)\s*(?:■|-)\s*([^\n]+)/g

/** `^^**Immortals, Lychguard**^^` inline, which is the other. */
const EMPHASISED = /\^\^\*\*(.+?)\*\*\^\^/s

const GENERIC_SUBSTITUTION =
  /if a character unit from your army with the leader ability can be attached to (?:an?|the) (.+?), it can be attached to this unit instead/gi

const substitutionCache = new WeakMap<CatalogueIndex, ReadonlyMap<string, readonly string[]>>()

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
export function attachmentOf(definition: Definition, index: CatalogueIndex): Attachment | null {
  for (const [title, text] of statements(definition, index)) {
    if (!text.toLowerCase().includes(CLAIM)) continue
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

const normalizedName = (name: string) => name.toLocaleLowerCase().replaceAll('\u00a0', ' ').replaceAll(/\s+/g, ' ').trim()

function categoryTargets(name: string, index: CatalogueIndex) {
  const required = normalizedName(name).replace('battleliine', 'battleline').split(' ').toSorted()
  if (required.join(' ') !== 'battleline imperium infantry') return []

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
  return uniqueNames(found)
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

export function attachmentErrors(units: readonly { entryId: string; attachedTo?: number }[], index: CatalogueIndex): EvaluationError[] {
  const errors: EvaluationError[] = []
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
    const attachment = definition && attachmentOf(definition, index)
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
  const bulleted = [...text.matchAll(BULLETED)].map((match) => match[1])
  if (bulleted.length) return bulleted.map(clean).filter(Boolean)
  const emphasised = EMPHASISED.exec(text.slice(text.toLowerCase().indexOf(CLAIM)))
  if (emphasised?.[1]) return emphasised[1].split(',').map(clean).filter(Boolean)
  return text
    .slice(text.toLowerCase().indexOf(CLAIM) + CLAIM.length)
    .replace(/^:\s*/, '')
    .split(',')
    .map(clean)
    .filter(Boolean)
}

/** Strips the markup the text carries and the case it shouts in. */
const clean = (name: string) =>
  name
    .replaceAll(/[\^*■]/g, '')
    .replace(/\.$/, '')
    .trim()
