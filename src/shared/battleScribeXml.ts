import type { Datasheet } from '../core/datasheet'
import { legacyBattleScribeSchema } from '../core/legacyIds'
import rawBattleScribe from '../../catalogue/legacy-ids/battlescribe.json' with { type: 'json' }

const BATTLESCRIBE = legacyBattleScribeSchema.parse(rawBattleScribe)

/** An ability as the sheet describes it, its description a text token. */
export type RosterAbility = Datasheet['abilities'][number]

/** The roster around its units' selections, naming the BSData game system Yellowscribe picks its reader by. */
export function rosterXml(roster: { name: string; catalogueId: string; catalogueName: string; points: number; units: readonly string[] }) {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<roster id="${id(roster.name)}" name="${escape(roster.name)}" battleScribeVersion="2.03" generatedBy="https://praetorium.gg"` +
      ` gameSystemId="${escape(BATTLESCRIBE.gameSystem.id)}" gameSystemName="${escape(BATTLESCRIBE.gameSystem.name)}"` +
      ' xmlns="http://www.battlescribe.net/schema/rosterSchema">',
    costXml(roster.points),
    `<forces><force id="${id(`${roster.name}/force`)}" name="Army Roster" entryId="force" catalogueId="${escape(roster.catalogueId)}"` +
      ` catalogueName="${escape(roster.catalogueName)}">`,
    `<selections>${roster.units.join('')}</selections>`,
    '</force></forces>',
    '</roster>',
  ].join('\n')
}

/** A unit's own abilities as profiles, and its core and faction abilities as rules, which readers print once for the army. */
export function abilitiesXml(abilities: readonly RosterAbility[]) {
  const isShared = (ability: RosterAbility) => ability.kind === 'core' || ability.kind === 'faction'
  const shared = abilities.filter(isShared)
  return {
    profiles: abilities
      .filter((ability) => !isShared(ability))
      .map((ability) => profileXml(ability.id, ability.name, 'Abilities', [{ name: 'Description', value: ability.description ?? '' }])),
    rules: shared.length
      ? `<rules>${shared.map((rule) => `<rule id="${escape(rule.id)}" name="${escape(rule.name)}" hidden="false"><description>${escape(rule.description ?? '')}</description></rule>`).join('')}</rules>`
      : '',
  }
}

export const categoriesXml = (keywords: readonly string[]) =>
  `<categories>${keywords.map((keyword) => `<category id="${id(keyword)}" name="${escape(keyword)}" entryId="${id(keyword)}" primary="false"/>`).join('')}</categories>`

export function selectionXml(
  { entryId, name, number, type, customName }: { entryId: string; name: string; number: number; type: string; customName?: string },
  profiles: readonly string[],
  details: readonly string[],
  children: readonly string[],
) {
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

export const costXml = (points: number) =>
  `<costs><cost name="pts" typeId="${escape(BATTLESCRIBE.pointsTypeId)}" value="${points}"/></costs>`

export function profileXml(profileId: string, name: string, typeName: string, values: readonly { name: string; value: string }[]) {
  return (
    `<profile id="${escape(profileId)}" name="${escape(name)}" hidden="false" typeName="${escape(typeName)}"><characteristics>` +
    values.map((value) => `<characteristic name="${escape(value.name)}">${escape(value.value)}</characteristic>`).join('') +
    '</characteristics></profile>'
  )
}

/** An identifier from a seed; nothing reads it back, but BattleScribe readers expect one on every element. */
export const id = (seed: string) =>
  Array.from(seed)
    .reduce((hash, character) => (hash * 31 + character.codePointAt(0)!) % 0xffffffff, 7)
    .toString(16)
    .padStart(8, '0')

export const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
