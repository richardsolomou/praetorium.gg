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
import type { DetachmentRulesDetail } from './rulesFactions'
import { joinKey } from './rulesSource'
import { editionlessCatalogueName } from './factionNames'
import { hiddenByRules } from '../core/evaluate'

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

export function catalogueReplacements(books: ReadonlyMap<string, Catalogue>, profiledIds: ReadonlySet<string>) {
  const byName = new Map([...books.values()].map((book) => [book.name, book]))
  const replacements = new Map(
    [...profiledIds].flatMap((id) => {
      const replacement = books.get(id)
      const legacy = replacement && byName.get(editionlessCatalogueName(replacement.name))
      return legacy && legacy.id !== id ? [[legacy.id, id] as const] : []
    }),
  )
  for (const [legacyParentId, currentParentId] of Array.from(replacements)) {
    const legacyChapters = [...books.values()].filter((book) =>
      book.catalogueLinks?.some((link) => link.importRootEntries && link.targetId === legacyParentId),
    )
    for (const current of books.values()) {
      if (!profiledIds.has(current.id) || editionlessCatalogueName(current.name) === current.name) continue
      if (!current.catalogueLinks?.some((link) => link.importRootEntries && link.targetId === currentParentId)) continue
      const leaf = editionlessCatalogueName(current.name).split(' - ').at(-1)
      const matches = legacyChapters.filter((book) => book.name.split(' - ').at(-1) === leaf)
      if (matches.length === 1) replacements.set(matches[0]!.id, current.id)
    }
  }
  return replacements
}

function supplementIds(books: ReadonlyMap<string, Catalogue>, replacements: ReadonlyMap<string, string>) {
  const supersededIds = new Set(replacements.keys())
  return new Set(
    [...books.values()]
      .filter((book) => book.catalogueLinks?.some((link) => link.importRootEntries && supersededIds.has(link.targetId)))
      .map((book) => book.id),
  )
}

export function catalogueProfileMetadata(files: readonly CatalogueFile[], rawIndex?: CatalogueIndex) {
  const books = new Map(files.flatMap((file) => (file.catalogue ? [[file.catalogue.id, file.catalogue] as const] : [])))
  const profiledCatalogueIds = new Set<string>()
  const profiledDetachmentIds = new Set<string>()
  const profiledOptions = new Map<string, SelectionEntry[]>()

  for (const book of books.values()) {
    const options = directDetachmentOptions(book)
    const sharedUnits = (book.sharedSelectionEntries ?? []).filter((entry) => entry.type === 'unit' || entry.type === 'model')
    const library = book.name.split(' - ').some((part) => part.toLowerCase() === 'library')
    const generatedRoot = book.selectionEntries?.some((entry) => entry.id === `profile-detachment-${book.id}`)
    if (
      library ||
      !sharedUnits.length ||
      !options.some((option) => option.profiles?.length) ||
      (!generatedRoot && (!rawIndex || rootDetachmentOptions(book, rawIndex).length))
    )
      continue
    profiledCatalogueIds.add(book.id)
    profiledOptions.set(book.id, options)
    options.filter((option) => option.profiles?.length).forEach((option) => profiledDetachmentIds.add(option.id))
  }

  const replacements = catalogueReplacements(books, profiledCatalogueIds)
  const profiledSupplementIds = supplementIds(books, replacements)

  return {
    profiledCatalogueIds,
    profiledSupplementIds,
    profiledDetachmentIds,
    profiledArmyRules: profiledArmyRules(files, profiledCatalogueIds),
    profiledOptions,
    replacements,
  }
}

/** Give shared units and detachments ordinary roots for the evaluator. */
export function prepareCatalogueProfileRules(files: readonly CatalogueFile[]) {
  const rawIndex = buildIndex(files, 'source')
  const {
    profiledCatalogueIds,
    profiledSupplementIds,
    profiledDetachmentIds,
    profiledArmyRules: profiledRuleCards,
    profiledOptions,
    replacements,
  } = catalogueProfileMetadata(files, rawIndex)
  const books = files.flatMap((file) => (file.catalogue ? [file.catalogue] : []))
  const byId = new Map(books.map((book) => [book.id, book]))
  const warlordTargets = new Map(
    [...replacements].flatMap(([legacyId, currentId]) => {
      const legacy = byId.get(legacyId)
      const sources = [
        legacy,
        ...(legacy?.catalogueLinks ?? []).filter((link) => replacements.has(link.targetId)).map((link) => byId.get(link.targetId)),
      ]
      const targets = new Set(
        sources.flatMap((source) =>
          (source?.sharedSelectionEntries ?? [])
            .filter((entry) => entry.type === 'upgrade' && entry.name === 'Warlord')
            .map((entry) => entry.id),
        ),
      )
      return targets.size === 1 ? [[currentId, [...targets][0]!] as const] : []
    }),
  )
  const supersededOptions = new Map(
    [...replacements].map(([legacyId]) => [
      legacyId,
      new Set(
        rootDetachmentOptions(byId.get(legacyId)!, rawIndex)
          .filter((option) => !hiddenByRules(option, rawIndex, { primaryCatalogueId: legacyId }))
          .map((option) => targetOf(option, rawIndex.definitions).id),
      ),
    ]),
  )

  const prepared = files.map((file): CatalogueFile => {
    const book = file.catalogue
    if (!book) return file

    const warlordTarget = warlordTargets.get(book.id)
    const sharedSelectionEntries = warlordTarget
      ? (book.sharedSelectionEntries ?? []).map((entry) => {
          if (
            (entry.type !== 'unit' && entry.type !== 'model') ||
            !entry.categoryLinks?.some((category) => category.name === 'Character') ||
            entry.entryLinks?.some((link) => link.name === 'Warlord')
          )
            return entry
          return {
            ...entry,
            entryLinks: [
              ...(entry.entryLinks ?? []),
              {
                id: `profile-warlord-${book.id}-${entry.id}`,
                name: 'Warlord',
                targetId: warlordTarget,
                type: 'selectionEntry' as const,
                import: true,
              },
            ],
          }
        })
      : undefined

    const imports = (book.catalogueLinks ?? []).filter((link) => link.importRootEntries)
    const imported = imports.flatMap((link) => profiledOptions.get(replacements.get(link.targetId) ?? link.targetId) ?? [])
    const superseded = new Set(imports.flatMap((link) => [...(supersededOptions.get(link.targetId) ?? [])]))
    const rootOptions = rootDetachmentOptions(book, rawIndex).filter((option) => !superseded.has(targetOf(option, rawIndex.definitions).id))
    const chapterOptions = imports.flatMap((link) => {
      const legacy = byId.get(link.targetId)
      if (!legacy || !replacements.has(legacy.id)) return []
      return rootDetachmentOptions(legacy, rawIndex).filter(
        (option) =>
          !superseded.has(targetOf(option, rawIndex.definitions).id) && !hiddenByRules(option, rawIndex, { primaryCatalogueId: book.id }),
      )
    })
    const options = [...rootOptions, ...chapterOptions, ...(profiledOptions.get(book.id) ?? []), ...imported]
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

    if (!generatedUnits.length && !detachment.length && !sharedSelectionEntries) return file
    return {
      ...file,
      catalogue: {
        ...book,
        entryLinks: [...(book.entryLinks ?? []), ...generatedUnits],
        selectionEntries: [...detachment, ...(book.selectionEntries ?? [])],
        ...(sharedSelectionEntries ? { sharedSelectionEntries } : {}),
      },
    }
  })

  return {
    files: prepared,
    profiledCatalogueIds,
    profiledSupplementIds,
    profiledDetachmentIds,
    profiledArmyRules: profiledRuleCards,
    replacements,
  }
}

export function profiledDetachmentCatalogueId(loaded: Pick<LoadedCatalogue, 'index' | 'profiledDetachmentIds'>, detachmentId: string) {
  const entry = loaded.index.definitions.get(detachmentId)
  if (!entry) return null
  const target = targetOf(entry, loaded.index.definitions)
  if (!loaded.profiledDetachmentIds.has(target.id)) return null
  return loaded.index.catalogueOf.get(target.id) ?? null
}

export const isProfiledDetachment = (loaded: Pick<LoadedCatalogue, 'index' | 'profiledDetachmentIds'>, detachmentId: string) =>
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

export function profiledDetachmentCards(loaded: Pick<LoadedCatalogue, 'index'>, detachmentId: string) {
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

export function profiledDetachmentMatchesCards(
  loaded: Pick<LoadedCatalogue, 'index'>,
  detachmentId: string,
  detail: Pick<DetachmentRulesDetail, 'rules' | 'stratagems'> | undefined,
) {
  if (!detail) return false
  const cards = profiledDetachmentCards(loaded, detachmentId)
  const names = (entries: readonly { name: string }[]) =>
    entries
      .map((entry) => joinKey(entry.name))
      .sort()
      .join('|')
  return names(cards.rules) === names(detail.rules) && names(cards.stratagems) === names(detail.stratagems)
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
