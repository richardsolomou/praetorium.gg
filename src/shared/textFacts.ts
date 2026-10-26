import { bracketedRuleReferences } from '../core/ruleReference'
import { titleCaseAbility, weaponProfileTypes } from './catalogueAbilityGrants'
import { hasTextTokens, textKey, textTokensIn, withoutText } from './sourceText'

/**
 * What the roster rules read from a rules text, kept beside its token.
 *
 * The server and a reader's device both price and judge rosters, and neither holds a
 * Game Datacards text once it is published as a token. So whatever the rules read from
 * such a text is read once, from the source's words, as the token is made, and travels
 * with the data: both sides then answer from the same facts, text loaded or not.
 */
export type TextFacts = {
  weaponGrants?: WeaponAbilityGrant[]
  reserveSelectors?: string[]
  reserveExemption?: true
  references?: string[]
}
type WeaponAbilityGrant = { keyword: string; recipients: string; exclusions?: string; profileTypes: string[] }

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

export type TextFactsByKey = ReadonlyMap<string, TextFacts>

/** A text's own words, where it has them, and the facts recorded for each token it carries. */
function statedIn(text: string, facts: TextFactsByKey | undefined) {
  if (!hasTextTokens(text)) return { words: text, recorded: [] }
  return { words: withoutText(text), recorded: textTokensIn(text).flatMap((token) => facts?.get(textKey(token)) ?? []) }
}

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
