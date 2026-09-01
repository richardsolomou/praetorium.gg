import type { Datasheet } from '../server/catalogue'
import { normalizedName, normalizedNameVariants } from '../core/name'

type AbilityKind = Datasheet['abilities'][number]['kind']

export function primaryUnitProfile(sheet: Pick<Datasheet, 'name' | 'profiles' | 'composition'>) {
  const profiles = sheet.profiles.filter((profile) => profile.type === 'Unit')
  for (const name of normalizedNameVariants(sheet.name)) {
    const profile = profiles.find((candidate) => normalizedName(candidate.name) === name)
    if (profile) return profile
  }
  for (const line of sheet.composition) {
    if (Number(line.match(/\d+/)?.[0]) === 0) continue
    const composition = normalizedName(line)
    const profile = profiles.find((candidate) => normalizedNameVariants(candidate.name).some((name) => composition.includes(name)))
    if (profile) return profile
  }
  return profiles[0]
}

export const abilitySections = {
  core: 'Core abilities',
  faction: 'Faction abilities',
  datasheet: 'Datasheet abilities',
  rule: 'Rules',
  upgrade: 'Unit upgrades',
  wargear: 'Wargear abilities',
} satisfies Record<AbilityKind, string>

export function compositionCount(composition: readonly string[]) {
  const alternatives: { minimum: number; maximum: number }[][] = [[]]
  for (const line of composition) {
    if (line.trim().toLocaleLowerCase() === 'or') {
      alternatives.push([])
      continue
    }
    for (const count of line.matchAll(/(\d+)(?:\s*[-–]\s*(\d+))?/g)) {
      alternatives.at(-1)?.push({ minimum: Number(count[1]), maximum: Number(count[2] ?? count[1]) })
    }
  }
  const totals = alternatives.flatMap((groups) =>
    groups.length
      ? [
          {
            minimum: groups.reduce((total, group) => total + group.minimum, 0),
            maximum: groups.reduce((total, group) => total + group.maximum, 0),
          },
        ]
      : [],
  )
  if (!totals.length) return `${composition.length} ${composition.length === 1 ? 'model' : 'models'}`

  const minimum = Math.min(...totals.map((total) => total.minimum))
  const maximum = Math.max(...totals.map((total) => total.maximum))
  const count = minimum === maximum ? String(minimum) : `${minimum}–${maximum}`
  return `${count} ${maximum === 1 ? 'model' : 'models'}`
}

/**
 * The keywords something in the list put on a weapon: the ones the printed profile
 * does not have.
 *
 * A modifier appends to the characteristic rather than announcing what it added, so
 * the difference between what is printed and what is shown is the only statement of
 * which keyword is new. Named rather than counted, because a detachment may add one
 * keyword to a weapon that already lists three.
 */
export function addedKeywords(keywords: { value: string; baseValue?: string }): string[] {
  if (keywords.baseValue === undefined) return []
  const printed = new Set(splitKeywords(keywords.baseValue))
  return splitKeywords(keywords.value).filter((keyword) => !printed.has(keyword))
}

export const splitKeywords = (value: string) => value.split(',').map((keyword) => keyword.trim())

type Ability = { name: string; kind: string }
type Attachment = { kind?: string }

const attachmentRole = (ability: Ability) => ability.name.trim().toLocaleLowerCase()

export function referenceAbilities<T extends Ability>(abilities: readonly T[], attachments: readonly Attachment[]): T[] {
  const roles = new Set(attachments.map(({ kind }) => kind))
  return abilities.filter((ability) => !roles.has(attachmentRole(ability)) || !['datasheet', 'rule'].includes(ability.kind))
}

type AttachmentSheet = Pick<Datasheet, 'attachments' | 'leaders' | 'supporters'>

export function attachmentGroups(sheet: AttachmentSheet) {
  return [
    { title: 'Can lead', relationships: sheet.attachments.filter((entry) => entry.kind === 'leader') },
    { title: 'Can support', relationships: sheet.attachments.filter((entry) => entry.kind === 'support') },
    { title: 'Can be led by', relationships: sheet.leaders },
    { title: 'Can be supported by', relationships: sheet.supporters },
  ].filter(({ relationships }) => relationships.length)
}
