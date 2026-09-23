import {
  buildIndex,
  nameOf,
  targetOf,
  type Catalogue,
  type CatalogueFile,
  type CatalogueIndex,
  type Definition,
  type EntryLink,
  type SelectionEntry,
} from '../core/catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import type { RuleCard } from './datacards'

const DETACHMENT_ENTRY = 'detachment'

function groupsOf(entry: Definition): Definition[] {
  return [...(entry.selectionEntryGroups ?? []), ...(entry.entryLinks ?? []).filter((link) => link.type === 'selectionEntryGroup')]
}

function rootDetachmentOptions(book: Catalogue, index: CatalogueIndex) {
  const roots: Definition[] = [...(book.selectionEntries ?? []), ...(book.sharedSelectionEntries ?? []), ...(book.entryLinks ?? [])]
  for (const wrapper of roots) {
    const target = targetOf(wrapper, index.definitions)
    if (target.type !== 'upgrade' || !nameOf(wrapper, index.definitions).toLowerCase().startsWith(DETACHMENT_ENTRY)) continue
    for (const group of groupsOf(target)) {
      const inside = targetOf(group, index.definitions)
      const options = [...(inside.selectionEntries ?? []), ...(inside.entryLinks ?? [])]
      if (options.length) return options
    }
  }
  return []
}

function directDetachmentOptions(book: Catalogue) {
  return (book.sharedSelectionEntryGroups ?? [])
    .filter((group) => group.name?.toLowerCase().includes(DETACHMENT_ENTRY))
    .flatMap((group) => group.selectionEntries ?? [])
}

/**
 * Some released catalogues define units and detachments only as shared entries.
 * Give those definitions ordinary roots so the rest of the evaluator can consume
 * them without knowing which upstream layout produced them.
 */
export function prepareCatalogueProfileRules(files: readonly CatalogueFile[]) {
  const books = new Map(files.flatMap((file) => (file.catalogue ? [[file.catalogue.id, file.catalogue] as const] : [])))
  const rawIndex = buildIndex(files, 'source')
  const profiledCatalogueIds = new Set<string>()
  const profiledDetachmentIds = new Set<string>()
  const profiledOptions = new Map<string, SelectionEntry[]>()

  for (const book of books.values()) {
    const options = directDetachmentOptions(book)
    if (!options.some((option) => option.profiles?.length)) continue
    profiledCatalogueIds.add(book.id)
    profiledOptions.set(book.id, options)
    options.filter((option) => option.profiles?.length).forEach((option) => profiledDetachmentIds.add(option.id))
  }

  const prepared = files.map((file): CatalogueFile => {
    const book = file.catalogue
    if (!book) return file

    const imported = (book.catalogueLinks ?? [])
      .filter((link) => link.importRootEntries)
      .flatMap((link) => profiledOptions.get(link.targetId) ?? [])
    const rootOptions = rootDetachmentOptions(book, rawIndex)
    const options = [...rootOptions, ...(profiledOptions.get(book.id) ?? []), ...imported]
    const uniqueOptions = [...new Map(options.map((option) => [targetOf(option, rawIndex.definitions).id, option])).values()]
    const needsWrapper =
      (imported.length > 0 || (profiledCatalogueIds.has(book.id) && rootOptions.length === 0)) && uniqueOptions.length > 0

    const rooted = new Set(
      [...(book.entryLinks ?? []), ...(book.selectionEntries ?? [])].map((entry) => targetOf(entry, rawIndex.definitions).id),
    )
    const generatedUnits: EntryLink[] = profiledCatalogueIds.has(book.id)
      ? (book.sharedSelectionEntries ?? [])
          .filter((entry) => (entry.type === 'unit' || entry.type === 'model') && !rooted.has(entry.id))
          .map((entry) => ({
            id: `profile-unit-${book.id}-${entry.id}`,
            name: entry.name,
            targetId: entry.id,
            type: 'selectionEntry' as const,
            import: true,
          }))
      : []
    const detachment: SelectionEntry[] = needsWrapper
      ? [
          {
            id: `profile-detachment-${book.id}`,
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: `profile-detachment-choices-${book.id}`,
                name: 'Detachment',
                entryLinks: uniqueOptions.map((entry) => ({
                  id: `profile-detachment-option-${book.id}-${targetOf(entry, rawIndex.definitions).id}`,
                  name: nameOf(entry, rawIndex.definitions),
                  targetId: targetOf(entry, rawIndex.definitions).id,
                  type: 'selectionEntry',
                  import: true,
                })),
              },
            ],
          },
        ]
      : []

    if (!generatedUnits.length && !detachment.length) return file
    return {
      ...file,
      catalogue: {
        ...book,
        entryLinks: [...(book.entryLinks ?? []), ...generatedUnits],
        selectionEntries: [...detachment, ...(book.selectionEntries ?? [])],
      },
    }
  })

  return {
    files: prepared,
    profiledCatalogueIds,
    profiledDetachmentIds,
    profiledArmyRules: profiledArmyRules(prepared, profiledCatalogueIds),
  }
}

export function profiledDetachmentCatalogueId(loaded: LoadedCatalogue, detachmentId: string) {
  const entry = loaded.index.definitions.get(detachmentId)
  if (!entry) return null
  const target = targetOf(entry, loaded.index.definitions)
  if (!loaded.profiledDetachmentIds.has(target.id)) return null
  return loaded.index.catalogueOf.get(target.id) ?? null
}

export const isProfiledDetachment = (loaded: LoadedCatalogue, detachmentId: string) =>
  profiledDetachmentCatalogueId(loaded, detachmentId) !== null

export function profiledArmyRulesFor(loaded: LoadedCatalogue, catalogueId: string, detachmentIds?: readonly string[]) {
  const selected = detachmentIds ? new Set(detachmentIds) : null
  const rules = new Map<string, RuleCard>()
  for (const detachment of loaded.detachments.get(catalogueId)?.options ?? []) {
    if (selected && !selected.has(detachment.id)) continue
    const owner = profiledDetachmentCatalogueId(loaded, detachment.id)
    for (const rule of (owner ? loaded.profiledArmyRules.get(owner) : undefined) ?? []) rules.set(rule.name, rule)
  }
  return [...rules.values()]
}

export function profiledDetachmentPoints(loaded: LoadedCatalogue, detachmentId: string): number | null {
  const entry = loaded.index.definitions.get(detachmentId)
  if (!entry) return null
  const type = [...loaded.index.costTypes.values()].find((costType) => costType.name === 'Detachment Points')
  if (!type) return null
  return targetOf(entry, loaded.index.definitions).costs?.find((cost) => cost.typeId === type.id)?.value ?? null
}

export function profiledDetachmentCards(loaded: LoadedCatalogue, detachmentId: string) {
  const entry = loaded.index.definitions.get(detachmentId)
  if (!entry) return { rules: [], stratagems: [] }
  const cards = (targetOf(entry, loaded.index.definitions).profiles ?? []).flatMap((profile) => {
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

function profiledArmyRules(files: readonly CatalogueFile[], profiledCatalogueIds: ReadonlySet<string>) {
  const books = new Map(files.flatMap((file) => (file.catalogue ? [[file.catalogue.id, file.catalogue] as const] : [])))
  const rules = new Map<string, RuleCard[]>()
  for (const book of books.values()) {
    if (!profiledCatalogueIds.has(book.id)) continue
    const units = (book.sharedSelectionEntries ?? []).filter((entry) => entry.type === 'unit' || entry.type === 'model')
    if (!units.length) continue
    const profiles = [book, ...(book.catalogueLinks ?? []).flatMap((link) => books.get(link.targetId) ?? [])].flatMap(
      (source) => source.sharedProfiles ?? [],
    )
    const common = new Set((units[0]?.infoLinks ?? []).map((link) => link.targetId))
    for (const unit of units.slice(1)) {
      const targets = new Set((unit.infoLinks ?? []).map((link) => link.targetId))
      for (const id of common) if (!targets.has(id)) common.delete(id)
    }
    rules.set(
      book.id,
      profiles.flatMap((profile) => {
        if (!common.has(profile.id)) return []
        const description = profile.characteristics?.find((characteristic) => characteristic.name === 'Description')?.$text
        return description && profile.name ? [{ name: profile.name, description }] : []
      }),
    )
  }
  return rules
}
