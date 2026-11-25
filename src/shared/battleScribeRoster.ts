import { type CatalogueIndex, type Definition, type Profile as CatalogueProfile, resolve } from '../core/catalogue'
import { fieldedCount } from '../core/collective'
import type { Datasheet, DatasheetCharacteristicKind } from '../core/datasheet'
import { datasheetCharacteristicKindOf } from '../core/datasheetStructure'
import type { Selection } from '../core/evaluate'
import type { RosterPick } from '../core/roster'
import { textNickname } from '../core/textRoster'
import { datasheetViewsIn } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { describeDatasheetAbilities } from './datasheetDescriptions'
import { rosterDatasheetContext, rosterDatasheetSelections } from './rosterDatasheetContext'
import type { LoadedRules } from './rules'

/**
 * A list as the BattleScribe `.ros` XML that New Recruit writes and Yellowscribe reads into Tabletop Simulator: each
 * unit's selection tree as the catalogue built it, with its keywords as categories, its model and weapon profiles as
 * the builder evaluates them, and its abilities.
 *
 * Ability descriptions stay text tokens, so the file carries no rules text until the reader's device swaps them for
 * words it has loaded.
 */
export function battleScribeRoster(
  data: { name: string; catalogueId: string; detachmentIds: string[]; units: RosterPick[] },
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  priced: { points: number; units: readonly { key: number; points: number }[] },
) {
  const { index } = loaded
  const roster = { catalogueId: data.catalogueId, detachmentIds: data.detachmentIds, picks: data.units }
  const prepared = rosterDatasheetSelections(loaded, roster)
  const units = priced.units.flatMap((unit) => {
    const pick = data.units[unit.key]
    const context = rosterDatasheetContext(loaded, { ...roster, pickIndex: unit.key }, prepared)
    if (!pick || !context) return []
    const catalogueId = pick.catalogueId ?? data.catalogueId
    const sheet = describeDatasheetAbilities(
      loaded,
      catalogueId,
      datasheetViewsIn(loaded, catalogueId, pick.entryId, context).selected,
      rules,
    )
    const selection = context.selections[context.unitSelectionIndex]
    return sheet && selection ? [unitXml(selection, sheet, unit.points, textNickname(pick.nickname ?? ''), index)] : []
  })
  const gameSystem = [...index.catalogues.values()].find((catalogue) => catalogue.gameSystem)
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<roster id="${id(data.name)}" name="${escape(data.name)}" battleScribeVersion="2.03" generatedBy="https://praetorium.gg"` +
      ` gameSystemId="${escape(gameSystem?.id ?? '')}" gameSystemName="${escape(gameSystem?.name ?? '')}"` +
      ' xmlns="http://www.battlescribe.net/schema/rosterSchema">',
    costXml(priced.points, index),
    `<forces><force id="${id(`${data.name}/force`)}" name="Army Roster" entryId="force" catalogueId="${escape(data.catalogueId)}"` +
      ` catalogueName="${escape(index.catalogues.get(data.catalogueId)?.name ?? '')}">`,
    `<selections>${units.join('')}</selections>`,
    '</force></forces>',
    '</roster>',
  ].join('\n')
}

type Profile = Datasheet['profiles'][number]

/** The characteristic names BattleScribe's 40k data prints, which tools reading `.ros` match exactly. */
const CHARACTERISTIC: Partial<Record<DatasheetCharacteristicKind, string>> = {
  movement: 'M',
  toughness: 'T',
  save: 'SV',
  wounds: 'W',
  leadership: 'LD',
  'objective-control': 'OC',
  'invulnerable-save': 'InSv',
  range: 'Range',
  attacks: 'A',
  'ballistic-skill': 'BS',
  'weapon-skill': 'WS',
  strength: 'S',
  'armour-penetration': 'AP',
  damage: 'D',
  keywords: 'Keywords',
}
const PRINTED_TYPES = new Set(['Unit', 'Ranged Weapons', 'Melee Weapons'])

function unitXml(selection: Selection, sheet: Datasheet, points: number, nickname: string | undefined, index: CatalogueIndex) {
  const shown = sheet.profiles.filter((profile) => PRINTED_TYPES.has(profile.type))
  const printed = new Map(shown.map((profile) => [profile.id, profile]))
  const printedByName = new Map(shown.map((profile) => [profileKey(profile.type, profile.name), profile]))
  const placed = new Set<string>()
  // What a choice carries comes from the evaluated sheet, so a stat a rule changes is printed changed. The sheet keeps one
  // of several identical profiles, as two Tomb Crawler options' twin gauss reapers, so another's is found by its name;
  // it also leaves out some a second kind of model carries, as a Cyber-mastiff's bite, which print as the catalogue has them.
  const profilesOf = (definition: Definition) =>
    profilesIn(definition, index).flatMap((raw) => {
      const profile =
        printed.get(raw.id) ??
        (raw.name && raw.typeName ? printedByName.get(profileKey(raw.typeName, raw.name)) : undefined) ??
        unevaluated(raw)
      if (!profile) return []
      placed.add(profile.id)
      return [statProfileXml(profile)]
    })
  // BattleScribe numbers a choice by the unit's total and writes no groups, so a group's choices sit under its holder.
  const children = (node: Selection, carried: number): string[] => {
    const holder = index.definitions.get(node.id)
    return (node.selections ?? []).flatMap((child) => {
      const definition = index.definitions.get(child.id)
      const count = fieldedCount(definition, holder, index, child.count ?? 1, carried)
      const type = definition && resolve(definition, index).type
      if (!definition || !type) return children(child, count)
      if (count < 1) return []
      return [
        selectionXml({ entryId: child.id, definition, number: count, type }, index, profilesOf(definition), [], children(child, count)),
      ]
    })
  }
  const root = index.definitions.get(selection.id)!
  const own = profilesOf(root)
  const nested = children(selection, 1)
  // A statline no model choice carries, such as the one most squads keep on the unit, is the unit's.
  const unplaced = [...printed.values()].filter((profile) => profile.type === 'Unit' && !placed.has(profile.id)).map(statProfileXml)
  const abilities = [...sheet.abilities, ...(sheet.enhancements ?? [])]
  const isShared = (ability: Datasheet['abilities'][number]) => ability.kind === 'core' || ability.kind === 'faction'
  const described = abilities
    .filter((ability) => !isShared(ability))
    .map((ability) => profileXml(ability.id, ability.name, 'Abilities', [{ name: 'Description', value: ability.description ?? '' }]))
  const shared = abilities.filter(isShared)
  return selectionXml(
    { entryId: selection.id, definition: root, number: 1, type: resolve(root, index).type ?? 'unit', customName: nickname },
    index,
    [...unplaced, ...own, ...described],
    [
      shared.length
        ? `<rules>${shared.map((rule) => `<rule id="${escape(rule.id)}" name="${escape(rule.name)}" hidden="false"><description>${escape(rule.description ?? '')}</description></rule>`).join('')}</rules>`
        : '',
      `<categories>${sheet.keywords.map((keyword) => `<category id="${id(keyword)}" name="${escape(keyword)}" entryId="${id(keyword)}" primary="false"/>`).join('')}</categories>`,
      costXml(points, index),
    ],
    nested,
  )
}

function selectionXml(
  {
    entryId,
    definition,
    number,
    type,
    customName,
  }: { entryId: string; definition: Definition; number: number; type: string; customName?: string },
  index: CatalogueIndex,
  profiles: readonly string[],
  details: readonly string[],
  children: readonly string[],
) {
  const name = resolve(definition, index).name ?? definition.name ?? entryId
  return [
    `<selection id="${id(`${entryId}/${children.length}/${number}`)}" name="${escape(name)}" entryId="${escape(entryId)}" number="${number}" type="${escape(type)}"`,
    customName ? ` customName="${escape(customName)}"` : '',
    '>',
    profiles.length ? `<profiles>${profiles.join('')}</profiles>` : '',
    ...details,
    children.length ? `<selections>${children.join('')}</selections>` : '',
    '</selection>',
  ].join('')
}

const costXml = (points: number, index: CatalogueIndex) =>
  `<costs><cost name="pts" typeId="${escape(index.pointsTypeId)}" value="${points}"/></costs>`

function statProfileXml(profile: Profile) {
  const values = profile.values.map((value) => ({
    name: CHARACTERISTIC[datasheetCharacteristicKindOf(value)] ?? value.name,
    value: value.value,
  }))
  // BattleScribe writes a weapon without keywords as "-", and readers expect the characteristic to be there.
  if (profile.type !== 'Unit' && !values.some((value) => value.name === 'Keywords')) values.push({ name: 'Keywords', value: '-' })
  return profileXml(profile.id, profile.name, profile.type, values)
}

function profileXml(profileId: string, name: string, typeName: string, values: readonly { name: string; value: string }[]) {
  return (
    `<profile id="${escape(profileId)}" name="${escape(name)}" hidden="false" typeName="${escape(typeName)}"><characteristics>` +
    values.map((value) => `<characteristic name="${escape(value.name)}">${escape(value.value)}</characteristic>`).join('') +
    '</characteristics></profile>'
  )
}

const profileKey = (type: string, name: string) => `${type}\0${name.toLowerCase()}`

/** The profiles an entry and the link to it write or link, which BattleScribe hangs off the selection. */
/** A catalogue profile as it stands before any rule changes it, for one the evaluated sheet does not print. */
function unevaluated(profile: CatalogueProfile): Profile | undefined {
  if (!profile.name || !profile.typeName || !PRINTED_TYPES.has(profile.typeName) || profile.hidden || !profile.characteristics)
    return undefined
  const values = profile.characteristics.flatMap((value) => (value.name && value.$text ? [{ name: value.name, value: value.$text }] : []))
  return { id: profile.id, name: profile.name, type: profile.typeName, values }
}

function profilesIn(definition: Definition, index: CatalogueIndex) {
  const profiles = new Map<string, CatalogueProfile>()
  for (const holder of new Set([definition, resolve(definition, index)])) {
    for (const group of [holder, ...(holder.infoGroups ?? [])]) {
      for (const profile of group.profiles ?? []) profiles.set(profile.id, profile)
      for (const link of group.infoLinks ?? []) {
        const linked = link.type === 'profile' ? index.shared.get(link.targetId) : undefined
        if (link.type === 'profile') profiles.set(link.targetId, linked && 'typeName' in linked ? linked : { id: link.targetId })
      }
    }
  }
  return [...profiles.values()]
}

/** An identifier from a seed; nothing reads it back, but BattleScribe readers expect one on every element. */
const id = (seed: string) =>
  Array.from(seed)
    .reduce((hash, character) => (hash * 31 + character.codePointAt(0)!) % 0xffffffff, 7)
    .toString(16)
    .padStart(8, '0')

const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
