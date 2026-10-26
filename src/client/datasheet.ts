import { sameWargear, wargearBaseName } from '../core/wargear'
import { splitWeaponKeywords as splitKeywords } from '../core/ruleReference'
import { datasheetCharacteristicKindOf, datasheetProfileKindOf } from '../core/datasheetStructure'
import type { Datasheet } from '../contracts/catalogue'
import { normalizedName, normalizedNameVariants } from '../core/name'
import { groupBy } from '../core/collections'

type AbilityKind = Datasheet['abilities'][number]['kind']

/**
 * A datasheet's unconditional unit sizes and costs as one line, or null when it has none.
 * A cost that depends on a keyword, faction or detachment is left out rather than stated
 * without the condition that makes it true.
 */
export function unitCostsSummary(costs: Datasheet['costs']) {
  const unconditional = unconditionalCosts(costs)
  if (!unconditional.length) return null
  return unconditional.map((cost) => `${cost.models} ${cost.models === '1' ? 'model' : 'models'} for ${cost.cost} pts`).join(', ')
}

const unconditionalCosts = (costs: Datasheet['costs']) =>
  costs
    .filter((cost) => !cost.keyword && !cost.faction && !cost.detachment && !cost.copies)
    .toSorted((left, right) => Number(left.models) - Number(right.models))

/**
 * A datasheet's unconditional price as one figure, `80 pts`, or the range its unit sizes span,
 * `80–160 pts`; the sheet's own points when it prints no sizes, and null when nothing is unconditional.
 */
export function datasheetPoints(sheet: Pick<Datasheet, 'points' | 'costs'>) {
  const unconditional = unconditionalCosts(sheet.costs).map((cost) => Number(cost.cost))
  if (!unconditional.length) return sheet.points === null ? null : `${sheet.points} pts`
  if (unconditional.some((cost) => !Number.isFinite(cost))) return null
  const low = Math.min(...unconditional)
  const high = Math.max(...unconditional)
  return low === high ? `${low} pts` : `${low}–${high} pts`
}

export function datasheetDescription(sheet: Pick<Datasheet, 'name' | 'points' | 'costs' | 'baseSize'>, faction: string) {
  const costs = unitCostsSummary(sheet.costs) ?? (sheet.points === null ? null : `${sheet.points} points`)
  return [
    `${sheet.name} datasheet for ${faction}.`,
    costs ? `${costs}.` : null,
    sheet.baseSize && !sheet.baseSize.includes('\n') ? `Base size: ${sheet.baseSize}.` : null,
    'Profiles, weapons, abilities and wargear.',
  ]
    .filter(Boolean)
    .join(' ')
}

export function primaryUnitProfile(sheet: Pick<Datasheet, 'name' | 'profiles'>) {
  const profiles = sheet.profiles.filter((profile) => datasheetProfileKindOf(profile) === 'unit')
  for (const name of normalizedNameVariants(sheet.name)) {
    const profile = profiles.find((candidate) => normalizedName(candidate.name) === name)
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

type Profile = Datasheet['profiles'][number]
type ProfileTableColumn = { key: string; characteristic: Profile['values'][number] }

const profileCharacteristicKey = (characteristic: Profile['values'][number]) => {
  const kind = datasheetCharacteristicKindOf(characteristic)
  return kind === 'other' ? `other:${characteristic.name}` : kind
}

export function profileTableColumns(profiles: readonly Profile[]): ProfileTableColumn[] {
  const columns = new Map<string, Profile['values'][number]>()
  for (const profile of profiles) {
    for (const characteristic of profile.values) {
      const key = profileCharacteristicKey(characteristic)
      if (!columns.has(key)) columns.set(key, characteristic)
    }
  }
  return [...columns].map(([key, characteristic]) => ({ key, characteristic }))
}

export function profileTableValue(profile: Profile, column: ProfileTableColumn) {
  return profile.values.find((characteristic) => profileCharacteristicKey(characteristic) === column.key)
}

export function ruleProfileSections(profiles: readonly Profile[]) {
  const sections = groupBy(
    profiles.filter((profile) => ['rule', 'other'].includes(datasheetProfileKindOf(profile))),
    (profile) => profile.type,
  )
  return [...sections].map(([title, sectionProfiles]) => ({ title, profiles: sectionProfiles }))
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

export { splitKeywords }

type Ability = { name: string; kind: string }
type Attachment = { kind?: string }

const attachmentRole = (ability: Ability) => ability.name.trim().toLocaleLowerCase()

export function referenceAbilities<T extends Ability>(abilities: readonly T[], attachments: readonly Attachment[]): T[] {
  const roles = new Set(attachments.map(({ kind }) => kind))
  return abilities.filter((ability) => !roles.has(attachmentRole(ability)) || !['datasheet', 'rule'].includes(ability.kind))
}

/** The printed transport rule, unless a TRANSPORT ability already shows it among the abilities. */
export const separateTransport = ({ transport, abilities }: { transport: string | null; abilities: readonly Pick<Ability, 'name'>[] }) =>
  abilities.some((ability) => ability.name.toUpperCase() === 'TRANSPORT') ? null : transport

type AttachmentSheet = Pick<Datasheet, 'attachments' | 'leaders' | 'supporters'>

export function attachmentGroups(sheet: AttachmentSheet) {
  return [
    { title: 'Can lead', relationships: sheet.attachments.filter((entry) => entry.kind === 'leader') },
    { title: 'Can support', relationships: sheet.attachments.filter((entry) => entry.kind === 'support') },
    { title: 'Can be led by', relationships: sheet.leaders },
    { title: 'Can be supported by', relationships: sheet.supporters },
  ].filter(({ relationships }) => relationships.length)
}

export function weaponProfileGroups(weapons: readonly Profile[]) {
  const identified = new Set(
    weapons
      .filter((weapon) => weapon.equipmentName && sameWargear(weapon.equipmentName, weapon.name))
      .map((weapon) => `${weapon.type}/${wargearBaseName(weapon.equipmentName!)}`),
  )
  const groups = groupBy(weapons, (weapon) => {
    const owner = weapon.equipmentName ? wargearBaseName(weapon.equipmentName) : ''
    const base = owner && identified.has(`${weapon.type}/${owner}`) ? owner : wargearBaseName(weapon.name)
    return `${weapon.type}/${weapon.count ?? 1}/${owner}/${base}`
  })
  return [...groups.values()]
}

export function weaponProfileGroupName(profiles: readonly Profile[]) {
  const first = profiles[0]!
  const owner = first.equipmentName
  return wargearBaseName(owner && profiles.some((profile) => sameWargear(owner, profile.name)) ? owner : first.name)
}

export function weaponProfileMode(profile: Profile, profiles: readonly Profile[] = [profile]) {
  const name = profile.name.replace(/^[^\p{L}\p{N}]+/u, '')
  const base = weaponProfileGroupName(profiles)
  const rest = (name.toLocaleLowerCase().startsWith(base) ? name.slice(base.length) : name).trim().replace(/^[-–—]\s*/, '')
  // Only a mode wrapped whole in brackets loses them; an annotation such as "(Tempestor Prime)" keeps its closing one.
  const mode = (/^\(.*\)$/.test(rest) ? rest.slice(1, -1) : rest).trim() || profile.name
  return mode.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase())
}
