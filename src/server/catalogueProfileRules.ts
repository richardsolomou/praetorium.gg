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
import { defaultSelection } from '../core/expand'
import { wargearOf } from '../core/wargear'
import { linkedEnhancementWeapon } from './catalogueDescriptions'

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

function datasheetNotes(entry: SelectionEntry) {
  return entry.profiles
    ?.find((profile) => profile.name === 'Datasheet Notes')
    ?.characteristics?.find((characteristic) => characteristic.name === 'Description')?.$text
}

function defaultWargear(entry: SelectionEntry, modelName?: string) {
  const notes = datasheetNotes(entry)
  const common = notes?.match(/\b(?:Every model|This model) is equipped with:\s*([^.|]+)/i)?.[1]
  const specific = modelName
    ? notes
        ?.split(/\s*\|\s*/)
        .map((part) =>
          part
            .trim()
            .replace(/^(?:The|Every) /, '')
            .match(/^(.+?) is equipped with:\s*(.+?)\.?$/),
        )
        .find((match) => match?.[1]?.toLowerCase() === modelName.toLowerCase())?.[2]
    : null
  const printed = common ?? specific
  if (!printed) return null
  const pieces = printed.trim().split(/;\s*/)
  const weapons = pieces.map((piece) => piece.trim().match(/^(\d+)\s+(.+?)\.?$/))
  if (weapons.some((weapon) => !weapon || Number(weapon[1]) < 1)) return null
  return weapons.map((weapon) => ({ count: Number(weapon![1]), name: weapon![2]!.toLowerCase() }))
}

function printedModelComposition(entry: SelectionEntry) {
  const parts =
    datasheetNotes(entry)
      ?.split('UNIT COMPOSITION: ')[1]
      ?.split(/\s*\|\s*/) ?? []
  const models: { name: string; min: number; max: number }[] = []
  for (const part of parts) {
    const match = part
      .trim()
      .replace(/\.$/, '')
      .match(/^(\d+)(?:-(\d+))?\s+(.+?)\s+models?$/)
    if (!match) break
    models.push({ name: match[3]!, min: Number(match[1]), max: Number(match[2] ?? match[1]) })
  }
  return models.reduce((total, model) => total + model.min, 0) > 1 ? models : null
}

function unitWeaponOptions(entry: SelectionEntry) {
  return (entry.selectionEntryGroups ?? [])
    .filter((group) => group.name === 'Weapon Options')
    .flatMap((group) => group.selectionEntries ?? [])
    .flatMap((option) => option.entryLinks ?? [])
}

function withoutMovedWeaponOptions(entry: SelectionEntry): SelectionEntry {
  const moved = new Set<string>()
  const visit = (node: Pick<SelectionEntry, 'entryLinks' | 'selectionEntries' | 'selectionEntryGroups'>) => {
    for (const link of node.entryLinks ?? []) if (link.id.startsWith('profile-weapon-')) moved.add(link.targetId)
    for (const child of node.selectionEntries ?? []) visit(child)
    for (const group of node.selectionEntryGroups ?? []) visit(group)
  }
  visit(entry)
  if (!moved.size) return entry
  return {
    ...entry,
    selectionEntryGroups: entry.selectionEntryGroups?.flatMap((group) => {
      if (group.name !== 'Weapon Options') return [group]
      const selectionEntries = group.selectionEntries?.filter(
        (option) => option.entryLinks?.length !== 1 || !moved.has(option.entryLinks[0]!.targetId),
      )
      return selectionEntries?.length || group.entryLinks?.length ? [{ ...group, selectionEntries }] : []
    }),
  }
}

function withReadableWargearOptions(entry: SelectionEntry): SelectionEntry {
  const instructions: NonNullable<SelectionEntry['profiles']> = []
  const selectionEntryGroups = entry.selectionEntryGroups?.flatMap((group) => {
    if (group.name !== 'Wargear Options') return [group]
    const selectionEntries = group.selectionEntries?.filter((option) => {
      const profile = option.profiles?.find((item) => item.name === 'Option')
      const description = profile?.characteristics?.find((item) => item.name === 'Description')?.$text
      if (!description || option.entryLinks?.length || option.selectionEntries?.length || option.selectionEntryGroups?.length) return true
      instructions.push({
        ...profile,
        id: `profile-wargear-instruction-${entry.id}-${option.id}`,
        name: 'Wargear option',
        typeName: 'Abilities',
      })
      return false
    })
    return selectionEntries?.length || group.entryLinks?.length ? [{ ...group, selectionEntries }] : []
  })
  return instructions.length ? { ...entry, profiles: [...(entry.profiles ?? []), ...instructions], selectionEntryGroups } : entry
}

function defaultWeaponLinks(
  entry: SelectionEntry,
  weapons: NonNullable<ReturnType<typeof defaultWargear>>,
  index: CatalogueIndex,
  catalogueId: string,
  extraLinks: readonly EntryLink[] = [],
) {
  const nameOfLink = (link: EntryLink) => link.name?.replace(/\s+[–-]\s+.+$/, '').toLowerCase()
  const existing = entry.entryLinks ?? []
  const links = [
    ...existing,
    ...extraLinks
      .filter(
        (link) =>
          weapons.some((weapon) => weapon.name === nameOfLink(link)) && !existing.some((other) => nameOfLink(other) === nameOfLink(link)),
      )
      .map((link) => ({ ...link, id: `profile-weapon-${entry.id}-${link.id}`, constraints: undefined })),
  ]
  const selected = defaultSelection(entry.id, index, { primaryCatalogueId: catalogueId })
  const already = new Set((selected ? wargearOf(selected, index) : []).map((item) => item.name.replace(/\s+[–-]\s+.+$/, '').toLowerCase()))
  if (
    weapons.some(
      (weapon) =>
        !already.has(weapon.name) && !links.some((link) => index.definitions.has(link.targetId) && nameOfLink(link) === weapon.name),
    )
  )
    return entry
  const modeGroups = weapons.flatMap((weapon) => {
    if (already.has(weapon.name)) return []
    const modes = links.filter((link) => index.definitions.has(link.targetId) && nameOfLink(link) === weapon.name)
    if (modes.length < 2 || modes.some((link) => !/\s+[–-]\s+/.test(link.name ?? '') || link.constraints?.length)) return []
    const id = `profile-modes-${modes[0]!.id}`
    return [
      {
        id,
        name: weapon.name,
        defaultSelectionEntryId: modes[0]!.id,
        constraints: [
          {
            id: `${id}-min`,
            field: 'selections' as const,
            scope: 'parent' as const,
            shared: true,
            type: 'min' as const,
            value: weapon.count,
          },
          {
            id: `${id}-max`,
            field: 'selections' as const,
            scope: 'parent' as const,
            shared: true,
            type: 'max' as const,
            value: weapon.count,
          },
        ],
        entryLinks: modes,
      },
    ]
  })
  const grouped = new Set(modeGroups.flatMap((group) => group.entryLinks.map((link) => link.id)))
  return {
    ...entry,
    selectionEntryGroups: [...(entry.selectionEntryGroups ?? []), ...modeGroups],
    entryLinks: links
      .filter((link) => !grouped.has(link.id))
      .map((link) => {
        const weapon = weapons.find((item) => nameOfLink(link) === item.name)
        if (!weapon || already.has(weapon.name)) return link
        if (link.constraints?.length) return link
        return {
          ...link,
          constraints: [
            {
              id: `profile-default-min-${link.id}`,
              field: 'selections',
              scope: 'parent',
              shared: true,
              type: 'min' as const,
              value: weapon.count,
            },
            {
              id: `profile-default-max-${link.id}`,
              field: 'selections',
              scope: 'parent',
              shared: true,
              type: 'max' as const,
              value: weapon.count,
            },
          ],
        }
      }),
  }
}

function withPrintedDefaultWargear(entry: SelectionEntry, index: CatalogueIndex, catalogueId: string): SelectionEntry {
  const weapons = defaultWargear(entry)
  const extraLinks = unitWeaponOptions(entry)
  const modelGroups = entry.selectionEntryGroups?.filter((group) => group.selectionEntries?.some((model) => model.type === 'model')) ?? []
  const composition = !modelGroups.length && entry.type === 'unit' ? printedModelComposition(entry) : null
  if (composition) {
    return withoutMovedWeaponOptions({
      ...entry,
      selectionEntryGroups: [
        {
          id: `profile-models-${entry.id}`,
          name: 'Unit',
          selectionEntries: composition.map((model, at) => {
            const generated: SelectionEntry = {
              id: `profile-model-${entry.id}-${at}`,
              name: model.name,
              type: 'model',
              constraints: [
                {
                  id: `profile-model-min-${entry.id}-${at}`,
                  field: 'selections',
                  scope: 'parent',
                  shared: true,
                  type: 'min',
                  value: model.min,
                },
                {
                  id: `profile-model-max-${entry.id}-${at}`,
                  field: 'selections',
                  scope: 'parent',
                  shared: true,
                  type: 'max',
                  value: model.max,
                },
              ],
              entryLinks: (entry.entryLinks ?? []).map((link) => ({ ...link, id: `profile-model-weapon-${entry.id}-${at}-${link.id}` })),
            }
            const modelWeapons = defaultWargear(entry, model.name) ?? weapons
            return modelWeapons ? defaultWeaponLinks(generated, modelWeapons, index, catalogueId, extraLinks) : generated
          }),
        },
        ...(entry.selectionEntryGroups ?? []),
      ],
    })
  }
  if (!modelGroups.length)
    return weapons ? withoutMovedWeaponOptions(defaultWeaponLinks(entry, weapons, index, catalogueId, extraLinks)) : entry
  return withoutMovedWeaponOptions({
    ...entry,
    selectionEntryGroups: entry.selectionEntryGroups?.map((group) =>
      modelGroups.includes(group)
        ? {
            ...group,
            selectionEntries: group.selectionEntries?.map((model) => {
              if (model.type !== 'model') return model
              const modelWeapons = defaultWargear(entry, model.name ?? '') ?? weapons
              return modelWeapons ? defaultWeaponLinks(model, modelWeapons, index, catalogueId, extraLinks) : model
            }),
          }
        : group,
    ),
  })
}

function withPrintedWeaponSwaps(entry: SelectionEntry): SelectionEntry {
  const options = entry.selectionEntryGroups?.find((group) => group.name === 'Wargear Options')?.selectionEntries ?? []
  const swaps = options.flatMap((option) => {
    const specific = /^The (.+?) can have their (.+?) replaced with 1 (.+?)\.$/i.exec(option.name ?? '')
    const all = /^All models in this unit can each have their (.+?) replaced with 1 (.+?)\.$/i.exec(option.name ?? '')
    const allNamed = /^All (.+?) models in this unit can each have their (.+?) replaced with 1 (.+?)\.$/i.exec(option.name ?? '')
    const equipped = /^This model can be equipped with 1 (.+?)\.$/i.exec(option.name ?? '')
    const from = specific?.[2] ?? all?.[1] ?? allNamed?.[2]
    const to = specific?.[3] ?? all?.[2] ?? allNamed?.[3] ?? equipped?.[1]
    const linked = option.entryLinks?.length === 1 ? option.entryLinks[0] : undefined
    if ((!from && !equipped) || !to || !linked || joinKey(linked.name ?? '') !== joinKey(to)) return []
    return [{ id: option.id, model: specific?.[1] ?? allNamed?.[1] ?? null, from: from ?? null, to, linked }]
  })

  const applied = new Set<string>()
  const apply = (links: EntryLink[] | undefined, candidates: typeof swaps, ownerId: string) => {
    if (!links?.length) return links
    const usable = candidates.filter((swap) => {
      const from = swap.from
      if (from === null) return true
      return links.some(
        (link) =>
          joinKey(link.name ?? '') === joinKey(from) &&
          link.constraints?.some((constraint) => constraint.field === 'selections' && constraint.type === 'min' && constraint.value >= 1),
      )
    })
    if (!usable.length) return links
    usable.forEach((swap) => applied.add(swap.id))
    const additions = new Map<string, EntryLink>()
    for (const swap of usable) {
      const key = `${joinKey(swap.to)}:${swap.linked.targetId}`
      if (!links.some((link) => joinKey(link.name ?? '') === joinKey(swap.to) && link.targetId === swap.linked.targetId)) {
        additions.set(key, {
          ...swap.linked,
          id: `profile-swap-weapon-${ownerId}-${swap.id}`,
          constraints: undefined,
          modifiers: undefined,
        })
      }
    }
    return [...links, ...additions.values()].map((link) => {
      const relevant = usable.filter(
        (swap) =>
          (swap.from !== null && joinKey(link.name ?? '') === joinKey(swap.from)) ||
          (joinKey(link.name ?? '') === joinKey(swap.to) && link.targetId === swap.linked.targetId),
      )
      if (!relevant.length) return link
      const original = link.constraints ?? []
      const minId =
        original.find((constraint) => constraint.field === 'selections' && constraint.type === 'min')?.id ?? `profile-swap-min-${link.id}`
      const maxId =
        original.find((constraint) => constraint.field === 'selections' && constraint.type === 'max')?.id ?? `profile-swap-max-${link.id}`
      return {
        ...link,
        constraints: [
          ...original,
          ...(!original.some((constraint) => constraint.id === minId)
            ? [{ id: minId, field: 'selections' as const, scope: 'parent' as const, type: 'min' as const, value: 0 }]
            : []),
          ...(!original.some((constraint) => constraint.id === maxId)
            ? [{ id: maxId, field: 'selections' as const, scope: 'parent' as const, type: 'max' as const, value: 0 }]
            : []),
        ],
        modifiers: [
          ...(link.modifiers ?? []),
          ...relevant.flatMap((swap) => {
            const value = joinKey(link.name ?? '') === joinKey(swap.to) ? 1 : 0
            const condition = {
              childId: swap.id,
              field: 'selections' as const,
              includeChildSelections: true,
              scope: 'roster' as const,
              type: 'atLeast' as const,
              value: 1,
            }
            return [
              { field: minId, type: 'set' as const, value, conditions: [condition] },
              { field: maxId, type: 'set' as const, value, conditions: [condition] },
            ]
          }),
        ],
      }
    })
  }

  const modelGroups = entry.selectionEntryGroups?.filter((group) => group.selectionEntries?.some((model) => model.type === 'model')) ?? []
  const projected: SelectionEntry = !modelGroups.length
    ? {
        ...entry,
        entryLinks: apply(
          entry.entryLinks,
          swaps.filter((swap) => !swap.model),
          entry.id,
        ),
      }
    : {
        ...entry,
        selectionEntryGroups: entry.selectionEntryGroups?.map((group) =>
          modelGroups.includes(group)
            ? {
                ...group,
                selectionEntries: group.selectionEntries?.map((model) => ({
                  ...model,
                  entryLinks: apply(
                    model.entryLinks,
                    swaps.filter((swap) => swap.from !== null && (!swap.model || joinKey(swap.model) === joinKey(model.name ?? ''))),
                    model.id,
                  ),
                })),
              }
            : group,
        ),
      }
  const unsupported = new Set(
    options
      .filter(
        (option) =>
          !applied.has(option.id) &&
          !option.selectionEntries?.length &&
          !option.selectionEntryGroups?.length &&
          !(option.entryLinks ?? []).some((link) =>
            link.constraints?.some((constraint) => constraint.field === 'selections' && constraint.type === 'min' && constraint.value >= 1),
          ),
      )
      .map((option) => option.id),
  )
  if (!unsupported.size) return projected
  const instructions = options
    .filter((option) => unsupported.has(option.id))
    .flatMap((option) =>
      (option.profiles ?? [])
        .filter((profile) => profile.name === 'Option')
        .map((profile) => ({ ...profile, id: `profile-wargear-instruction-${entry.id}-${option.id}`, name: 'Wargear option' })),
    )
  return {
    ...projected,
    profiles: [...(projected.profiles ?? []), ...instructions],
    selectionEntryGroups: projected.selectionEntryGroups?.map((group) =>
      group.name === 'Wargear Options'
        ? { ...group, selectionEntries: group.selectionEntries?.filter((option) => !unsupported.has(option.id)) }
        : group,
    ),
  }
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
  const marineGroups = new Map(
    [...replacements].flatMap(([legacyId, currentId]) => {
      const current = byId.get(currentId)
      const groups = current?.sharedSelectionEntryGroups ?? []
      const enhancements = groups.find((group) => group.name === 'Enhancements')
      const upgrades = groups.find((group) => group.name === 'Detachment Upgrades')
      if (!enhancements || !upgrades) return []
      const targets = { enhancements: enhancements.id, upgrades: upgrades.id }
      return [[legacyId, targets] as const, [currentId, targets] as const]
    }),
  )
  const marineGroupsFor = (book: Catalogue) =>
    marineGroups.get(book.id) ??
    (profiledSupplementIds.has(book.id)
      ? (book.catalogueLinks ?? []).flatMap((link) => marineGroups.get(link.targetId) ?? []).at(0)
      : undefined)
  const withoutIneligibleGroups = (entry: SelectionEntry, groups: { enhancements: string; upgrades: string }): SelectionEntry => {
    if (entry.type !== 'unit' && entry.type !== 'model') return entry
    const categories = new Set(entry.categoryLinks?.map((link) => link.name))
    const links = entry.entryLinks?.filter(
      (link) =>
        !((categories.has('Character') || categories.has('Epic Hero')) && link.targetId === groups.upgrades) &&
        !(categories.has('Epic Hero') && link.targetId === groups.enhancements),
    )
    return links && links.length !== entry.entryLinks?.length ? { ...entry, entryLinks: links } : entry
  }
  const withInheritedGroups = (entry: SelectionEntry, groups: { enhancements: string; upgrades: string }): SelectionEntry => {
    if (entry.type !== 'unit' && entry.type !== 'model') return entry
    const categories = new Set(entry.categoryLinks?.map((link) => link.name))
    const eligible = withoutIneligibleGroups(entry, groups)
    const targets = new Set(eligible.entryLinks?.map((link) => link.targetId))
    const links: EntryLink[] = []
    if (categories.has('Character') && !categories.has('Epic Hero') && !targets.has(groups.enhancements))
      links.push({
        id: `profile-enhancements-${entry.id}`,
        name: 'Enhancements',
        type: 'selectionEntryGroup',
        targetId: groups.enhancements,
        import: true,
      })
    if (!categories.has('Character') && !categories.has('Epic Hero') && !targets.has(groups.upgrades))
      links.push({
        id: `profile-upgrades-${entry.id}`,
        name: 'Detachment Upgrades',
        type: 'selectionEntryGroup',
        targetId: groups.upgrades,
        import: true,
      })
    return links.length ? { ...eligible, entryLinks: [...(eligible.entryLinks ?? []), ...links] } : eligible
  }
  const withRequiredEnhancementWeapon = (entry: SelectionEntry): SelectionEntry => {
    const linked = linkedEnhancementWeapon(entry, rawIndex.definitions)
    if (!linked) return entry
    return {
      ...entry,
      entryLinks: entry.entryLinks?.map((link) =>
        link !== linked.link ||
        link.constraints?.some((constraint) => constraint.field === 'selections' && constraint.type === 'min' && constraint.value >= 1)
          ? link
          : {
              ...link,
              constraints: [
                ...(link.constraints ?? []),
                {
                  id: `profile-enhancement-weapon-${link.id}`,
                  field: 'selections',
                  scope: 'parent',
                  type: 'min',
                  value: 1,
                },
              ],
            },
      ),
    }
  }

  const prepared = files.map((file): CatalogueFile => {
    const book = file.catalogue
    if (!book) return file
    const groups = marineGroupsFor(book)

    const sharedSelectionEntryGroups = profiledCatalogueIds.has(book.id)
      ? book.sharedSelectionEntryGroups?.map((group) => {
          if (group.name !== 'Enhancements') return group
          const limitChildren = group.constraints?.some(
            (constraint) => constraint.field === 'selections' && constraint.type === 'max' && constraint.includeChildSelections,
          )
          return {
            ...group,
            selectionEntryGroups: group.selectionEntryGroups?.map((child) => ({
              ...child,
              selectionEntries: child.selectionEntries?.map(withRequiredEnhancementWeapon),
              constraints:
                !limitChildren || child.constraints?.some((constraint) => constraint.field === 'selections' && constraint.type === 'max')
                  ? child.constraints
                  : [
                      ...(child.constraints ?? []),
                      {
                        id: `profile-enhancement-max-${child.id}`,
                        field: 'selections' as const,
                        scope: 'self' as const,
                        type: 'max' as const,
                        value: 1,
                      },
                    ],
            })),
          }
        })
      : undefined

    const warlordTarget = warlordTargets.get(book.id)
    const sharedSelectionEntries = profiledCatalogueIds.has(book.id)
      ? (book.sharedSelectionEntries ?? []).map((entry) => {
          const readable = entry.type === 'unit' || entry.type === 'model' ? withReadableWargearOptions(entry) : entry
          const projected =
            entry.type === 'unit' || entry.type === 'model'
              ? withPrintedWeaponSwaps(withPrintedDefaultWargear(readable, rawIndex, book.id))
              : entry
          const equipped =
            readable === entry
              ? projected
              : { ...projected, selectionEntryGroups: projected.selectionEntryGroups?.filter((group) => group.name !== 'Weapon Options') }
          const eligible = groups ? withoutIneligibleGroups(equipped, groups) : equipped
          if (
            (entry.type !== 'unit' && entry.type !== 'model') ||
            !warlordTarget ||
            !entry.categoryLinks?.some((category) => category.name === 'Character') ||
            entry.entryLinks?.some((link) => link.name === 'Warlord')
          )
            return eligible
          return {
            ...eligible,
            entryLinks: [
              ...(eligible.entryLinks ?? []),
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
      : groups
        ? book.sharedSelectionEntries?.map((entry) => withInheritedGroups(entry, groups))
        : undefined
    const selectionEntries = groups
      ? book.selectionEntries?.map((entry) =>
          profiledCatalogueIds.has(book.id) ? withoutIneligibleGroups(entry, groups) : withInheritedGroups(entry, groups),
        )
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

    if (!generatedUnits.length && !detachment.length && !sharedSelectionEntries && !sharedSelectionEntryGroups && !selectionEntries)
      return file
    return {
      ...file,
      catalogue: {
        ...book,
        entryLinks: [...(book.entryLinks ?? []), ...generatedUnits],
        selectionEntries: [...detachment, ...(selectionEntries ?? book.selectionEntries ?? [])],
        ...(sharedSelectionEntries ? { sharedSelectionEntries } : {}),
        ...(sharedSelectionEntryGroups ? { sharedSelectionEntryGroups } : {}),
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
