import type { CatalogueIndex, ConditionGroup, Definition, Modifier } from './catalogue'
import { definitionAndTarget, resolve } from './catalogue'
import { remember } from './collections'
import { childrenOf } from './definitions'
import { flattenedModifiers, type Selection } from './evaluate'

const unitReads = new WeakMap<CatalogueIndex, Map<string, ReturnType<typeof readsOf>>>()
const rosterFacts = new WeakMap<CatalogueIndex, WeakMap<readonly Selection[], ReturnType<typeof factsOf>>>()

/** Whether the surrounding selections could change a default build or its price. */
export function unitReadsRoster(entryId: string, index: CatalogueIndex, roster: readonly Selection[]): boolean {
  if (!roster.length) return false
  const reads = remember(
    remember(unitReads, index, () => new Map()),
    entryId,
    () => readsOf(entryId, index),
  )
  if (reads.all) return true
  const facts = remember(
    remember(rosterFacts, index, () => new WeakMap()),
    roster,
    () => factsOf(roster, index),
  )
  return facts.unknown || facts.matches.some((id) => reads.outside.has(id)) || facts.grants.some((id) => reads.keywords.has(id))
}

const localScopes = new Set([
  'self',
  'parent',
  'root-entry',
  'root-entry-self',
  'unit',
  'unit-self',
  'model',
  'model-self',
  'model-or-unit',
  'model-or-unit-self',
  'upgrade',
])

function readsOf(entryId: string, index: CatalogueIndex) {
  const outside = new Set<string>()
  const keywords = new Set<string>()
  let all = false
  const query = (scope: string, childId?: string) => {
    if (scope === 'primary-catalogue') return
    if (childId && childId !== 'any') keywords.add(childId)
    if (localScopes.has(scope)) return
    if (childId && childId !== 'any') outside.add(childId)
    else all = true
  }
  const group = (entry: ConditionGroup) => {
    for (const condition of entry.conditions ?? []) query(condition.scope, condition.childId)
    for (const nested of entry.conditionGroups ?? []) group(nested)
    for (const local of entry.localConditionGroups ?? []) {
      query(local.scope === 'parent' && local.includeChildForces ? 'force' : local.scope, local.childId)
      for (const condition of local.conditions ?? []) query(condition.scope, condition.childId)
      for (const nested of local.conditionGroups ?? []) group(nested)
    }
  }
  const categoryRules: Modifier[] = []
  const modifier = (entry: Modifier) => {
    for (const condition of entry.conditions ?? []) query(condition.scope, condition.childId)
    for (const repeat of entry.repeats ?? []) query(repeat.scope, repeat.childId)
    for (const nested of entry.conditionGroups ?? []) group(nested)
  }
  const seen = new Set<Definition>()
  const walk = (entry: Definition) => {
    if (seen.has(entry)) return
    seen.add(entry)
    const sources = definitionAndTarget(entry, index)
    // A candidate legality check can also report errors on another selection of the same entry.
    for (const source of sources) outside.add(source.id)
    const constraints = sources.flatMap((source) => source.constraints ?? [])
    const limits = new Set(constraints.map(({ id }) => id))
    for (const constraint of constraints) {
      if (constraint.field === 'associations') continue
      // A top-level maximum written against the parent can be a force constraint.
      const scope = constraint.scope === 'parent' && constraint.type === 'max' && !constraint.childId ? 'force' : constraint.scope
      for (const source of sources) query(scope, source.id)
    }
    for (const source of sources)
      for (const link of source.categoryLinks ?? []) {
        const category = index.categories.get(link.targetId)
        if (!category?.constraints?.length) continue
        for (const constraint of category.constraints) {
          limits.add(constraint.id)
          query(constraint.scope, category.id)
        }
        for (const rule of flattenedModifiers([category])) modifier(rule)
      }
    for (const rule of flattenedModifiers(sources)) {
      if (rule.field === 'category') categoryRules.push(rule)
      else if (rule.field === 'hidden' || rule.field === 'error' || index.costTypes.has(rule.field) || limits.has(rule.field))
        modifier(rule)
    }
    for (const child of childrenOf(entry, index)) walk(child.definition)
  }
  const entry = index.definitions.get(entryId)
  if (entry) walk(entry)
  // Grants are decided from the written categories and can affect pricing only when another rule reads them.
  const pricingKeywords = new Set(keywords)
  for (const rule of categoryRules) {
    if (typeof rule.value !== 'string' || !pricingKeywords.has(rule.value)) continue
    if (outside.has(rule.value) && !localScopes.has(rule.scope ?? 'self')) all = true
    modifier(rule)
  }
  return { all, outside, keywords }
}

function factsOf(roster: readonly Selection[], index: CatalogueIndex) {
  const matches = new Set<string>()
  const grants = new Set<string>()
  let unknown = false
  const walk = (selection: Selection) => {
    const entry = index.definitions.get(selection.id)
    if (!entry || ('targetId' in entry && !index.definitions.has(entry.targetId))) {
      unknown = true
      return
    }
    const target = resolve(entry, index)
    matches.add(entry.id)
    matches.add(target.id)
    if (target.type) matches.add(target.type)
    if (target.type === 'model' || target.type === 'unit') matches.add('model-or-unit')
    const sources = definitionAndTarget(entry, index)
    for (const source of sources) for (const link of source.categoryLinks ?? []) matches.add(link.targetId)
    for (const modifier of flattenedModifiers(sources))
      if (modifier.field === 'category' && typeof modifier.value === 'string') grants.add(modifier.value)
    for (const child of selection.selections ?? []) walk(child)
  }
  for (const selection of roster) walk(selection)
  return { matches: [...matches], grants: [...grants], unknown }
}
