import type { Condition, ModifierGroup, SelectionEntry } from '../core/catalogue'
import type { LoadedCatalogue } from './catalogueIndex'

export type DetachmentCatalogueDetail = {
  rule: { name: string; description: string | null } | null
  enhancements: { name: string; points: number | null; description: string | null }[]
  forcedEnhancements: { name: string; points: number | null; description: string | null }[]
}

export function detachmentCatalogueDetail(
  loaded: LoadedCatalogue,
  catalogueId: string,
  detachmentId: string,
  enhancementNames: readonly string[],
): DetachmentCatalogueDetail | null {
  const option = loaded.detachments.get(catalogueId)?.options.find((candidate) => candidate.id === detachmentId)
  if (!option) return null
  const definition = loaded.index.definitions.get(option.id)
  const linkedRule = definition?.infoLinks
    ?.map((link) => loaded.index.rules.get(link.targetId))
    .find((candidate) => candidate && !candidate.hidden)
  const inlineRule = definition?.rules?.find((candidate) => !candidate.hidden)
  const rule = linkedRule ?? inlineRule

  const upgrades = [...loaded.index.definitions.values()].filter((entry): entry is SelectionEntry => entry.type === 'upgrade')
  const enhancements = enhancementNames
    .map((name) => {
      const candidates = upgrades.filter((entry) => comparableName(entry.name) === comparableName(name))
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
  const forcedEnhancements = upgrades
    .filter((entry) => loaded.index.catalogueOf.get(entry.id) === catalogueId && forcedBy(entry, detachmentId))
    .map((entry) => ({
      name: entry.name ?? entry.id,
      points: entry.costs?.find((cost) => cost.typeId === loaded.index.pointsTypeId)?.value ?? null,
      description: descriptionOf(entry),
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name))

  return {
    rule: rule?.name ? { name: rule.name, description: rule.description ?? null } : null,
    enhancements,
    forcedEnhancements,
  }
}

function forcedBy(entry: SelectionEntry, detachmentId: string) {
  const minimums = new Set(
    (entry.constraints ?? [])
      .filter((constraint) => constraint.type === 'min' && constraint.field === 'selections')
      .map((constraint) => constraint.id),
  )
  if (!minimums.size) return false

  const visit = (group: ModifierGroup, inherited: readonly Condition[]): boolean => {
    const conditions = [...inherited, ...(group.conditions ?? [])]
    const selected = conditions.some(
      (condition) =>
        condition.childId === detachmentId &&
        condition.field === 'selections' &&
        (condition.scope === 'force' || condition.scope === 'roster'),
    )
    if (
      selected &&
      (group.modifiers ?? []).some((modifier) => minimums.has(modifier.field) && Number(modifier.value) > 0 && modifier.type === 'set')
    ) {
      return true
    }
    return (group.modifierGroups ?? []).some((nested) => visit(nested, conditions))
  }

  return (entry.modifierGroups ?? []).some((group) => visit(group, []))
}

const comparableName = (name: string | undefined) =>
  name
    ?.replace(/\s*\((?:aura|upgrade)\)\s*$/i, '')
    .trim()
    .toLocaleLowerCase()

const descriptionOf = (entry: SelectionEntry) =>
  entry.profiles?.flatMap((profile) => profile.characteristics ?? []).find((characteristic) => characteristic.name === 'Description')
    ?.$text ?? null

function unambiguous(entries: readonly SelectionEntry[]): SelectionEntry | null {
  const described = entries.filter((entry) => descriptionOf(entry))
  return new Set(described.map(descriptionOf)).size === 1 ? (described[0] ?? null) : null
}
