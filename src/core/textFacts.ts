import type { AttachmentClaim } from './attach'
import type { CombatFacts } from './combatReading'
import type { ReminderSuggestion } from './reminders'
import type { UnitGeneration } from './rosterGrades'
import { hasTextTokens, textKey, textTokensIn, withoutText } from './sourceText'

/**
 * What the roster rules read from a rules text, kept beside its token.
 *
 * The server and a reader's device both price and judge rosters, and neither holds a
 * source's words once they are published as tokens. So whatever the rules read from
 * a text is read once, from the words, as the token is made, and travels with the
 * data: both sides then answer from the same facts, text loaded or not. Every text
 * records what any rule reads of it; the catalogue's own texts record the rest too.
 */
export type TextFacts = {
  weaponGrants?: WeaponAbilityGrant[]
  reserveSelectors?: string[]
  reserveExemption?: true
  references?: string[]
  attachment?: AttachmentClaim
  /** The units a Leader may join through this unit instead, by the name the text gives them. */
  substitutes?: string[]
  /** The ability grants the text's words state, and those its normalised words state where they read differently. */
  abilityGrants?: AbilityGrantStatement
  normalizedAbilityGrants?: AbilityGrantStatement
  /** A weapon ability the bearer's own unit gains, and one a leader hands the unit it leads. */
  ownWeaponGrant?: GrantedWeaponKeyword
  ledWeaponGrant?: GrantedWeaponKeyword
  invulnerableSave?: string
  /** An enhancement that upgrades a weapon it names after "following weapon:". */
  linkedWeapon?: true
  reminder?: ReminderSuggestion
  /** The units the text adds to its army, and the movement it allows, as the roster grades read them. */
  unitGeneration?: UnitGeneration[]
  movementTools?: string[]
  /** Null where the words take no part in combat. */
  combat?: CombatFacts | null
}

export type WeaponAbilityGrant = { keyword: string; recipients: string; exclusions?: string; profileTypes: string[] }
export type GrantedWeaponKeyword = { keyword: string; profileTypes: string[] }

/** One ability a text grants, as written: the context it holds in decides whether it applies. */
export type WrittenAbilityGrant =
  | {
      written: string
      recipient: 'bearer' | 'leader' | 'unit'
      /** A deployment ability the text names outright, which applies even where the unit links no such rule. */
      explicit?: true
      /** Applies only while the model is attached. */
      attached?: true
      /** Applies only when the counterpart unit answers to this description. */
      target?: string
      /** Applies only when the unit links the named ability, or may use unlinked deployment abilities. */
      linked?: true
    }
  | { name: string; recipient: 'models'; models: string }
export type AbilityGrantStatement = { matched: boolean; grants: WrittenAbilityGrant[] }

/** Lookup by `textKey`; a server may read facts only when asked. */
export type TextFactsByKey = Pick<ReadonlyMap<string, TextFacts>, 'get'>

/** A text's own words, where it has them, and the facts recorded for each token it carries. */
export function statedIn(text: string, facts: TextFactsByKey | undefined) {
  if (!hasTextTokens(text)) return { words: text, recorded: [] }
  return { words: withoutText(text), recorded: textTokensIn(text).flatMap((token) => facts?.get(textKey(token)) ?? []) }
}

/**
 * What one text says, read from its words or, where it is a token, from the facts recorded for it.
 * A token without facts, or a text of several, says nothing.
 */
export function readText<T>(
  text: string,
  facts: TextFactsByKey | undefined,
  read: (words: string) => T,
  recorded: (facts: TextFacts) => T,
): T {
  if (!hasTextTokens(text)) return read(text)
  const [token, ...rest] = textTokensIn(text)
  const found = token && !rest.length && withoutText(text) === '' ? facts?.get(textKey(token)) : undefined
  return recorded(found ?? {})
}
