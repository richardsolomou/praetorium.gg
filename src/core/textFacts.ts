import type { AttachmentClaim } from './attach'
import type { StatedAllowance } from './battleChoices'
import type { CombatFacts } from './combatReading'
import type { ReminderSuggestion } from './reminders'
import type { UnitGeneration } from './rosterGrades'
import { hasTextTokens, textKey, textTokensIn, withoutText } from './sourceText'

/**
 * What the roster rules read from a rules text, kept beside its token.
 *
 * The server and a reader's device both price and judge rosters, and neither holds a
 * source's words once they are published as tokens. What a rule does comes from the VS
 * Data record its text joins (`vsDataEffects`); the few facts VS Data does not state yet,
 * as a Leader's claims, are read from the words as the token is made (`definitionFactsOf`).
 * Both travel with the data, so both sides answer from the same facts.
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
  /** The abilities the units the player picks as the battle begins gain, which no unit holds until picked. */
  pickedGrants?: PickedGrant[]
  /** A weapon ability the bearer's own unit gains, and one a leader hands the unit it leads. */
  ownWeaponGrant?: GrantedWeaponKeyword
  ledWeaponGrant?: GrantedWeaponKeyword
  invulnerableSave?: string
  /** A text that is a value alone, as the save an ability named for an invulnerable save holds. */
  bareValue?: string
  /** An enhancement that upgrades a weapon it names after "following weapon:". */
  linkedWeapon?: true
  reminder?: ReminderSuggestion
  /** The units the text adds to its army, and the movement it allows, as the roster grades read them. */
  unitGeneration?: UnitGeneration[]
  movementTools?: string[]
  /** What the text allows a unit's battle choices, as a second Order, and the options it offers by their plural, as Orders. */
  battleChoiceAllowances?: StatedAllowance[]
  offeredOptions?: string[]
  /** Wargear the text says the unit has rather than one of its models, as a Plasmacyte, which marks out no model as its bearer. */
  unitHeldWargear?: string[]
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
      /** The attacks the ability is limited to, as "against Psychic Attacks". */
      condition?: string
      /** Applies only under a further condition the rule's summary alone states, as a distance. */
      conditional?: true
    }
  | { name: string; recipient: 'models'; models: string; condition?: string; conditional?: true }
export type AbilityGrantStatement = { matched: boolean; grants: WrittenAbilityGrant[] }
/**
 * An ability a rule gives up to `count` units the player picks as the battle begins, each matching one of `recipients`
 * (any unit where it names none), within `withinInches` of the bearer where the rule says so; `limited` where the rule
 * limits the units further in a way only its text gives.
 */
export type PickedGrant = { ability: string; recipients: string[]; count?: number; withinInches?: number; limited?: true }

/** Lookup by `textKey`; a server may read facts only when asked. */
export type TextFactsByKey = Pick<ReadonlyMap<string, TextFacts>, 'get'>

/** A text's own words, where it has them, and the facts recorded for each token it carries. */
export function statedIn(text: string, facts: TextFactsByKey | undefined) {
  if (!hasTextTokens(text)) return { words: text, recorded: [] }
  return { words: withoutText(text), recorded: textTokensIn(text).flatMap((token) => facts?.get(textKey(token)) ?? []) }
}

/**
 * Where a text's facts are recorded: a lone token's under its key, and a text of several parts, such as a stratagem's
 * sections, under the keys of all its tokens, so the key never carries words printed between them.
 */
export function factsKey(text: string) {
  const tokens = textTokensIn(text)
  return tokens.length === 1 && withoutText(text) === '' ? textKey(tokens[0]!) : `+${tokens.map(textKey).join('+')}`
}

/**
 * Where a text's facts are recorded for the one rule or profile holding it, by its id: only where the rules or profiles
 * holding the same words are records that read differently, as two datasheets printing alike for different rules.
 */
export const heldFactsKey = (key: string, holder: string) => `${key}@${holder}`

/** The text a `heldFactsKey` records facts for, or the key itself. */
export const textOfFactsKey = (key: string) => key.split('@')[0]!

/**
 * What one text says, read from its words or, where it holds tokens, from the facts recorded for it: for the rule or
 * profile `holder` where the text's facts are recorded for it alone. Unrecorded, it says nothing.
 */
export function readText<T>(
  text: string,
  facts: TextFactsByKey | undefined,
  read: (words: string) => T,
  recorded: (facts: TextFacts) => T,
  holder?: string,
): T {
  if (!hasTextTokens(text)) return read(text)
  const key = factsKey(text)
  return recorded((holder === undefined ? undefined : facts?.get(heldFactsKey(key, holder))) ?? facts?.get(key) ?? {})
}
