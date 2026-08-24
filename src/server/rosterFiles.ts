import { version } from '../../package.json'
import { attachmentOf } from '../core/attach'
import { fromBattleBaseText } from '../core/battlebase'
import { nameOf } from '../core/catalogue'
import type { Selection } from '../core/evaluate'
import { fromNewRecruitText } from '../core/newRecruit'
import { defaultSelection } from '../core/expand'
import { buildUnit } from '../core/roster'
import { unitChoices, unitToggles } from '../core/unitChoices'
import { modelCountOf } from '../core/unitSize'
import { wargearOf } from '../core/wargear'
import { fromRosterXml } from '../core/rosz'
import type { TextRoster, TextRosterUnit } from '../core/textRoster'
import { toGwText } from '../core/gwText'
import type { UnitGroup } from '../core/unitGroups'
import { GAME_SIZES } from '../core/battle'
import { factionDisplayName } from './factionNames'
import { isDatasheetId, type LoadedCatalogue } from './catalogueIndex'
import { rosterDetachments } from './rosterDetachments'
import { parseXml, rosterXml } from './rosz'
import type { ExportRosterInput, ImportRosterInput } from './schemas'

const allSelections = (selection: Selection): Selection[] => [selection, ...(selection.selections ?? []).flatMap(allSelections)]

export function importRosterFile(data: ImportRosterInput, loaded: LoadedCatalogue) {
  const battleBase = fromBattleBaseText(data.file)
  if (battleBase) return { ...importTextRoster(battleBase, loaded), source: 'battlebase' as const }
  const newRecruit = fromNewRecruitText(data.file)
  if (newRecruit) return { ...importTextRoster(newRecruit, loaded), source: 'newrecruit' as const }
  const parsed = fromRosterXml(rosterXml(data.file), loaded.index, parseXml)
  const catalogueId = parsed.catalogueId && loaded.index.catalogues.has(parsed.catalogueId) ? parsed.catalogueId : null
  const detachment = catalogueId ? loaded.detachments.get(catalogueId) : undefined
  const flattened = parsed.selections.flatMap(allSelections)
  const detachmentIds =
    detachment?.options
      .flatMap((option) => {
        const at = flattened.findIndex((selection) => selection.id === option.id)
        return at < 0 ? [] : [{ id: option.id, at }]
      })
      .toSorted((left, right) => left.at - right.at)
      .map(({ id }) => id) ?? []
  // What the roster's detachments leave open is part of reading its units: an
  // enhancement group and the Warlord entry on a tank are both conditional on them.
  const detachmentSelections = catalogueId ? rosterDetachments(loaded, catalogueId, detachmentIds).selections : []
  const importedUnits: { selection: Selection; parent: number | null; catalogueId: string | null }[] = []
  const collectUnits = (selection: Selection, parent: number | null, forceCatalogueId: string | null) => {
    const isDatasheet = isDatasheetId(loaded.index, selection.id, forceCatalogueId)
    const at = isDatasheet ? importedUnits.push({ selection, parent, catalogueId: forceCatalogueId }) - 1 : parent
    for (const child of selection.selections ?? []) collectUnits(child, at, forceCatalogueId)
  }
  for (const force of parsed.forces) {
    for (const selection of force.selections) collectUnits(selection, null, force.catalogueId)
  }

  return {
    source: 'roster-file' as const,
    name: data.name ?? parsed.name,
    catalogueId,
    catalogueName: parsed.catalogueName,
    detachmentIds,
    units: importedUnits.map(({ selection, parent, catalogueId: forceCatalogueId }) => {
      const context = { primaryCatalogueId: catalogueId ?? undefined, roster: detachmentSelections }
      const decisions = unitChoices(selection.id, selection, loaded.index, context)
      const entry = loaded.index.definitions.get(selection.id)
      const attachedTo = parent !== null && entry && attachmentOf(entry, loaded.index) ? parent : undefined
      return {
        entryId: selection.id,
        catalogueId: forceCatalogueId ?? loaded.index.catalogueOf.get(selection.id),
        models: Math.max(1, modelCountOf(selection, loaded.index)),
        choices: Object.fromEntries(
          decisions.filter((choice) => choice.room === 1 && choice.chosen).map((choice) => [choice.key, choice.chosen]),
        ),
        spreads: Object.fromEntries(
          decisions
            .filter((choice) => choice.room > 1)
            .map((choice) => [choice.key, Object.fromEntries(choice.options.map((option) => [option.id, option.count]))]),
        ),
        toggles: Object.fromEntries(
          unitToggles(selection.id, selection, loaded.index, context).map((toggle) => [toggle.key, toggle.selected ? 1 : 0]),
        ),
        attachedTo,
      }
    }),
    unknown: parsed.unknown,
  }
}

const normalized = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\[\d+\]$/, '')
    .replaceAll(/[’‘]/g, "'")
const slug = (value: string) =>
  normalized(value)
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function importTextRoster(parsed: TextRoster, loaded: LoadedCatalogue) {
  const faction = loaded.factions.find((candidate) => {
    const names = [candidate.name, candidate.name.split(' - ').at(-1) ?? '']
    return names.some((name) => normalized(name) === normalized(parsed.faction))
  })
  if (!faction) {
    return { name: parsed.name, catalogueId: null, catalogueName: parsed.faction, detachmentIds: [], units: [], unknown: [parsed.faction] }
  }

  const detachmentName = parsed.detachment
  const detachments = detachmentName ? detachmentsNamed(detachmentName, loaded.detachments.get(faction.id)?.options ?? []) : []
  const unknown = detachments.length || !detachmentName ? [] : [detachmentName]
  const detachmentIds = detachments.map((detachment) => detachment.id)
  const detachmentSelections = rosterDetachments(loaded, faction.id, detachmentIds).selections
  const sourceToImported = new Map<number, number>()
  const units = parsed.units.flatMap((unit, sourceIndex) => {
    const entryId = [...(loaded.index.datasheets.get(faction.id) ?? [])].find((candidate) => {
      const definition = loaded.index.definitions.get(candidate)
      return definition && normalized(nameOf(definition, loaded.index.definitions)) === normalized(unit.name)
    })
    if (!entryId) {
      unknown.push(unit.name)
      return []
    }
    sourceToImported.set(sourceIndex, sourceToImported.size)
    return [textRosterPick(unit, entryId, faction.id, detachmentSelections, loaded)]
  })

  parsed.units.forEach((unit, sourceIndex) => {
    const importedAt = sourceToImported.get(sourceIndex)
    if (unit.leading && importedAt !== undefined && units[importedAt]) {
      const targetSource = parsed.units.findIndex((candidate) => normalized(candidate.name) === normalized(unit.leading ?? ''))
      const target = sourceToImported.get(targetSource)
      if (target !== undefined && units[target]) units[importedAt] = { ...units[importedAt], attachedTo: target }
    }
    if (unit.leader && importedAt !== undefined && units[importedAt]) {
      const leaderSource = parsed.units.findIndex((candidate) => normalized(candidate.name) === normalized(unit.leader ?? ''))
      const leader = sourceToImported.get(leaderSource)
      if (leader !== undefined && units[leader]) units[leader] = { ...units[leader], attachedTo: importedAt }
    }
  })

  return {
    name: parsed.name,
    catalogueId: faction.id,
    catalogueName: faction.name,
    detachmentIds,
    disposition: parsed.disposition && !parsed.disposition.includes(',') ? slug(parsed.disposition) : null,
    limit: parsed.limit,
    units,
    unknown,
  }
}

function detachmentsNamed<T extends { id: string; name: string }>(combined: string, options: readonly T[]): T[] {
  const candidates = options.toSorted((left, right) => normalized(right.name).length - normalized(left.name).length)
  const visit = (remaining: string, available: readonly T[]): T[] | null => {
    for (const candidate of available) {
      const name = normalized(candidate.name)
      if (remaining === name) return [candidate]
      for (const separator of [', and ', ' and ', ', ']) {
        if (!remaining.startsWith(name + separator)) continue
        const rest = visit(
          remaining.slice(name.length + separator.length),
          available.filter((option) => option.id !== candidate.id),
        )
        if (rest) return [candidate, ...rest]
      }
    }
    return null
  }
  return visit(normalized(combined), candidates) ?? []
}

function textRosterPick(unit: TextRosterUnit, entryId: string, catalogueId: string, roster: readonly Selection[], loaded: LoadedCatalogue) {
  const stated = new Map<string, number>()
  for (const selection of unit.selections) {
    const name = normalized(selection.name.replace(/^(?:Enhancement|Upgrade):\s*/i, ''))
    stated.set(name, (stated.get(name) ?? 0) + selection.count)
  }
  const requestedModels = unit.models ?? Math.max(1, ...unit.selections.map((selection) => selection.count))
  const context = { primaryCatalogueId: catalogueId, roster }
  const built = buildUnit(entryId, loaded.index, requestedModels, {}, context)
  const selection = built?.selection ?? { id: entryId, count: 1 }
  const choices = unitChoices(entryId, selection, loaded.index, context)
  const toggles = Object.fromEntries(
    unitToggles(entryId, selection, loaded.index, context).map((toggle) => [toggle.key, unit.warlord ? 1 : 0]),
  )
  const statedChoiceCounts = new Map(choices.map((choice) => [choice.key, countsForChoice(choice.options, stated, loaded, context)]))
  return {
    entryId,
    catalogueId,
    models: built?.size.models ?? 1,
    choices: Object.fromEntries(
      choices
        .filter((choice) => choice.room === 1)
        .map((choice) => [
          choice.key,
          choice.options.find((option) => statedChoiceCounts.get(choice.key)?.has(option.id))?.id ?? choice.chosen,
        ])
        .filter(([, chosen]) => Boolean(chosen)),
    ),
    spreads: Object.fromEntries(
      choices
        .filter((choice) => choice.room > 1)
        .map((choice) => {
          const counts = statedChoiceCounts.get(choice.key) ?? new Map<string, number>()
          const explicit = counts.size > 0
          return [
            choice.key,
            Object.fromEntries(choice.options.map((option) => [option.id, counts.get(option.id) ?? (explicit ? 0 : option.count)])),
          ]
        }),
    ),
    toggles,
    attachedTo: undefined as number | undefined,
  }
}

function countsForChoice(
  options: readonly { id: string; name: string }[],
  stated: ReadonlyMap<string, number>,
  loaded: LoadedCatalogue,
  context: { primaryCatalogueId: string; roster: readonly Selection[] },
) {
  const aliases = new Map(
    options.map((option) => {
      const selection = defaultSelection(option.id, loaded.index, context)
      const names = [option.name, ...(selection ? wargearOf(selection, loaded.index).map((piece) => piece.name) : [])]
      return [option.id, new Set(names.map(normalized))]
    }),
  )
  const owners = new Map<string, number>()
  for (const names of aliases.values()) for (const name of names) owners.set(name, (owners.get(name) ?? 0) + 1)

  const distinctiveCounts = new Map<string, number>()
  for (const option of options) {
    const distinctive = [...(aliases.get(option.id) ?? [])]
      .filter((name) => owners.get(name) === 1)
      .map((name) => stated.get(name))
      .filter((count): count is number => count !== undefined)
    if (distinctive.length) distinctiveCounts.set(option.id, Math.max(...distinctive))
  }
  if (distinctiveCounts.size) return distinctiveCounts

  return new Map(
    options.flatMap((option) => {
      const count = stated.get(normalized(option.name))
      return count === undefined ? [] : [[option.id, count]]
    }),
  )
}

export function exportRosterFile(
  data: ExportRosterInput,
  loaded: LoadedCatalogue,
  priced: {
    points: number
    disposition: string | null
    detachments: { name: string; points: number | null }[]
    units: {
      name: string
      points: number
      group: UnitGroup
      enhancements: string[]
      wargear: { name: string; count: number }[]
    }[]
  },
  dispositionName: string | null,
) {
  const faction = loaded.index.catalogues.get(data.catalogueId)?.name ?? data.catalogueId
  return {
    text: toGwText(
      {
        name: data.name,
        faction: factionDisplayName(faction),
        detachments: priced.detachments,
        disposition: dispositionName,
        size: GAME_SIZES.find((size) => size.limit === data.limit)?.name ?? 'Battle',
        limit: data.limit,
        points: priced.points,
        units: priced.units.map((unit, index) => ({
          ...unit,
          group: exportGroup(unit.group),
          warlord: Object.values(data.units[index]?.toggles ?? {}).some((count) => count > 0),
        })),
      },
      version,
    ),
  }
}

function exportGroup(group: UnitGroup): 'character' | 'battleline' | 'transport' | 'other' {
  if (group === 'epic-hero' || group === 'character') return 'character'
  if (group === 'battleline' || group === 'transport') return group
  return 'other'
}
