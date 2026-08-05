import type { CatalogueIndex, Definition, InfoGroup, Profile } from './catalogue'
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

/** `■ IMMORTALS` on its own line, which is one of the two ways the data writes a list. */
const BULLETED = /■\s*([^\n]+)/g

/** `^^**Immortals, Lychguard**^^` inline, which is the other. */
const EMPHASISED = /\^\^\*\*(.+?)\*\*\^\^/s

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
    return { kind: title.trim().toLowerCase() === 'leader' ? 'leader' : 'support', targets: named }
  }
  return null
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

/** Every ability on the entry, as title and words. */
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

  for (const group of definition.infoGroups ?? []) fromGroup(group)
  for (const profile of definition.profiles ?? []) fromProfile(profile, profile.name ?? '')
  // A shared ability is linked rather than repeated, and the link may rename it.
  for (const link of definition.infoLinks ?? []) {
    const target = index.shared.get(link.targetId)
    if (!target) continue
    if ('characteristics' in target) fromProfile(target, link.name ?? target.name ?? '')
    else fromGroup({ ...target, name: link.name ?? target.name })
  }

  return found
}

function names(text: string): string[] {
  const bulleted = [...text.matchAll(BULLETED)].map((match) => match[1])
  if (bulleted.length) return bulleted.map(clean).filter(Boolean)
  const emphasised = EMPHASISED.exec(text.slice(text.toLowerCase().indexOf(CLAIM)))
  if (!emphasised?.[1]) return []
  return emphasised[1].split(',').map(clean).filter(Boolean)
}

/** Strips the markup the text carries and the case it shouts in. */
const clean = (name: string) =>
  name
    .replaceAll(/[\^*■]/g, '')
    .replace(/\.$/, '')
    .trim()
