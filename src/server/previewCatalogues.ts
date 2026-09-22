import { targetOf, type Catalogue, type CatalogueFile, type EntryLink, type SelectionEntry } from '../core/catalogue'
import type { RuleCard } from './datacards'
import type { LoadedCatalogue } from './catalogueIndex'

export const isPreviewCatalogue = (catalogue: Pick<Catalogue, 'name'>) => catalogue.name.endsWith(' (11e)')

export function isSupersededCatalogue(loaded: LoadedCatalogue, catalogue: { id: string; name: string }) {
  if (isPreviewCatalogue(catalogue)) return false
  const name = catalogue.name.split(' - ').at(-1)
  return [...loaded.index.catalogues.values()].some(
    (candidate) =>
      isPreviewCatalogue(candidate) &&
      candidate.name
        .split(' - ')
        .at(-1)
        ?.replace(/ \(11e\)$/, '') === name,
  )
}

export function previewDetachmentCatalogueId(loaded: LoadedCatalogue, detachmentId: string) {
  const entry = loaded.index.definitions.get(detachmentId)
  if (!entry) return null
  const owner = loaded.index.catalogueOf.get(targetOf(entry, loaded.index.definitions).id)
  const catalogue = owner ? loaded.index.catalogues.get(owner) : undefined
  return catalogue && isPreviewCatalogue(catalogue) ? (owner ?? null) : null
}

export const isPreviewDetachment = (loaded: LoadedCatalogue, detachmentId: string) =>
  previewDetachmentCatalogueId(loaded, detachmentId) !== null

export function previewArmyRulesFor(loaded: LoadedCatalogue, catalogueId: string, detachmentIds?: readonly string[]) {
  const selected = detachmentIds ? new Set(detachmentIds) : null
  const rules = new Map<string, RuleCard>()
  for (const detachment of loaded.detachments.get(catalogueId)?.options ?? []) {
    if (selected && !selected.has(detachment.id)) continue
    const owner = previewDetachmentCatalogueId(loaded, detachment.id)
    for (const rule of (owner ? loaded.previewArmyRules.get(owner) : undefined) ?? []) rules.set(rule.name, rule)
  }
  return [...rules.values()]
}

export function replacementDetachments<T extends { name: string; detachments: { id: string }[]; referenceDetachmentIds: string[] }>(
  loaded: LoadedCatalogue,
  faction: T,
  retainedIds: readonly string[] = [],
): T {
  if (isPreviewCatalogue(faction)) return faction
  const visibleIds = new Set([...faction.referenceDetachmentIds, ...retainedIds])
  for (const detachment of faction.detachments) if (isPreviewDetachment(loaded, detachment.id)) visibleIds.add(detachment.id)
  return {
    ...faction,
    detachments: faction.detachments.filter((detachment) => visibleIds.has(detachment.id)),
    referenceDetachmentIds: [...visibleIds],
  }
}

export function previewDetachmentPoints(loaded: LoadedCatalogue, detachmentId: string): number | null {
  const entry = loaded.index.definitions.get(detachmentId)
  if (!entry) return null
  const type = [...loaded.index.costTypes.values()].find((costType) => costType.name === 'Detachment Points')
  if (!type) return null
  const target = targetOf(entry, loaded.index.definitions)
  return target.costs?.find((cost) => cost.typeId === type.id)?.value ?? null
}

export function previewDetachmentCards(loaded: LoadedCatalogue, detachmentId: string) {
  const entry = loaded.index.definitions.get(detachmentId)
  if (!entry) return { rules: [], stratagems: [] }
  const target = targetOf(entry, loaded.index.definitions)
  const cards = (target.profiles ?? []).flatMap((profile) => {
    const description = profile.characteristics?.find((characteristic) => characteristic.name === 'Description')?.$text
    return profile.name && description ? [{ id: profile.id, name: profile.name, description }] : []
  })
  return {
    rules: cards.filter((card) => !/\(\d+CP\)$/.test(card.name)),
    stratagems: cards.flatMap((card) => {
      const cost = card.name.match(/\s*\((\d+)CP\)$/)
      return cost ? [{ ...card, name: card.name.slice(0, -cost[0].length), cp: Number(cost[1]) }] : []
    }),
  }
}

export function previewArmyRules(files: readonly CatalogueFile[]): Map<string, RuleCard[]> {
  const books = new Map(files.flatMap((file) => (file.catalogue ? [[file.catalogue.id, file.catalogue] as const] : [])))
  const rules = new Map<string, RuleCard[]>()
  for (const book of books.values()) {
    if (!isPreviewCatalogue(book)) continue
    const units = (book.sharedSelectionEntries ?? []).filter((entry) => entry.type === 'unit' || entry.type === 'model')
    if (!units.length) continue
    const shared = [book, ...(book.catalogueLinks ?? []).flatMap((link) => books.get(link.targetId) ?? [])].flatMap(
      (source) => source.sharedProfiles ?? [],
    )
    const common = new Set((units[0]?.infoLinks ?? []).map((link) => link.targetId))
    for (const unit of units.slice(1)) {
      const targets = new Set((unit.infoLinks ?? []).map((link) => link.targetId))
      for (const id of common) if (!targets.has(id)) common.delete(id)
    }
    rules.set(
      book.id,
      shared.flatMap((profile) => {
        if (!common.has(profile.id)) return []
        const description = profile.characteristics?.find((characteristic) => characteristic.name === 'Description')?.$text
        return description && profile.name ? [{ name: profile.name, description }] : []
      }),
    )
  }
  return rules
}

export function preparePreviewCatalogues(files: readonly CatalogueFile[]): CatalogueFile[] {
  const books = new Map(files.flatMap((file) => (file.catalogue ? [[file.catalogue.id, file.catalogue] as const] : [])))

  return files.map((file) => {
    const book = file.catalogue
    if (!book || !isPreviewCatalogue(book) || book.entryLinks?.length || book.selectionEntries?.length) return file

    const units: EntryLink[] = (book.sharedSelectionEntries ?? [])
      .filter((entry) => entry.type === 'unit' || entry.type === 'model')
      .map((entry) => ({
        id: `preview-${book.id}-${entry.id}`,
        name: entry.name,
        targetId: entry.id,
        type: 'selectionEntry',
        import: true,
      }))
    const imported = (book.catalogueLinks ?? [])
      .filter((link) => link.importRootEntries)
      .flatMap((link) => books.get(link.targetId)?.sharedSelectionEntryGroups ?? [])
    const options = [...(book.sharedSelectionEntryGroups ?? []), ...imported]
      .filter((group) => group.name?.includes('Detachment'))
      .flatMap((group) => group.selectionEntries ?? [])
    const detachment: SelectionEntry[] = options.length
      ? [
          {
            id: `preview-detachment-${book.id}`,
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: `preview-detachment-choices-${book.id}`,
                name: 'Detachment',
                entryLinks: options.map((entry) => ({
                  id: `preview-${book.id}-${entry.id}`,
                  name: entry.name,
                  targetId: entry.id,
                  type: 'selectionEntry',
                  import: true,
                })),
              },
            ],
          },
        ]
      : []

    return { ...file, catalogue: { ...book, entryLinks: units, selectionEntries: detachment } }
  })
}
