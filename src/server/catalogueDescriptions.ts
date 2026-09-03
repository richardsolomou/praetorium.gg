import type { Condition, ModifierGroup, SelectionEntry } from '../core/catalogue'
import { routeSlug } from '../core/slug'
import type { LoadedCatalogue } from './catalogueIndex'
import { cardName, descriptionKey } from './datacards'
import type { DetachmentRulesDetail } from './rulesFactions'

export type DetachmentCatalogueDetail = {
  rules: { name: string; description: string | null }[]
  enhancements: { name: string; points: number | null; description: string | null }[]
  forcedEnhancements: { name: string; points: number | null; description: string | null }[]
}

export function mergeDetachmentRules(
  catalogueRules: readonly { name: string; description: string | null }[],
  cardRules: readonly { name: string; description: string }[],
) {
  const supplied = new Set(cardRules.map((rule) => routeSlug(rule.name)))
  const missing = catalogueRules.filter((rule) => {
    const name = routeSlug(rule.name)
    if (supplied.has(name)) return false
    supplied.add(name)
    return true
  })
  return [...cardRules, ...missing]
}

type EnhancementIndex = { byCardName: Map<string, SelectionEntry[]>; forced: Map<string, SelectionEntry[]> }

const enhancementIndexes = new WeakMap<LoadedCatalogue, EnhancementIndex>()

export function detachmentCatalogueDetail(
  loaded: LoadedCatalogue,
  catalogueId: string,
  detachmentId: string,
  enhancementNames: readonly string[],
): DetachmentCatalogueDetail | null {
  const option = loaded.detachments.get(catalogueId)?.options.find((candidate) => candidate.id === detachmentId)
  if (!option) return null
  const definition = loaded.index.definitions.get(option.id)
  const rules = [
    ...(definition?.infoLinks?.flatMap((link) => {
      const rule = loaded.index.rules.get(link.targetId)
      return rule && !rule.hidden ? [rule] : []
    }) ?? []),
    ...(definition?.rules?.filter((rule) => !rule.hidden) ?? []),
  ].flatMap((rule) => (rule.name ? [{ name: rule.name, description: rule.description ?? null }] : []))

  const indexed = enhancementIndex(loaded)
  const enhancements = enhancementNames
    .map((name) => {
      const candidates = indexed.byCardName.get(cardName(name)) ?? []
      const entry =
        unambiguous(candidates.filter((candidate) => candidate.comment === option.name)) ??
        unambiguous(candidates.filter((candidate) => loaded.index.catalogueOf.get(candidate.id) === catalogueId)) ??
        unambiguous(candidates)
      return {
        name,
        points: entry?.costs?.find((cost) => cost.typeId === loaded.index.pointsTypeId)?.value ?? null,
        description: entry ? descriptionOf(entry) : null,
      }
    })
    .toSorted((left, right) => left.name.localeCompare(right.name))
  const forcedEnhancements = (indexed.forced.get(`${catalogueId}:${detachmentId}`) ?? [])
    .map((entry) => ({
      name: entry.name ?? entry.id,
      points: entry.costs?.find((cost) => cost.typeId === loaded.index.pointsTypeId)?.value ?? null,
      description: descriptionOf(entry),
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name))

  return {
    rules,
    enhancements,
    forcedEnhancements,
  }
}

function enhancementIndex(loaded: LoadedCatalogue): EnhancementIndex {
  const existing = enhancementIndexes.get(loaded)
  if (existing) return existing

  const upgrades = [...loaded.index.definitions.values()].filter((entry): entry is SelectionEntry => entry.type === 'upgrade')
  // Keyed once: a price asks for every enhancement of every chosen detachment, and
  // slugging every upgrade in the index each time made the answer slow enough for the
  // builder's next press to race it.
  const byCardName = new Map<string, SelectionEntry[]>()
  for (const entry of upgrades) {
    if (!entry.name) continue
    const key = cardName(entry.name)
    byCardName.set(key, [...(byCardName.get(key) ?? []), entry])
  }
  const forced = new Map<string, SelectionEntry[]>()
  for (const entry of upgrades) {
    const catalogueId = loaded.index.catalogueOf.get(entry.id)
    if (!catalogueId) continue
    for (const detachmentId of forcedFor(entry)) {
      const key = `${catalogueId}:${detachmentId}`
      forced.set(key, [...(forced.get(key) ?? []), entry])
    }
  }
  const indexed = { byCardName, forced }
  enhancementIndexes.set(loaded, indexed)
  return indexed
}

function forcedFor(entry: SelectionEntry): Set<string> {
  const minimums = new Set(
    (entry.constraints ?? [])
      .filter((constraint) => constraint.type === 'min' && constraint.field === 'selections')
      .map((constraint) => constraint.id),
  )
  if (!minimums.size) return new Set()

  const found = new Set<string>()
  const visit = (group: ModifierGroup, inherited: readonly Condition[]) => {
    const conditions = [...inherited, ...(group.conditions ?? [])]
    const required = (group.modifiers ?? []).some(
      (modifier) => minimums.has(modifier.field) && Number(modifier.value) > 0 && modifier.type === 'set',
    )
    if (required) {
      for (const condition of conditions) {
        if (condition.childId && condition.field === 'selections' && (condition.scope === 'force' || condition.scope === 'roster')) {
          found.add(condition.childId)
        }
      }
    }
    for (const nested of group.modifierGroups ?? []) visit(nested, conditions)
  }

  for (const group of entry.modifierGroups ?? []) visit(group, [])
  return found
}

const descriptionOf = (entry: SelectionEntry) =>
  entry.profiles?.flatMap((profile) => profile.characteristics ?? []).find((characteristic) => characteristic.name === 'Description')
    ?.$text ?? null

function unambiguous(entries: readonly SelectionEntry[]): SelectionEntry | null {
  const described = entries.filter((entry) => descriptionOf(entry))
  return new Set(described.map(descriptionOf)).size === 1 ? (described[0] ?? null) : null
}

/**
 * What each enhancement a detachment offers says, keyed by `descriptionKey`: the
 * catalogue's own text first, then the card's. The roster and the reference page
 * read the same answer.
 */
export function describedEnhancements(
  loaded: LoadedCatalogue,
  catalogueId: string,
  option: { id: string; name: string },
  detail: Pick<DetachmentRulesDetail, 'enhancements' | 'upgrades'> | undefined,
) {
  const named = [...(detail?.enhancements ?? []), ...(detail?.upgrades ?? [])]
  const catalogue = detachmentCatalogueDetail(
    loaded,
    catalogueId,
    option.id,
    named.map((enhancement) => enhancement.name),
  )
  const described = new Map<string, string>()
  for (const enhancement of named) {
    const description =
      catalogue?.enhancements.find((candidate) => candidate.name.toLocaleLowerCase() === enhancement.name.toLocaleLowerCase())
        ?.description ?? enhancement.description
    if (description) described.set(descriptionKey(option.name, enhancement.name), description)
  }
  for (const forced of catalogue?.forcedEnhancements ?? []) {
    if (forced.description) described.set(descriptionKey(option.name, forced.name), forced.description)
  }
  return { catalogue, described }
}
