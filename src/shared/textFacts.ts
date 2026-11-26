import { bracketedRuleReferences } from '../core/ruleReference'
import { attachmentClaim, substitutedUnits } from '../core/attach'
import { unitHeldWargearIn } from '../core/modelLines'
import { readText, statedIn, type TextFacts, type TextFactsByKey } from '../core/textFacts'

/**
 * The facts a card text states that VS Data does not state yet: the units its Strategic Reserves exemption names, the
 * wargear it says the unit holds, and the rules it marks out, which a datasheet lists beside it (#2007). Everything else a
 * text does is VS Data's (`vsDataEffects`).
 */
export function textFactsOf(words: string): TextFacts | null {
  const reserveSelectors = strategicReserveExemptionSelectors(words)
  const references = referencedRuleNames(words)
  const unitHeld = unitHeldWargearIn(words)
  const facts: TextFacts = {
    ...(reserveSelectors.length ? { reserveSelectors } : {}),
    ...(grantsStrategicReserveExemption(words) ? { reserveExemption: true as const } : {}),
    ...(references.length ? { references } : {}),
    ...(unitHeld.length ? { unitHeldWargear: unitHeld } : {}),
  }
  return Object.keys(facts).length ? facts : null
}

/** A catalogue text's facts VS Data does not state yet: those every text records, its Leader claims, and a bare save. */
export function definitionFactsOf(words: string): TextFacts {
  const attachment = attachmentClaim(words)
  const substitutes = substitutedUnits(words)
  const bareValue = /^\s*(\d+\+)\s*$/.exec(words)?.[1]
  return {
    ...textFactsOf(words),
    ...(attachment ? { attachment } : {}),
    ...(substitutes.length ? { substitutes } : {}),
    ...(bareValue ? { bareValue } : {}),
  }
}

/** The units a text adds to its army and the movement it allows, as its recorded facts state them. */
export function gradeReadingsIn(text: string, facts: TextFactsByKey | undefined) {
  const found = readText(
    text,
    facts,
    () => undefined,
    (recorded) => recorded,
  )
  return { unitGeneration: found?.unitGeneration ?? [], movementTools: found?.movementTools ?? [] }
}

const NO_GRANTS = { matched: false, grants: [] }

export const abilityGrantsIn = (text: string, facts: TextFactsByKey | undefined) =>
  readText(
    text,
    facts,
    () => NO_GRANTS,
    (found) => found.abilityGrants ?? NO_GRANTS,
  )

/** The grants an ability's words state once normalised, as deployment abilities are compared. */
export const normalizedAbilityGrantsIn = (text: string, facts: TextFactsByKey | undefined) =>
  readText(
    text,
    facts,
    () => NO_GRANTS,
    (found) => found.normalizedAbilityGrants ?? found.abilityGrants ?? NO_GRANTS,
  )

export const ownWeaponGrantOf = (text: string, facts: TextFactsByKey | undefined) =>
  readText(
    text,
    facts,
    () => null,
    (found) => found.ownWeaponGrant ?? null,
  )

export const ledWeaponGrantOf = (text: string, facts: TextFactsByKey | undefined) =>
  readText(
    text,
    facts,
    () => null,
    (found) => found.ledWeaponGrant ?? null,
  )

export const invulnerableSaveOf = (text: string, facts: TextFactsByKey | undefined) =>
  readText(
    text,
    facts,
    () => null,
    (found) => found.invulnerableSave ?? null,
  )

export const bareValueOf = (text: string, facts: TextFactsByKey | undefined) =>
  readText(
    text,
    facts,
    (words) => /^\s*(\d+\+)\s*$/.exec(words)?.[1] ?? null,
    (found) => found.bareValue ?? null,
  )

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
    () => false,
    (found) => Boolean(found.linkedWeapon),
  )

export function weaponGrantsIn(text: string | null, facts?: TextFactsByKey) {
  if (!text) return []
  return statedIn(text, facts).recorded.flatMap((fact) => fact.weaponGrants ?? [])
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

/** What a text allows a unit's battle choices, recorded for each token it holds. */
export const allowancesIn = (text: string, facts?: TextFactsByKey) =>
  statedIn(text, facts).recorded.flatMap((fact) => fact.battleChoiceAllowances ?? [])

/** The options a rule's text offers by their plural, recorded for each token it holds. */
export const offeredOptionsOf = (text: string, facts?: TextFactsByKey) =>
  statedIn(text, facts).recorded.flatMap((fact) => fact.offeredOptions ?? [])
