import { normalizeRuleReference, ruleReferenceMatches } from '../core/ruleReference'
import { escapeRegExp } from '../core/text'

type AbilityGrant = { name: string; recipient: 'bearer' | 'leader' | 'unit' }

/** Exact catalogue phrases that grant a named ability to a bearer or every model in its unit. */
export function parseAbilityGrants(
  description: string | null | undefined,
  attached: boolean,
  linkedAbilities: readonly string[],
  allowUnlinkedDeployment: boolean,
  counterpartReferences: readonly string[] = [],
): { matched: boolean; grants: AbilityGrant[] } {
  if (!description) return { matched: false, grants: [] }
  const prose = normalizeAbilityText(description.replaceAll(/\^\^|\*/g, ''))
    .replaceAll(/\babilty\b/giu, 'ability')
    .replaceAll(/\bModel's in\b/gu, 'Models in')
  const grant = (written: string, recipient: 'bearer' | 'leader' | 'unit', explicitDeployment = false) => {
    const matched = linkedAbilities.filter((name) => ruleReferenceMatches(written, name) || ruleReferenceMatches(name, written))
    const listed = listedAbilities(written, linkedAbilities)
    const explicit = explicitDeployment ? (normalizeAbilityText(written).match(DEPLOYMENT_ABILITIES) ?? []) : []
    if (!listed.length && !explicit.length && mentionsDeploymentAbility(written)) return []
    const names = [...new Set([...matched, ...listed, ...explicit])]
    if (!names.length) names.push(...(linkedAbilities.length === 1 ? linkedAbilities : [written]))
    return names.filter((name) => explicitDeployment || mayUseUnlinked(name)).map((name) => ({ name: titleCaseAbility(name), recipient }))
  }
  const linked = (written: string) =>
    linkedAbilities.some((name) => ruleReferenceMatches(written, name) || ruleReferenceMatches(name, written))
  const mayUseUnlinked = (written: string) => !deploymentAbilities(written).length || allowUnlinkedDeployment || linked(written)
  const conditionalBearerGrants = [
    ...prose.matchAll(
      /\bIf this model is attached to (?:an? )?([^,.\n]{1,160}?) during the Declare Battle Formations step, (?:it gains|this model has) (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)\./giu,
    ),
  ]
  if (conditionalBearerGrants.length) {
    const applies = (written: string) => attachmentTargetMatches(written, counterpartReferences)
    return {
      matched: true,
      grants: attached ? conditionalBearerGrants.flatMap((match) => (applies(match[1]!) ? grant(match[2]!, 'bearer', true) : [])) : [],
    }
  }
  const attachedLeaderGrant = prose.match(
    /\bIf this unit has a Leader unit attached to it during the Declare Battle Formations step, that Leader unit gains (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)\./iu,
  )
  if (attachedLeaderGrant) return { matched: true, grants: attached ? grant(attachedLeaderGrant[1]!, 'leader', true) : [] }
  const namedAttachedModelGrant = prose.match(
    /\bIf (?:an?|one or more) ([^,.\n]{1,160}?) (?:models?(?: from your army)?|units?) (?:is|are) attached to this unit during the Declare Battle Formations step, (?:that model gains|models in those units have) (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)\./iu,
  )
  if (namedAttachedModelGrant) {
    const applies = attachmentTargetMatches(namedAttachedModelGrant[1]!, counterpartReferences)
    return { matched: true, grants: attached && applies ? grant(namedAttachedModelGrant[2]!, 'leader', true) : [] }
  }
  const saveAndAbilityGrant = prose.match(
    /^(?:[\p{L} ]+ model only\. )?The bearer has a Save characteristic of \d+\+ and the \[?([\p{L}\p{N} +'’\p{Pd}]+)\]? ability\.$/iu,
  )
  if (saveAndAbilityGrant) return { matched: true, grants: grant(saveAndAbilityGrant[1]!, 'bearer') }
  const bearerAndLedUnitGrant = prose.match(
    /\bThe bearer has (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)\.\s*While the bearer is leading a unit, models in that unit have (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|\s+and\b|$)/iu,
  )
  if (bearerAndLedUnitGrant) {
    return {
      matched: true,
      grants: [...grant(bearerAndLedUnitGrant[1]!, 'bearer', true), ...(attached ? grant(bearerAndLedUnitGrant[2]!, 'unit', true) : [])],
    }
  }
  const declareAttachedUnitGrant = prose.match(
    /\bDuring the Declare Battle Formations step, if this model is attached (?:to )?(?:an? )?unit, until the end of the battle, that unit has (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/iu,
  )
  if (declareAttachedUnitGrant) {
    return { matched: true, grants: attached ? grant(declareAttachedUnitGrant[1]!, 'unit', true) : [] }
  }
  const bearerAndUnitGrant = prose.match(
    /^(?:[^.\n]{1,160} model only\.\s*)?The bearer, and models in any unit they are leading, have the \[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilities\.$/iu,
  )
  if (bearerAndUnitGrant) return { matched: true, grants: grant(bearerAndUnitGrant[1]!, 'unit') }
  const bearerGrant = prose.match(
    /^(?:[^.\n]{1,160} model only\.\s*)?The bearer has the \[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?:[.,]|$)/iu,
  )
  if (bearerGrant) return { matched: true, grants: grant(bearerGrant[1]!, 'bearer') }
  const thisModelGrant = prose.match(
    /^(?:[-▪]\s*)?This model has (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]?(?: abilit(?:y|ies))?\.(?:\s|$)/iu,
  )
  if (thisModelGrant) return { matched: true, grants: grant(thisModelGrant[1]!, 'bearer') }
  const staticModelGrants = prose.match(/^(?:[^.\n]{1,160} model only\.\s*)?This model has:\s*((?:[-▪]\s*[^.\n]{1,160}\.\s*)+)$/iu)
  if (staticModelGrants) {
    const written = [...staticModelGrants[1]!.matchAll(/[-▪]\s*([^.\n]{1,160})\./gu)]
    return { matched: true, grants: written.flatMap((match) => grant(match[1]!, 'bearer')) }
  }
  const modelGainsGrant = /\b(?:This model|it) gains (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/iu.exec(prose)
  if (modelGainsGrant) {
    const clause = prose.slice(Math.max(prose.lastIndexOf('.', modelGainsGrant.index) + 1, 0), modelGainsGrant.index)
    const conditional = /\b(?:if|when|while|until)\b/iu.test(clause) || /\b(?:until|for the (?:remainder|rest) of)\b/iu.test(prose)
    return { matched: true, grants: conditional ? [] : grant(modelGainsGrant[1]!, 'bearer') }
  }
  const bodyguardGrant = prose.match(
    /^While a Character model is leading this unit, that Character model has the \[?([\p{L}\p{N} +'’\p{Pd}]+)\]? ability\.$/iu,
  )
  if (bodyguardGrant) return { matched: true, grants: attached ? grant(bodyguardGrant[1]!, 'leader') : [] }
  const thisUnitGrant = prose.match(
    /^(?:[^.\n]{1,160} (?:model|unit) only\.\s*)?(?:[-▪]\s*)?This unit has (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]?(?: abilit(?:y|ies))?\.(?:\s|$)/iu,
  )
  if (thisUnitGrant)
    return {
      matched: true,
      grants: allowUnlinkedDeployment || linked(thisUnitGrant[1]!) ? grant(thisUnitGrant[1]!, 'unit') : [],
    }
  const leadingBulletGrant = prose.match(
    /^(?:[^.\n]{1,160} model only\.\s*)?While (?:this model|the bearer) is leading a unit:\s*(?:[-▪]\s*)?Models in that unit have the \[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?:\.\s*|$)/iu,
  )
  if (leadingBulletGrant) return { matched: true, grants: attached ? grant(leadingBulletGrant[1]!, 'unit') : [] }
  const namedModelLeadingGrants = [
    ...prose.matchAll(
      /\bWhile an? ([^,.\n]{1,160}?) model is leading this unit, models in this unit have (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/giu,
    ),
  ]
  if (namedModelLeadingGrants.length) {
    const grants = namedModelLeadingGrants.flatMap((match) =>
      attachmentTargetMatches(match[1]!, counterpartReferences) ? grant(match[2]!, 'unit', true) : [],
    )
    return { matched: true, grants: attached ? grants : [] }
  }
  const namedLedUnitGrants = [
    ...prose.matchAll(
      /\bWhile (?:this model|the bearer) is leading an? ([^,.\n]{1,160}?) unit, that unit has (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/giu,
    ),
  ]
  if (namedLedUnitGrants.length) {
    const grants = namedLedUnitGrants.flatMap((match) =>
      attachmentTargetMatches(match[1]!, counterpartReferences) ? grant(match[2]!, 'unit', true) : [],
    )
    return { matched: true, grants: attached ? grants : [] }
  }
  const counterpartAbilityGrants = [
    ...prose.matchAll(
      /\bWhile (?:this model|the bearer) is leading a unit with (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies), every model in (?:this model's|the bearer's|the bearer’s) unit has (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/giu,
    ),
  ]
  if (counterpartAbilityGrants.length) {
    const grants = counterpartAbilityGrants.flatMap((match) =>
      attachmentTargetMatches(match[1]!, counterpartReferences) ? grant(match[2]!, 'unit', true) : [],
    )
    return { matched: true, grants: attached ? grants : [] }
  }
  const namedBodyguardGrants = [
    ...prose.matchAll(
      /\bWhile (?:this model|the bearer) is leading an? ([^,.\n]{1,160}?) unit, (?:it|the bearer|this model) has (?:the )?\[?([\p{L}\p{N} +,"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|$)/giu,
    ),
  ]
  if (namedBodyguardGrants.length) {
    const grants = namedBodyguardGrants.flatMap((match) =>
      attachmentTargetMatches(match[1]!, counterpartReferences) ? grant(match[2]!, 'bearer', true) : [],
    )
    return { matched: true, grants: attached ? grants : [] }
  }
  const leadingGrant = prose.match(
    /^(?:[^.\n]{1,160} model only\.\s*)?While (?:this model|the bearer) is leading a unit,\s*(?:unless [^,\n]{1,240},\s*)?models in (?:that|this) unit have the \[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?=[.,]|\s+and\b|$)/iu,
  )
  if (leadingGrant) return { matched: true, grants: attached ? grant(leadingGrant[1]!, 'unit') : [] }
  const ownUnitGrant = prose.match(
    /^(?:[^.\n]{1,160} model only\.\s*)?(?:[-▪]\s*)?Models in (?:this model's|the bearer's|the bearer’s) unit\s+have the \[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]? abilit(?:y|ies)(?:[.,]|$)/iu,
  )
  if (ownUnitGrant) return { matched: true, grants: grant(ownUnitGrant[1]!, 'unit') }
  const modelsInThisUnitGrant = prose.match(
    /^(?:[^.\n]{1,160} (?:model|unit) only\.\s*)?(?:[-▪]\s*)?Models in this unit have (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]?(?: abilit(?:y|ies))?(?:[.,]|$)/iu,
  )
  if (modelsInThisUnitGrant) return { matched: true, grants: grant(modelsInThisUnitGrant[1]!, 'unit') }
  const bearerUnitGrant = prose.match(
    /(?:^|\band\s+)the bearer(?:'|’)s unit has (?:the )?\[?([\p{L}\p{N} +"'’\p{Pd}]+?)\]?(?: abilit(?:y|ies))?(?:[.,]|$)/iu,
  )
  if (bearerUnitGrant) return { matched: true, grants: grant(bearerUnitGrant[1]!, 'unit') }
  return {
    matched:
      mentionsDeploymentAbility(prose) &&
      /\b(?:has|have|gains?)\b/iu.test(prose) &&
      /\b(?:until|for the (?:remainder|rest) of)\b/iu.test(prose),
    grants: [],
  }
}

export function parsedAbilityGrants(
  description: string | null | undefined,
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
