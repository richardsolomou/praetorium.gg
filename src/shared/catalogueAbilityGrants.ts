import { normalizeRuleReference, ruleReferenceMatches } from '../core/ruleReference'
import { escapeRegExp } from '../core/text'
import type { AbilityGrantStatement, GrantedWeaponKeyword, WrittenAbilityGrant } from '../core/textFacts'

type AbilityGrant = { name: string; recipient: 'bearer' | 'leader' | 'unit' | 'models'; models?: string }

/** Exact catalogue phrases that grant a named ability to a bearer or every model in its unit. */
export function parseAbilityGrants(
  description: string | AbilityGrantStatement | null | undefined,
  attached: boolean,
  linkedAbilities: readonly string[],
  allowUnlinkedDeployment: boolean,
  counterpartReferences: readonly string[] = [],
): { matched: boolean; grants: AbilityGrant[] } {
  const statement = typeof description === 'string' ? abilityGrantStatement(description) : (description ?? NO_GRANTS)
  const linked = (written: string) =>
    linkedAbilities.some((name) => ruleReferenceMatches(written, name) || ruleReferenceMatches(name, written))
  const mayUseUnlinked = (written: string) => !deploymentAbilities(written).length || allowUnlinkedDeployment || linked(written)
  const grant = (written: string, recipient: Exclude<AbilityGrant['recipient'], 'models'>, explicitDeployment = false) => {
    // An invulnerable save is a characteristic the save collectors read, never a named ability.
    if (/\binvulnerable save\b/iu.test(written)) return []
    const matched = linkedAbilities.filter((name) => ruleReferenceMatches(written, name) || ruleReferenceMatches(name, written))
    const listed = listedAbilities(written, linkedAbilities)
    const explicit = explicitDeployment ? (normalizeAbilityText(written).match(DEPLOYMENT_ABILITIES) ?? []) : []
    if (!listed.length && !explicit.length && mentionsDeploymentAbility(written)) return []
    const names = [...new Set([...matched, ...listed, ...explicit])]
    if (!names.length) names.push(...(linkedAbilities.length === 1 ? linkedAbilities : [written]))
    return names.filter((name) => explicitDeployment || mayUseUnlinked(name)).map((name) => ({ name: titleCaseAbility(name), recipient }))
  }
  return {
    matched: statement.matched,
    grants: statement.grants.flatMap((written): AbilityGrant[] => {
      if (written.recipient === 'models') return [written]
      if (written.attached && !attached) return []
      if (written.target !== undefined && !attachmentTargetMatches(written.target, counterpartReferences)) return []
      if (written.linked && !allowUnlinkedDeployment && !linked(written.written)) return []
      return grant(written.written, written.recipient, written.explicit)
    }),
  }
}

const NO_GRANTS: AbilityGrantStatement = { matched: false, grants: [] }

/** The grants a text's words state, each with the context it needs to apply, before any unit's context is known. */
export function abilityGrantStatement(description: string): AbilityGrantStatement {
  if (!description) return NO_GRANTS
  const paragraphs = description.split(/\n\s*\n/u)
  const rule = paragraphs[1]?.trim()
  const staticDeploymentRule =
    paragraphs.length === 2 &&
    !/\b(?:if|when|while|during|until|unless|unit|model|bearer|phase|weapon|wound|roll|battle)\b/iu.test(paragraphs[0]!) &&
    STATIC_DEPLOYMENT_RULE.test(rule ?? '')
  const prose = normalizeAbilityText((staticDeploymentRule ? rule! : description).replaceAll(/\^\^|\*/g, ''))
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/\babilty\b/giu, 'ability')
    .replaceAll(/\bModel's in\b/gu, 'Models in')
  type Written = Extract<WrittenAbilityGrant, { written: string }>
  const stated = (grants: WrittenAbilityGrant[]): AbilityGrantStatement => ({ matched: true, grants })
  const as = (written: string, recipient: Written['recipient'], context: Omit<Written, 'written' | 'recipient'> = {}): Written => ({
    written,
    recipient,
    ...context,
  })
  const conditionalBearerGrants = [
    ...prose.matchAll(
      /\bIf this model is attached to (?:an? )?([^,.\n]{1,160}?) during the Declare Battle Formations step, (?:it gains|this model has) (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)\./giu,
    ),
  ]
  if (conditionalBearerGrants.length)
    return stated(conditionalBearerGrants.map((match) => as(match[2]!, 'bearer', { explicit: true, attached: true, target: match[1]! })))
  const attachedLeaderGrant = prose.match(
    /\bIf this unit has a Leader unit attached to it during the Declare Battle Formations step, that Leader unit gains (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)\./iu,
  )
  if (attachedLeaderGrant) return stated([as(attachedLeaderGrant[1]!, 'leader', { explicit: true, attached: true })])
  const namedAttachedModelGrant = prose.match(
    /\bIf (?:an?|one or more) ([^,.\n]{1,160}?) (?:models?(?: from your army)?|units?) (?:is|are) attached to this unit during the Declare Battle Formations step, (?:that model gains|models in those units have) (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)\./iu,
  )
  if (namedAttachedModelGrant)
    return stated([as(namedAttachedModelGrant[2]!, 'leader', { explicit: true, attached: true, target: namedAttachedModelGrant[1]! })])
  const saveAndAbilityGrant = prose.match(
    /^(?:[\p{L} ]+ model only\. )?The bearer has a Save characteristic of \d+\+ and the \[?([\p{L}\p{N} +'’\p{Pd}]+)\]? ability\.$/iu,
  )
  if (saveAndAbilityGrant) return stated([as(saveAndAbilityGrant[1]!, 'bearer')])
  const bearerAndLedUnitGrant = prose.match(
    /\bThe bearer has (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)\.\s*While the bearer is leading a unit, models in that unit have (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|\s+and\b|$)/iu,
  )
  if (bearerAndLedUnitGrant)
    return stated([
      as(bearerAndLedUnitGrant[1]!, 'bearer', { explicit: true }),
      as(bearerAndLedUnitGrant[2]!, 'unit', { explicit: true, attached: true }),
    ])
  const declareAttachedUnitGrant = prose.match(
    /\bDuring the Declare Battle Formations step, if this model is attached (?:to )?(?:an? )?unit, until the end of the battle, that unit has (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/iu,
  )
  if (declareAttachedUnitGrant) return stated([as(declareAttachedUnitGrant[1]!, 'unit', { explicit: true, attached: true })])
  const bearerAndUnitGrant = prose.match(
    /^(?:[^.\n]{1,160} model only\.\s*)?The bearer, and models in any unit they are leading, have the \[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilities\.$/iu,
  )
  if (bearerAndUnitGrant) return stated([as(bearerAndUnitGrant[1]!, 'unit')])
  const bearerGrant = prose.match(
    /^(?:[^.\n]{1,160} model only\.\s*)?The bearer has the \[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?:[.,]|$)/iu,
  )
  if (bearerGrant) return stated([as(bearerGrant[1]!, 'bearer')])
  const thisModelGrant = prose.match(
    /^(?:[-▪]\s*)?This model has (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]?(?: abilit(?:y|ies))?\.(?:\s|$)/iu,
  )
  if (thisModelGrant) return stated([as(thisModelGrant[1]!, 'bearer')])
  const staticModelGrants = prose.match(/^(?:[^.\n]{1,160} model only\.\s*)?This model has:\s*((?:[-▪]\s*[^.\n]{1,160}\.\s*)+)$/iu)
  if (staticModelGrants)
    return stated([...staticModelGrants[1]!.matchAll(/[-▪]\s*([^.\n]{1,160})\./gu)].map((match) => as(match[1]!, 'bearer')))
  const modelGainsGrant = /\b(?:This model|it) gains (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/iu.exec(prose)
  if (modelGainsGrant) {
    const clause = prose.slice(Math.max(prose.lastIndexOf('.', modelGainsGrant.index) + 1, 0), modelGainsGrant.index)
    const conditional = /\b(?:if|when|while|until)\b/iu.test(clause) || /\b(?:until|for the (?:remainder|rest) of)\b/iu.test(prose)
    return stated(conditional ? [] : [as(modelGainsGrant[1]!, 'bearer')])
  }
  const keywordModelsGrant = prose.match(
    /^While one or more ([\p{L} ]{1,60}?) models are in the same unit as this model, those \1 models have (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)\.?$/iu,
  )
  if (keywordModelsGrant) {
    // The printed value is the grant; a parameterised ability the bearer links (its own Feel No Pain 5+) is another one.
    return stated([{ name: titleCaseAbility(keywordModelsGrant[2]!), recipient: 'models', models: keywordModelsGrant[1]! }])
  }
  const bodyguardGrant = prose.match(
    /^While a Character model is leading this unit, that Character model has the \[?([\p{L}\p{N} +'’\p{Pd}]+)\]? ability\.$/iu,
  )
  if (bodyguardGrant) return stated([as(bodyguardGrant[1]!, 'leader', { attached: true })])
  const thisUnitGrant = prose.match(
    /^(?:[^.\n]{1,160} (?:model|unit) only\.\s*)?(?:[-▪]\s*)?This unit has (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]?(?: abilit(?:y|ies))?\.(?:\s|$)/iu,
  )
  if (thisUnitGrant) return stated([as(thisUnitGrant[1]!, 'unit', { linked: true })])
  const leadingBulletGrant = prose.match(
    /^(?:[^.\n]{1,160} model only\.\s*)?While (?:this model|the bearer) is leading a unit:\s*(?:[-▪]\s*)?Models in that unit have the \[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?:\.\s*|$)/iu,
  )
  if (leadingBulletGrant) return stated([as(leadingBulletGrant[1]!, 'unit', { attached: true })])
  for (const [pattern, recipient] of [
    [
      /\bWhile an? ([^,.\n]{1,160}?) model is leading this unit, models in this unit have (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/giu,
      'unit',
    ],
    [
      /\bWhile (?:this model|the bearer) is leading an? ([^,.\n]{1,160}?) unit, that unit has (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/giu,
      'unit',
    ],
    [
      /\bWhile (?:this model|the bearer) is leading a unit with (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies), every model in (?:this model's|the bearer's|the bearer’s) unit has (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/giu,
      'unit',
    ],
    [
      /\bWhile (?:this model|the bearer) is leading an? ([^,.\n]{1,160}?) unit, (?:it|the bearer|this model) has (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/giu,
      'bearer',
    ],
  ] as const) {
    const matches = [...prose.matchAll(pattern)]
    if (!matches.length) continue
    return stated(matches.map((match) => as(match[2]!, recipient, { explicit: true, attached: true, target: match[1]! })))
  }
  const leadingGrant = prose.match(
    /^(?:[^.\n]{1,160} model only\.\s*)?While (?:this model|the bearer) is leading a unit,\s*(?:unless [^,\n]{1,240},\s*)?models in (?:that|this) unit have the \[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|\s+and\b|$)/iu,
  )
  if (leadingGrant) return stated([as(leadingGrant[1]!, 'unit', { attached: true })])
  const ownUnitGrant = prose.match(
    /^(?:[^.\n]{1,160} model only\.\s*)?(?:[-▪]\s*)?Models in (?:this model's|the bearer's|the bearer’s) unit\s+have the \[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?:[.,]|$)/iu,
  )
  if (ownUnitGrant) return stated([as(ownUnitGrant[1]!, 'unit')])
  const modelsInThisUnitGrant = prose.match(
    /^(?:[^.\n]{1,160} (?:model|unit) only\.\s*)?(?:[-▪]\s*)?Models in this unit have (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]?(?: abilit(?:y|ies))?(?:[.,]|$)/iu,
  )
  if (modelsInThisUnitGrant) return stated([as(modelsInThisUnitGrant[1]!, 'unit')])
  const bearerUnitGrant = prose.match(
    /(?:^|\band\s+)the bearer(?:'|’)s unit has (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]?(?: abilit(?:y|ies))?(?:[.,]|$)/iu,
  )
  if (bearerUnitGrant) return stated([as(bearerUnitGrant[1]!, 'unit')])
  return {
    matched:
      mentionsDeploymentAbility(prose) &&
      /\b(?:has|have|gains?)\b/iu.test(prose) &&
      /\b(?:until|for the (?:remainder|rest) of)\b/iu.test(prose),
    grants: [],
  }
}

export function parsedAbilityGrants(
  description: string | AbilityGrantStatement | null | undefined,
  attached: boolean,
  linkedAbilities: readonly string[],
  allowUnlinkedDeployment: boolean,
  counterpartReferences: readonly string[] = [],
): AbilityGrant[] {
  return parseAbilityGrants(description, attached, linkedAbilities, allowUnlinkedDeployment, counterpartReferences).grants
}

function attachmentTargetMatches(written: string, references: readonly string[]): boolean {
  const normalize = (value: string) =>
    normalizeRuleReference(value)
      .replaceAll(/[’']/g, '')
      .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const available = references
    .map(normalize)
    .filter(Boolean)
    .toSorted((left, right) => right.length - left.length)
  return normalize(written)
    .split(/\s+or\s+/u)
    .some((alternative) => {
      let remaining = alternative
      for (const reference of available) {
        const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(reference)}(?=\\s|$)`, 'u')
        remaining = remaining.replace(pattern, ' ')
      }
      return !remaining.replaceAll(/\b(?:a|an|the|unit|units|model|models|with|ability|abilities)\b/gu, '').trim()
    })
}

const DEPLOYMENT_ABILITY = String.raw`(?:Stealth|Infiltrators|Deep Strike|Scouts \d+["″])`
const STATIC_DEPLOYMENT_RULE = new RegExp(
  String.raw`^(?:[^.\n]{1,160} (?:model|unit) only\.\s*)?This unit has (?:the )?${DEPLOYMENT_ABILITY}(?: ability)?\.$`,
  'iu',
)
const DEPLOYMENT_ABILITY_LIST = new RegExp(
  String.raw`^${DEPLOYMENT_ABILITY}(?:(?:\s*,\s*(?:and\s+)?|\s+and\s+)${DEPLOYMENT_ABILITY})*$`,
  'iu',
)
const DEPLOYMENT_ABILITIES = new RegExp(DEPLOYMENT_ABILITY, 'giu')
const DEPLOYMENT_ABILITY_MENTION = new RegExp(DEPLOYMENT_ABILITY, 'iu')

export function deploymentAbilities(written: string): string[] {
  const normalized = normalizeAbilityText(written)
  return DEPLOYMENT_ABILITY_LIST.test(normalized) ? (normalized.match(DEPLOYMENT_ABILITIES) ?? []) : []
}

function listedAbilities(written: string, linkedAbilities: readonly string[]): string[] {
  const normalized = normalizeRuleReference(normalizeAbilityText(written))
  const candidates = [
    ...new Set([...linkedAbilities.map(normalizeRuleReference), ...(normalized.match(DEPLOYMENT_ABILITIES) ?? [])]),
  ].toSorted((left, right) => right.length - left.length)
  if (!candidates.length) return []
  const ability = candidates.map(escapeRegExp).join('|')
  const list = new RegExp(`^(?:${ability})(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)(?:${ability}))*$`, 'iu')
  return list.test(normalized) ? (normalized.match(new RegExp(ability, 'giu')) ?? []) : []
}

function mentionsDeploymentAbility(written: string): boolean {
  return DEPLOYMENT_ABILITY_MENTION.test(normalizeAbilityText(written))
}

function normalizeAbilityText(written: string): string {
  return written
    .replaceAll(/[″“”]/g, '"')
    .normalize('NFKC')
    .replaceAll('′′', '"')
}

export const titleCaseAbility = (name: string) =>
  name
    .normalize('NFKC')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replaceAll(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase())

/** The weapon profiles a granted ability reaches: those of the kind it names, or both kinds when it names neither. */
export function weaponProfileTypes(kind: string | undefined): string[] {
  const named = kind?.toLowerCase()
  return named === 'ranged' ? ['Ranged Weapons'] : named === 'melee' ? ['Melee Weapons'] : ['Ranged Weapons', 'Melee Weapons']
}

/** An ability's words as the catalogue's grant readers compare them: without emphasis, on one line. */
export const normalizedAbilityText = (description: string) =>
  description
    .normalize('NFKC')
    .replaceAll(/\*\*|\^\^/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()

/** A weapon ability an ability gives its bearer's own unit. */
export function ownWeaponGrantIn(description: string): GrantedWeaponKeyword | null {
  const grant =
    normalizedAbilityText(description).match(
      /^(?:(Ranged|Melee) )?weapons equipped by (?:the bearer|models in this unit|models in this model['’]s unit) have (?:the )?\[([^\]]+)\] ability\.$/iu,
    ) ??
    description
      .normalize('NFKC')
      .trim()
      .match(/(?:^This unit['’]s|(?:^|\n\n)[A-Z][A-Z -]+ unit only\. This unit['’]s) (melee|ranged) attacks have \[([^\]]+)\]\.$/u)
  return grant
    ? { keyword: grant[2]!.replace(/^[^:]+/, (name) => titleCaseAbility(name)), profileTypes: weaponProfileTypes(grant[1]) }
    : null
}

/** A weapon ability a leader's ability gives the unit it leads. */
export function ledWeaponGrantIn(description: string): GrantedWeaponKeyword | null {
  const normalized = normalizedAbilityText(description)
  const match =
    normalized.match(
      /^While this model is leading a unit, (?:(melee|ranged) )?weapons equipped by models in that unit have the \[([\p{L}\p{N} +'’\p{Pd}]+)\] ability\.$/iu,
    ) ??
    normalized.match(
      /^(?:(melee|ranged) )?weapons equipped by models in this model['’]s unit have the \[([\p{L}\p{N} +'’\p{Pd}]+)\] ability\.$/iu,
    )
  return match ? { keyword: titleCaseAbility(match[2]!), profileTypes: weaponProfileTypes(match[1]) } : null
}

export const invulnerableSaveIn = (description: string) =>
  normalizedAbilityText(description).match(/^This model has an? (\d+\+) invulnerable save\.$/i)?.[1] ?? null
