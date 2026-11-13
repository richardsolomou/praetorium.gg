import { bracketedRuleReferences } from '../core/ruleReference'
import { attachmentClaim, substitutedUnits } from '../core/attach'
import { combatFactsOf } from '../core/combatReading'
import { hasTextTokens, textKey, textTokensIn, withoutText } from '../core/sourceText'
import { movementToolsFrom, unitGenerationFrom } from './rosterGradeUtility'
import { suggestReminderTimings, suggestReminderWhileDestroyed } from '../core/reminders'
import { readText, statedIn, type TextFacts, type TextFactsByKey, type WeaponAbilityGrant } from '../core/textFacts'
import {
  abilityGrantStatement,
  invulnerableSaveIn,
  ledWeaponGrantIn,
  normalizedAbilityText,
  ownWeaponGrantIn,
  titleCaseAbility,
  weaponProfileTypes,
} from './catalogueAbilityGrants'

/** The facts one source text states, with nothing kept for a text that states none. */
export function textFactsOf(words: string): TextFacts | null {
  const weaponGrants = unconditionalWeaponAbilityGrants(words)
  const reserveSelectors = strategicReserveExemptionSelectors(words)
  const references = referencedRuleNames(words)
  const facts: TextFacts = {
    ...(weaponGrants.length ? { weaponGrants } : {}),
    ...(reserveSelectors.length ? { reserveSelectors } : {}),
    ...(grantsStrategicReserveExemption(words) ? { reserveExemption: true as const } : {}),
    ...(references.length ? { references } : {}),
  }
  return Object.keys(facts).length ? facts : null
}

/**
 * The facts a catalogue text states: those every text records, and what the catalogue's own readers take
 * from its abilities and rules. `combat` is read only when asked, as it reads the words for every placement.
 */
export function definitionFactsOf(words: string): TextFacts {
  const grants = abilityGrantStatement(words)
  const normalizedGrants = abilityGrantStatement(normalizedAbilityText(words))
  const attachment = attachmentClaim(words)
  const substitutes = substitutedUnits(words)
  const ownWeaponGrant = ownWeaponGrantIn(words)
  const ledWeaponGrant = ledWeaponGrantIn(words)
  const invulnerableSave = invulnerableSaveIn(words)
  const timings = suggestReminderTimings(words)
  const whileDestroyed = suggestReminderWhileDestroyed(words)
  const unitGeneration = unitGenerationFrom(words)
  const movementTools = movementToolsFrom(words)
  const stated = (statement: typeof grants) => statement.matched || statement.grants.length > 0
  const facts: TextFacts = {
    ...textFactsOf(words),
    ...(attachment ? { attachment } : {}),
    ...(substitutes.length ? { substitutes } : {}),
    ...(stated(grants) ? { abilityGrants: grants } : {}),
    ...(JSON.stringify(normalizedGrants) !== JSON.stringify(grants) ? { normalizedAbilityGrants: normalizedGrants } : {}),
    ...(ownWeaponGrant ? { ownWeaponGrant } : {}),
    ...(ledWeaponGrant ? { ledWeaponGrant } : {}),
    ...(invulnerableSave ? { invulnerableSave } : {}),
    ...(/following weapon:\s*$/i.test(words) ? { linkedWeapon: true as const } : {}),
    ...(timings.length || whileDestroyed ? { reminder: { timings, ...(whileDestroyed ? { whileDestroyed: true as const } : {}) } } : {}),
    ...(unitGeneration.length ? { unitGeneration } : {}),
    ...(movementTools.length ? { movementTools } : {}),
  }
  let combat: TextFacts['combat']
  return Object.defineProperty(facts, 'combat', {
    enumerable: true,
    get: () => (combat === undefined ? (combat = combatFactsOf(words)) : combat),
  })
}

/**
 * The units a text adds to its army and the movement it allows: recorded where the catalogue read the text, so a
 * card printing the rule in other words answers alike, and read from the words of any other text it holds.
 */
export function gradeReadingsIn(text: string, facts: TextFactsByKey | undefined, words: (text: string) => string | null) {
  const [token, ...rest] = textTokensIn(text)
  const found = token && !rest.length && withoutText(text) === '' ? facts?.get(textKey(token)) : undefined
  // Only the catalogue records combat for its texts, the cards never do.
  if (found && 'combat' in found) return { unitGeneration: found.unitGeneration ?? [], movementTools: found.movementTools ?? [] }
  const read = hasTextTokens(text) ? (words(text) ?? '') : text
  return { unitGeneration: unitGenerationFrom(read), movementTools: movementToolsFrom(read) }
}

export const abilityGrantsIn = (text: string, facts: TextFactsByKey | undefined) =>
  readText(text, facts, abilityGrantStatement, (found) => found.abilityGrants ?? { matched: false, grants: [] })

/** The grants an ability's words state once normalised, as deployment abilities are compared. */
export const normalizedAbilityGrantsIn = (text: string, facts: TextFactsByKey | undefined) =>
  readText(
    text,
    facts,
    (words) => abilityGrantStatement(normalizedAbilityText(words)),
    (found) => found.normalizedAbilityGrants ?? found.abilityGrants ?? { matched: false, grants: [] },
  )

export const ownWeaponGrantOf = (text: string, facts: TextFactsByKey | undefined) =>
  readText(text, facts, ownWeaponGrantIn, (found) => found.ownWeaponGrant ?? null)

export const ledWeaponGrantOf = (text: string, facts: TextFactsByKey | undefined) =>
  readText(text, facts, ledWeaponGrantIn, (found) => found.ledWeaponGrant ?? null)

export const invulnerableSaveOf = (text: string, facts: TextFactsByKey | undefined) =>
  readText(text, facts, invulnerableSaveIn, (found) => found.invulnerableSave ?? null)

/** A catalogue text's combat facts, null where its words take no part; undefined for words, and tokens the catalogue records none for. */
export const combatFactsIn = (text: string, facts: TextFactsByKey | undefined) =>
  readText<TextFacts['combat']>(
    text,
    facts,
    () => undefined,
    (found) => found.combat,
  )

/** What a token's words suggest for a reminder, where they suggest anything. */
export const reminderIn = (text: string, facts: TextFactsByKey | undefined) =>
  readText<TextFacts['reminder']>(
    text,
    facts,
    () => undefined,
    (found) => found.reminder,
  )

export const linksWeapon = (text: string, facts: TextFactsByKey | undefined) =>
  readText(
    text,
    facts,
    (words) => /following weapon:\s*$/i.test(words),
    (found) => Boolean(found.linkedWeapon),
  )

export function weaponGrantsIn(text: string | null, facts?: TextFactsByKey) {
  if (!text) return []
  const { words, recorded } = statedIn(text, facts)
  return [...recorded.flatMap((fact) => fact.weaponGrants ?? []), ...unconditionalWeaponAbilityGrants(words)]
}

export function reserveSelectorsIn(texts: readonly (string | null)[], facts?: TextFactsByKey) {
  return texts.flatMap((text) => {
    if (!text) return []
    const { words, recorded } = statedIn(text, facts)
    return [...recorded.flatMap((fact) => fact.reserveSelectors ?? []), ...strategicReserveExemptionSelectors(words)]
  })
}

export function grantsReserveExemptionIn(text: string | null, facts?: TextFactsByKey) {
  if (!text) return false
  const { words, recorded } = statedIn(text, facts)
  return recorded.some((fact) => fact.reserveExemption) || grantsStrategicReserveExemption(words)
}

export function referencesIn(texts: readonly (string | null)[], facts?: TextFactsByKey) {
  return texts.flatMap((text) => {
    if (!text) return []
    const { words, recorded } = statedIn(text, facts)
    return [...recorded.flatMap((fact) => fact.references ?? []), ...referencedRuleNames(words)]
  })
}

function unconditionalWeaponAbilityGrants(description: string): WeaponAbilityGrant[] {
  const grants: WeaponAbilityGrant[] = []
  const pattern =
    /(?:^|[.!?]\s+)(?:[-■]\s*)?(?:In addition,\s+)?(?:(ranged|melee)\s+)?weapons equipped by (.+?) models(?: \((?:excluding|except) (.+?) models\))? from your army have the \[([^\]]+)\] ability(?=[.,]|$)/giu
  const normalized = description.normalize('NFKC').replaceAll(/\^\^|\*\*/g, '')
  for (const match of normalized.matchAll(pattern)) {
    grants.push({
      keyword: titleCaseAbility(match[4]!),
      recipients: match[2]!,
      ...(match[3] ? { exclusions: match[3] } : {}),
      profileTypes: weaponProfileTypes(match[1]),
    })
  }
  return grants
}

const normalizedRuleText = (description: string) =>
  description
    .normalize('NFKC')
    .replaceAll(/\*\*|<\/?[bkiu]>/giu, '')
    .replaceAll(/\s+/g, ' ')
    .trim()

function strategicReserveExemptionSelectors(description: string): string[] {
  const matches = normalizedRuleText(description).matchAll(
    /friendly (.+?) units do not count towards the combined points value of your strategic reserves units/giu,
  )
  return [...matches].flatMap((match) => (match[1] ? [match[1]] : []))
}

function grantsStrategicReserveExemption(description: string): boolean {
  return /points value does not count towards the combined points (?:value|limit).+strategic reserves?/iu.test(
    normalizedRuleText(description),
  )
}

/** The rule names a text marks out: in bold, between carets, or in brackets. */
function referencedRuleNames(text: string): string[] {
  return [
    ...[...text.matchAll(/\*\*(.*?)\*\*|\^\^(.*?)\^\^/g)].flatMap((match) => {
      const name = (match[1] ?? match[2] ?? '').replaceAll(/\*\*|\^\^/g, '')
      return name ? [name] : []
    }),
    ...bracketedRuleReferences(text).filter((name): name is string => Boolean(name)),
  ]
}
