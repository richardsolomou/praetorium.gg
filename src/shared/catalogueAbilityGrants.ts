import { normalizeRuleReference, ruleReferenceMatches } from '../core/ruleReference'
import { escapeRegExp } from '../core/text'
import type { AbilityGrantStatement } from '../core/textFacts'

type AbilityGrant = { name: string; recipient: 'bearer' | 'leader' | 'unit' | 'models'; models?: string; condition?: string }

/** Exact catalogue phrases that grant a named ability to a bearer or every model in its unit. */
export function parseAbilityGrants(
  description: AbilityGrantStatement | null | undefined,
  attached: boolean,
  linkedAbilities: readonly string[],
  allowUnlinkedDeployment: boolean,
  counterpartReferences: readonly string[] = [],
): { matched: boolean; grants: AbilityGrant[] } {
  const statement = description ?? NO_GRANTS
  const linked = (written: string) =>
    linkedAbilities.some((name) => ruleReferenceMatches(written, name) || ruleReferenceMatches(name, written))
  const mayUseUnlinked = (written: string) => !deploymentAbilities(written).length || allowUnlinkedDeployment || linked(written)
  const grant = (
    written: string,
    recipient: Exclude<AbilityGrant['recipient'], 'models'>,
    explicitDeployment = false,
    condition?: string,
  ): AbilityGrant[] => {
    // An invulnerable save is a characteristic the save collectors read, never a named ability.
    if (/\binvulnerable save\b/iu.test(written)) return []
    const matched = linkedAbilities.filter((name) => ruleReferenceMatches(written, name) || ruleReferenceMatches(name, written))
    const listed = listedAbilities(written, linkedAbilities)
    const explicit = explicitDeployment ? (normalizeAbilityText(written).match(DEPLOYMENT_ABILITIES) ?? []) : []
    if (!listed.length && !explicit.length && mentionsDeploymentAbility(written)) return []
    const names = [...new Set([...matched, ...listed, ...explicit])]
    // A link that names the same ability with another value is a correction the prose has not caught up with.
    if (!names.length) names.push(linkedAbilities.length === 1 && sameAbility(written, linkedAbilities[0]!) ? linkedAbilities[0]! : written)
    return names
      .filter((name) => explicitDeployment || mayUseUnlinked(name))
      .map((name) => ({ name: titleCaseAbility(name), recipient, ...(condition ? { condition } : {}) }))
  }
  return {
    matched: statement.matched,
    grants: statement.grants.flatMap((written): AbilityGrant[] => {
      if (written.recipient === 'models') return [written]
      if (written.attached && !attached) return []
      if (written.target !== undefined && !attachmentTargetMatches(written.target, counterpartReferences)) return []
      if (written.linked && !allowUnlinkedDeployment && !linked(written.written)) return []
      return grant(written.written, written.recipient, written.explicit, written.condition)
    }),
  }
}

const NO_GRANTS: AbilityGrantStatement = { matched: false, grants: [] }

const sameAbility = (left: string, right: string) => {
  const unparameterised = (name: string) => normalizeRuleReference(name).replace(/\s+\S*\d\S*$/u, '')
  return unparameterised(left) === unparameterised(right)
}

export function parsedAbilityGrants(
  description: AbilityGrantStatement | null | undefined,
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
  return written.replaceAll(/[″“”]/g, '"').normalize('NFKC').replaceAll('′′', '"')
}

export const titleCaseAbility = (name: string) =>
  name
    .normalize('NFKC')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replaceAll(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase())
