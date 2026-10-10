import { escapeRegExp } from '../core/text'
import type { Definition, InfoLink } from '../core/catalogue'
import type { ProfileModifier } from '../core/evaluate'

export function definitionTokens(definition: Definition) {
  return [
    definition.id,
    definition.type,
    'targetId' in definition ? definition.targetId : undefined,
    ...(definition.categoryLinks ?? []).flatMap((link) => [link.targetId, link.name]),
  ].filter((value): value is string => Boolean(value))
}

export function modifiedProfileField(
  baseValue: string,
  field: string | undefined,
  profileType: string,
  lineage: readonly string[],
  owner: readonly string[],
  modifiers: readonly ProfileModifier[],
  defaultJoin?: string,
) {
  if (!field) return { value: baseValue }
  const applied = modifiers.filter(
    (modifier) =>
      modifier.field === field &&
      modifier.profileType === profileType &&
      modifier.filters.every((filter) => lineage.includes(filter)) &&
      profileInModifierScope(modifier, lineage, owner),
  )
  let value = baseValue
  const sources: string[] = []
  for (const modifier of applied.toSorted((left, right) => modifierOrder(left.type) - modifierOrder(right.type))) {
    const changed = applyDisplayModifier(value, modifier, defaultJoin)
    if (changed === value) continue
    value = changed
    sources.push(modifier.source)
  }
  return value === baseValue ? { value: baseValue } : { value, baseValue, modifiers: [...new Set(sources)] }
}

function profileInModifierScope(modifier: ProfileModifier, lineage: readonly string[], owner: readonly string[]) {
  if (modifier.global) return true
  const ownsProfile = modifier.originIds.some((id) => owner.includes(id))
  if (!modifier.includeEntries) return modifier.includeSelf && ownsProfile
  const containsOrigin = modifier.originIds.some((id) => lineage.includes(id))
  return (modifier.includeSelf && ownsProfile) || containsOrigin
}

type DisplayModifier = Pick<ProfileModifier, 'type' | 'value' | 'arg' | 'position' | 'join' | 'skipIfPresent' | 'times'>

const MODIFIER_ORDER: Partial<Record<DisplayModifier['type'], number>> = {
  set: 0,
  append: 1,
  prepend: 1,
  increment: 2,
  decrement: 2,
  multiply: 2,
  divide: 2,
  modulo: 2,
  power: 2,
  exponent: 2,
  triangular: 2,
  floor: 3,
  ceil: 3,
  'cumulative-add': 4,
  'cumulative-power': 4,
  'cumulative-multiply': 4,
  replace: 4,
}

const modifierOrder = (type: DisplayModifier['type']) => MODIFIER_ORDER[type] ?? Number.MAX_SAFE_INTEGER

export function displayRuleName(link: InfoLink, base: string | undefined) {
  if (!base) return
  const modifiers = (link.modifiers ?? [])
    .filter(
      (modifier) =>
        modifier.field === 'name' && !modifier.conditions?.length && !modifier.conditionGroups?.length && !modifier.repeats?.length,
    )
    .map((modifier) => ({ ...modifier, times: 1 }))
    .toSorted((left, right) => modifierOrder(left.type) - modifierOrder(right.type))
  return modifiers.reduce((name, modifier) => applyDisplayModifier(name, modifier), base)
}

function applyDisplayModifier(current: string, modifier: DisplayModifier, defaultJoin = ' ') {
  const value = modifier.value
  const text = modifierText(value)
  switch (modifier.type) {
    case 'set':
      return text ?? current
    case 'append':
      if (text === null) return current
      if (modifier.skipIfPresent && current.includes(modifier.skipIfPresent)) return current
      return joinedDisplayText(current ? `${current}${modifier.join ?? defaultJoin}${text}` : text, defaultJoin)
    case 'prepend':
      if (text === null) return current
      if (modifier.skipIfPresent && current.includes(modifier.skipIfPresent)) return current
      return joinedDisplayText(current ? `${text}${modifier.join ?? defaultJoin}${current}` : text, defaultJoin)
    case 'increment':
      return modifyNumbers(current, modifier, (number) => number + Number(value) * modifier.times)
    case 'decrement':
      return modifyNumbers(current, modifier, (number) => number - Number(value) * modifier.times)
    case 'multiply':
      return modifyNumbers(current, modifier, (number) => number * Number(value) * modifier.times)
    case 'divide': {
      const divisor = Number(value) * modifier.times
      return modifyNumbers(current, modifier, (number) => (divisor === 0 ? 0 : number / divisor))
    }
    case 'modulo': {
      const divisor = Number(value) * modifier.times
      return modifyNumbers(current, modifier, (number) => (divisor === 0 ? 0 : number % divisor))
    }
    case 'power':
      return modifyNumbers(current, modifier, (number) => number ** (Number(value) * modifier.times))
    case 'exponent':
      return modifyNumbers(current, modifier, (number) => number * Number(value) ** modifier.times)
    case 'triangular':
      return modifyNumbers(current, modifier, (number) => number + (Number(value) * modifier.times * (modifier.times + 1)) / 2)
    case 'floor':
      return modifyNumbers(current, modifier, (number) => Math.max(number, Number(value)))
    case 'ceil':
      return modifyNumbers(current, modifier, (number) => Math.min(number, Number(value)))
    case 'cumulative-add':
      return modifyNumbers(current, modifier, (number) => number + Number(value) * ((modifier.times + 1) / 2))
    case 'cumulative-power':
      return modifyNumbers(current, modifier, (number) => {
        if (modifier.times === 0) return number
        let total = number
        for (let at = 1; at < modifier.times; at++) total += number * Number(value) ** at
        return total / modifier.times
      })
    case 'cumulative-multiply':
      return modifyNumbers(current, modifier, (number) => {
        let total = 0
        for (let at = 1; at <= modifier.times; at++) total += number * Number(value) ** at
        return total
      })
    case 'replace': {
      const replacement = text ?? ''
      if (!modifier.arg) return current ? current : replacement
      return replaceAt(current, new RegExp(escapeRegExp(modifier.arg), 'g'), modifier.position, () => replacement)
    }
    default:
      return current
  }
}

function joinedDisplayText(value: string, defaultJoin: string) {
  if (defaultJoin !== ', ') return value
  const seen = new Set<string>()
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(defaultJoin)
}

const modifierText = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : value === undefined ? '' : null

const NUMBER = /-?\d+(?:\.\d+)?/g

function modifyNumbers(current: string, modifier: DisplayModifier, change: (value: number) => number) {
  if (!Number.isFinite(Number(modifier.value))) return current
  if (!current) return String(change(0))
  return replaceAt(current, NUMBER, modifier.position, (found) => String(change(Number(found))))
}

function replaceAt(value: string, pattern: RegExp, position: number | string | undefined, replacement: (found: string) => string) {
  const at = Number(position) || 0
  if (at === 0) return value.replaceAll(pattern, replacement)
  const matches = [...value.matchAll(pattern)]
  const index = at < 0 ? matches.length + at : at - 1
  const match = matches[index]
  if (!match || match.index === undefined) return value
  return value.slice(0, match.index) + replacement(match[0]) + value.slice(match.index + match[0].length)
}
