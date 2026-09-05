import { version } from '../../package.json'
import type { Attachment } from '../core/attach'
import { attachmentRows } from '../core/attachmentRows'
import { fromBattleBaseText } from '../core/battlebase'
import { nameOf } from '../core/catalogue'
import type { Selection } from '../core/evaluate'
import { fromNewRecruitText } from '../core/newRecruit'
import { defaultSelection } from '../core/expand'
import { buildUnit } from '../core/roster'
import { unitChoices, unitToggles } from '../core/unitChoices'
import { wargearOf } from '../core/wargear'
import type { TextRoster, TextRosterUnit } from '../core/textRoster'
import { toGwText } from '../core/gwText'
import type { UnitGroup } from '../core/unitGroups'
import { GAME_SIZES } from '../core/battle'
import { factionDisplayName } from './factionNames'
import {
  attachmentReason,
  normalized,
  type UnmatchedName,
  unmatchedDatasheetReason,
  unmatchedDetachmentReason,
  unmatchedFactionReason,
  type UnplacedChoice,
  unplacedChoiceReason,
  squadSizeReason,
  WARLORD_REASON,
} from './importMismatch'
import type { LoadedCatalogue } from './catalogueIndex'
import { rosterDetachments } from './rosterDetachments'
import type { ExportRosterInput, ImportRosterInput } from './schemas'

export function importRosterFile(data: ImportRosterInput, loaded: LoadedCatalogue) {
  const battleBase = fromBattleBaseText(data.file)
  if (battleBase) {
    const source = /Exported with Praetorium\.gg/i.test(data.file) ? ('praetorium' as const) : ('battlebase' as const)
    return { ...importTextRoster(battleBase, loaded), source }
  }
  const newRecruit = fromNewRecruitText(data.file)
  if (newRecruit) return { ...importTextRoster(newRecruit, loaded), source: 'newrecruit' as const }
  return {
    name: 'Imported list',
    catalogueId: null,
    catalogueName: null,
    detachmentIds: [],
    units: [],
    unknown: [{ name: 'the pasted text', reason: 'it is not an export from Praetorium, BattleBase or New Recruit' }],
    unplaced: [],
    source: null,
  }
}

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
    return {
      name: parsed.name,
      catalogueId: null,
      catalogueName: parsed.faction,
      detachmentIds: [],
      units: [],
      unknown: [{ name: parsed.faction, reason: unmatchedFactionReason(parsed.faction, loaded) }],
      unplaced: [],
    }
  }

  const detachmentName = parsed.detachment
  const detachments = detachmentName ? detachmentsNamed(detachmentName, loaded.detachments.get(faction.id)?.options ?? []) : []
  const unknown: UnmatchedName[] =
    detachments.length || !detachmentName
      ? []
      : [{ name: detachmentName, reason: unmatchedDetachmentReason(detachmentName, faction.id, loaded) }]
  const detachmentIds = detachments.map((detachment) => detachment.id)
  const detachmentSelections = rosterDetachments(loaded, faction.id, detachmentIds).selections
  const sourceToImported = new Map<number, number>()
  const unplaced = new Map<string, { unit: string; choices: Map<string, string> }>()
  const units = parsed.units.flatMap((unit, sourceIndex) => {
    const entryId = [...(loaded.index.datasheets.get(faction.id) ?? [])].find((candidate) => {
      const definition = loaded.index.definitions.get(candidate)
      return definition && normalized(nameOf(definition, loaded.index.definitions)) === normalized(unit.name)
    })
    if (!entryId) {
      unknown.push({ name: unit.name, reason: unmatchedDatasheetReason(unit.name, faction.id, loaded) })
      return []
    }
    sourceToImported.set(sourceIndex, sourceToImported.size)
    const read = textRosterPick(unit, entryId, faction.id, detachmentIds, detachmentSelections, loaded)
    if (read.unplaced.length) note(unplaced, entryId, unit.name, read.unplaced)
    return [read.pick]
  })

  attachTextUnits(parsed.units, units, sourceToImported)
  // Read after the pairing, because who leads whom is settled across the whole list
  // rather than inside one unit. Only the leader's own line is checked: both exporters
  // print the attachment from both ends, so reading both would say it twice.
  const importedNames = new Set([...sourceToImported.keys()].map((source) => normalized(parsed.units[source]!.name)))
  for (const [source, imported] of sourceToImported) {
    const unit = parsed.units[source]!
    const pick = units[imported]
    if (!unit.leading || !pick || pick.attachedTo !== undefined) continue
    note(unplaced, pick.entryId, unit.name, [
      { name: `Leading ${unit.leading}`, reason: attachmentReason(unit.leading, importedNames.has(normalized(unit.leading))) },
    ])
  }

  return {
    name: parsed.name,
    catalogueId: faction.id,
    catalogueName: faction.name,
    detachmentIds,
    disposition: parsed.disposition && !parsed.disposition.includes(',') ? slug(parsed.disposition) : null,
    limit: parsed.limit,
    units,
    unknown,
    unplaced: [...unplaced].map(([entryId, found]) => ({
      unit: found.unit,
      entryId,
      choices: [...found.choices].map(([name, reason]) => ({ name, reason })),
    })),
  }
}

/** One row per datasheet however many copies of it a list holds: the same gap is one thing to go and fix. */
function note(
  found: Map<string, { unit: string; choices: Map<string, string> }>,
  entryId: string,
  unit: string,
  choices: readonly UnplacedChoice[],
) {
  const named = found.get(entryId) ?? { unit, choices: new Map<string, string>() }
  for (const choice of choices) named.choices.set(choice.name, choice.reason)
  found.set(entryId, named)
}

function attachTextUnits(units: readonly TextRosterUnit[], picks: { attachedTo?: number }[], imported: ReadonlyMap<number, number>) {
  const importedSources = units.flatMap((_, source) => (imported.has(source) ? [source] : []))
  const sourceOccurrences = new Map<string, number>()
  for (const source of importedSources) {
    const unit = units[source]!
    if (!unit.leading) continue
    const sourceName = normalized(unit.name)
    const targetName = normalized(unit.leading)
    const key = `${sourceName}\0${targetName}`
    const occurrence = sourceOccurrences.get(key) ?? 0
    sourceOccurrences.set(key, occurrence + 1)
    const named = importedSources.filter((candidate) => normalized(units[candidate]!.name) === targetName)
    const confirmed = named.filter((candidate) => normalized(units[candidate]!.leader ?? '') === sourceName)
    const target = imported.get(confirmed[occurrence] ?? named[occurrence] ?? -1)
    const pick = picks[imported.get(source) ?? -1]
    if (pick && target !== undefined) pick.attachedTo = target
  }

  const targetOccurrences = new Map<string, number>()
  for (const target of importedSources) {
    const unit = units[target]!
    if (!unit.leader) continue
    const targetName = normalized(unit.name)
    const sourceName = normalized(unit.leader)
    const key = `${targetName}\0${sourceName}`
    const occurrence = targetOccurrences.get(key) ?? 0
    targetOccurrences.set(key, occurrence + 1)
    const named = importedSources.filter((candidate) => normalized(units[candidate]!.name) === sourceName)
    const confirmed = named.filter((candidate) => normalized(units[candidate]!.leading ?? '') === targetName)
    const source = imported.get(confirmed[occurrence] ?? named[occurrence] ?? -1)
    const pick = picks[source ?? -1]
    const host = imported.get(target)
    if (pick && pick.attachedTo === undefined && host !== undefined) pick.attachedTo = host
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

function textRosterPick(
  unit: TextRosterUnit,
  entryId: string,
  catalogueId: string,
  detachmentIds: readonly string[],
  roster: readonly Selection[],
  loaded: LoadedCatalogue,
) {
  const stated = new Map<string, number>()
  const labels = new Map<string, string>()
  for (const selection of unit.selections) {
    const label = selection.name.replace(/^(?:Enhancement|Upgrade):\s*/i, '').trim()
    const name = normalized(label)
    stated.set(name, (stated.get(name) ?? 0) + selection.count)
    if (!labels.has(name)) labels.set(name, label)
  }
  const requestedModels = unit.models ?? Math.max(1, ...unit.selections.map((selection) => selection.count))
  const context = { primaryCatalogueId: catalogueId, roster }
  const built = buildUnit(entryId, loaded.index, requestedModels, {}, context)
  const selection = built?.selection ?? { id: entryId, count: 1 }
  const choices = unitChoices(entryId, selection, loaded.index, context)
  const toggles = Object.fromEntries(
    unitToggles(entryId, selection, loaded.index, context).map((toggle) => [toggle.key, unit.warlord ? 1 : 0]),
  )
  const aliases = choices.map((choice) => optionAliases(choice.options, loaded, context))
  const statedChoiceCounts = new Map(choices.map((choice, at) => [choice.key, countsForChoice(choice.options, aliases[at]!, stated)]))
  const placed = placeableNames(selection, aliases, unit.name, loaded)
  const pick = {
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

  const unplaced = [...stated.keys()]
    .filter((name) => !placed.has(name))
    .map((name) => ({
      name: labels.get(name) ?? name,
      reason: unplacedChoiceReason(labels.get(name) ?? name, { loaded, catalogueId, detachmentIds }),
    }))
  // A crown this datasheet cannot wear, and a squad size it does not field, are both
  // choices the list states and this build could not take. Only a stated size counts:
  // an export that prints no model count leaves one to be inferred from its weapons.
  if (unit.warlord && !Object.keys(toggles).length) unplaced.push({ name: 'Warlord', reason: WARLORD_REASON })
  if (unit.models && built && built.size.models !== unit.models) {
    unplaced.push({ name: `${unit.models} models`, reason: squadSizeReason(built.size) })
  }
  return { pick, unplaced }
}

/** Each option under every name a list could call it by: its own, and the wargear taking it brings. */
function optionAliases(
  options: readonly { id: string; name: string }[],
  loaded: LoadedCatalogue,
  context: { primaryCatalogueId: string; roster: readonly Selection[] },
) {
  return new Map(
    options.map((option) => {
      const selection = defaultSelection(option.id, loaded.index, context)
      const names = [option.name, ...(selection ? wargearOf(selection, loaded.index).map((piece) => piece.name) : [])]
      return [option.id, new Set(names.map(normalized))]
    }),
  )
}

/**
 * Every name this unit can answer to: the models and equipment it holds, and every
 * option it is still offered.
 *
 * A stated name outside this set is one the import cannot place anywhere, which is
 * worth saying rather than quietly leaving the datasheet's default in its place.
 */
function placeableNames(
  selection: Selection,
  aliases: readonly ReadonlyMap<string, Set<string>>[],
  unitName: string,
  loaded: LoadedCatalogue,
) {
  const names = new Set([normalized(unitName)])
  for (const choice of aliases) for (const option of choice.values()) for (const name of option) names.add(name)
  for (const piece of wargearOf(selection, loaded.index)) names.add(normalized(piece.name))
  const walk = (node: Selection) => {
    const definition = loaded.index.definitions.get(node.id)
    if (definition) names.add(normalized(nameOf(definition, loaded.index.definitions)))
    for (const child of node.selections ?? []) walk(child)
  }
  walk(selection)
  return names
}

function countsForChoice(
  options: readonly { id: string; name: string }[],
  aliases: ReadonlyMap<string, Set<string>>,
  stated: ReadonlyMap<string, number>,
) {
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
      key: number
      name: string
      points: number
      group: UnitGroup
      attachment: Attachment | null
      enhancements: string[]
      upgrades: string[]
      wargear: { name: string; count: number }[]
    }[]
  },
  dispositionNames: string[],
) {
  const faction = loaded.index.catalogues.get(data.catalogueId)?.name ?? data.catalogueId
  const keyedPicks = data.units.map((pick, key) => ({ ...pick, key }))
  const unitsByPick = data.units.map((_, index) => priced.units.find((unit) => unit.key === index))
  return {
    text: toGwText(
      {
        name: data.name,
        faction: factionDisplayName(faction),
        detachments: priced.detachments,
        dispositions: dispositionNames,
        size: GAME_SIZES.find((size) => size.limit === data.limit)?.name ?? 'Battle',
        limit: data.limit,
        points: priced.points,
        units: priced.units.map((unit) => ({
          ...unit,
          group: exportGroup(unit.group),
          warlord: Object.values(data.units[unit.key]?.toggles ?? {}).some((count) => count > 0),
          joined: attachmentRows(keyedPicks, unitsByPick, unit.key).map(({ label, name }) => ({ label, name })),
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
