import { groupBy, remember } from '../core/collections'
import type { Condition, ModifierGroup, SelectionEntry } from '../core/catalogue'
import { distance } from 'fastest-levenshtein'
import { compareText, joinKey } from '../core/text'
import type { LoadedCatalogue } from './catalogueIndex'
import { cardName, descriptionKey } from './datacards'
import { linksWeapon } from './textFacts'
import { comparableText } from '../core/sourceText'
import type { DetachmentRulesDetail } from '../contracts/factions'

type DetachmentCatalogueDetail = {
  rules: { name: string; description: string | null }[]
  enhancements: { name: string; points: number | null; description: string | null }[]
  forcedEnhancements: { name: string; points: number | null; description: string | null }[]
}

/** The catalogue misspells some card rule names ("Hyper Adaptions", "Synaptic Imperitives"); a couple of letters apart in a long name is the same rule. */
export function sameRuleName(left: string, right: string) {
  const [a, b] = [joinKey(left), joinKey(right)]
  return a === b || (Math.min(a.length, b.length) >= 10 && distance(a, b) <= 2)
}

export function mergeDetachmentRules(
  catalogueRules: readonly { name: string; description: string | null }[],
  cardRules: readonly { name: string; description: string }[],
) {
  const supplied: string[] = cardRules.map((rule) => rule.name)
  const missing = catalogueRules.filter((rule) => {
    if (supplied.some((name) => sameRuleName(name, rule.name))) return false
    supplied.push(rule.name)
    return true
  })
  return [...cardRules, ...missing]
}

type EnhancementIndex = {
  byCardName: Map<string, SelectionEntry[]>
  byDetachment: Map<string, SelectionEntry[]>
  forced: Map<string, SelectionEntry[]>
}

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
      // A link to a core rule such as Lethal Hits only defines a keyword the detachment's own rule grants.
      const core = loaded.index.catalogues.get(loaded.index.ruleCatalogueOf.get(link.targetId) ?? '')?.gameSystem
      return rule && !rule.hidden && !core ? [rule] : []
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
        description: entry ? enhancementDescription(entry, loaded) : null,
      }
    })
    .toSorted((left, right) => compareText(left.name, right.name))
  const forcedEnhancements = (indexed.forced.get(`${catalogueId}:${detachmentId}`) ?? [])
    .map((entry) => ({
      name: entry.name ?? entry.id,
      points: entry.costs?.find((cost) => cost.typeId === loaded.index.pointsTypeId)?.value ?? null,
      description: enhancementDescription(entry, loaded),
    }))
    .toSorted((left, right) => compareText(left.name, right.name))

  return {
    rules,
    enhancements,
    forcedEnhancements,
  }
}

export const detachmentEnhancementNames = (loaded: LoadedCatalogue, detachmentName: string) =>
  (enhancementIndex(loaded).byDetachment.get(detachmentName) ?? []).map((entry) => entry.name!)

function enhancementIndex(loaded: LoadedCatalogue): EnhancementIndex {
  return remember(enhancementIndexes, loaded, () => {
    const upgrades = [...loaded.index.definitions.values()].filter((entry): entry is SelectionEntry => entry.type === 'upgrade')
    // Keyed once: a price asks for every enhancement of every chosen detachment.
    const byCardName = groupBy(
      upgrades.filter((entry) => entry.name),
      (entry) => cardName(entry.name!),
    )
    const forced = new Map<string, SelectionEntry[]>()
    for (const entry of upgrades) {
      const catalogueId = loaded.index.catalogueOf.get(entry.id)
      if (!catalogueId) continue
      for (const detachmentId of forcedFor(entry)) {
        const key = `${catalogueId}:${detachmentId}`
        forced.set(key, [...(forced.get(key) ?? []), entry])
      }
    }
    // BSData comments each enhancement with its detachment's name.
    const byDetachment = groupBy(
      upgrades.filter((entry) => entry.name && entry.comment),
      (entry) => entry.comment!,
    )
    return { byCardName, byDetachment, forced }
  })
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

function enhancementDescription(entry: SelectionEntry, loaded: LoadedCatalogue) {
  const description = descriptionOf(entry)
  const linked = linkedEnhancementWeapon(entry, loaded.index)
  if (!description || !linked) return description
  const { weapon } = linked
  const values = weapon
    .characteristics!.filter(
      (characteristic) => characteristic.$text && (characteristic.name !== 'Keywords' || characteristic.$text !== '-'),
    )
    .map((characteristic) => `${characteristic.name} ${characteristic.$text}`)
  return `${description}\n\n**${weapon.name}** — ${values.join(' · ')}`
}

function linkedEnhancementWeapon(entry: SelectionEntry, index: LoadedCatalogue['index']) {
  const description = descriptionOf(entry)
  if (!description || !linksWeapon(description, index.textFacts)) return null
  const linked = (entry.entryLinks ?? []).flatMap((link) =>
    (index.definitions.get(link.targetId)?.profiles ?? [])
      .filter((profile) => profile.typeName === 'Melee Weapons' || profile.typeName === 'Ranged Weapons')
      .map((weapon) => ({ link, weapon })),
  )
  if (linked.length !== 1) return null
  const { weapon } = linked[0]!
  const required = weapon.typeName === 'Melee Weapons' ? ['Range', 'A', 'WS', 'S', 'AP', 'D'] : ['Range', 'A', 'BS', 'S', 'AP', 'D']
  const characteristics = weapon.characteristics ?? []
  if (!required.every((name) => characteristics.some((characteristic) => characteristic.name === name && characteristic.$text))) return null
  return linked[0]!
}

function unambiguous(entries: readonly SelectionEntry[]): SelectionEntry | null {
  const described = entries.filter((entry) => descriptionOf(entry))
  return new Set(described.map((entry) => comparableText(descriptionOf(entry)!))).size === 1 ? (described[0] ?? null) : null
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
      catalogue?.enhancements.find((candidate) => candidate.name.toLowerCase() === enhancement.name.toLowerCase())?.description ??
      enhancement.description
    if (description) described.set(descriptionKey(option.name, enhancement.name), description)
  }
  for (const forced of catalogue?.forcedEnhancements ?? []) {
    if (forced.description) described.set(descriptionKey(option.name, forced.name), forced.description)
  }
  return { catalogue, described }
}
