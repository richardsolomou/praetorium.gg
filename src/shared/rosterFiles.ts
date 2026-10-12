import { version } from '../../package.json'
import type { Attachment } from '../core/attach'
import { attachmentRows } from '../core/attachmentRows'
import { fromBattleBaseText } from '../core/battlebase'
import { nameOf } from '../core/catalogue'
import type { Selection } from '../core/evaluate'
import { fromNewRecruitText, toCompactText } from '../core/newRecruit'
import { defaultSelection } from '../core/expand'
import { buildUnit } from '../core/roster'
import { unitChoices, unitToggles } from '../core/unitChoices'
import { wargearOf } from '../core/wargear'
import type { TextRoster, TextRosterUnit } from '../core/textRoster'
import { toGwText, type GwTextRoster } from '../core/gwText'
import type { UnitGroup } from '../core/unitGroups'
import { allowsPointsBudget, customPointsBudget, GAME_SIZES, pointsBudgetError } from '../core/battle'
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
import { importRosterSchema, type ExportRosterInput, type ImportRosterInput } from '../contracts/schemas'
import { editionLabel } from '../core/catalogueEdition'
import { calculateRosterPrice } from './pricing'
import type { LoadedRules } from './rules'
import type { RosterExchange } from '../core/rosterExchange'
import type { RosterPick } from '../core/roster'

function parsedImport(file: string) {
  const newRecruit = fromNewRecruitText(file)
  if (newRecruit)
    return { parsed: newRecruit, source: /Exported with Praetorium\.gg/i.test(file) ? ('praetorium' as const) : ('newrecruit' as const) }
  const battleBase = fromBattleBaseText(file)
  if (battleBase)
    return {
      parsed: battleBase,
      source: /Exported with Praetorium\.gg/i.test(file)
        ? ('praetorium' as const)
        : /Exported with BattleBase/i.test(file)
          ? ('battlebase' as const)
          : ('roster-file' as const),
    }
  return null
}

export function importRosterFaction(file: string) {
  return parsedImport(file)?.parsed.faction ?? null
}

export function importRosterCatalogueId(file: string) {
  return /^Ruleset: ((?:[a-z0-9-]{1,20}~)?[^\s~]{1,40})$/m.exec(file.replaceAll('\r', ''))?.[1] ?? null
}

export function matchesImportFaction(stated: string, name: string) {
  return [name, name.split(' - ').at(-1) ?? ''].some((candidate) => normalized(candidate) === normalized(stated))
}

export function importRosterFile(
  data: ImportRosterInput,
  loaded: LoadedCatalogue | null,
  factionNames = loaded?.factions.map((faction) => faction.name) ?? [],
  rules: LoadedRules | null = null,
) {
  importRosterSchema.parse(data)
  const found = parsedImport(data.file)
  if (found) {
    if (found.parsed.units.length > 100) throw new Error('An imported roster can contain at most 100 entries.')
    const result = importTextRoster(found.parsed, loaded, factionNames)
    const currentPoints = result.catalogueId
      ? (calculateRosterPrice(
          {
            catalogueId: result.catalogueId,
            detachmentIds: result.detachmentIds,
            disposition: 'disposition' in result ? (result.disposition ?? null) : null,
            limit: 'limit' in result ? (result.limit ?? 2000) : 2000,
            units: result.units,
          },
          loaded,
          rules,
        )?.points ?? null)
      : null
    return {
      ...result,
      source: found.source,
      reportedPoints: found.parsed.reportedPoints ?? null,
      currentPoints,
      sourceUnitCount: found.parsed.units.length,
    }
  }
  return {
    name: 'Imported list',
    catalogueId: null,
    catalogueName: null,
    detachmentIds: [],
    units: [],
    unknown: [{ name: 'the pasted text', reason: 'it is not a supported army-text export' }],
    unplaced: [],
    source: null,
    reportedPoints: null,
    currentPoints: null,
    sourceUnitCount: 0,
  }
}

/**
 * An exchange code's roster, checked against the rules version it names.
 *
 * Entries and detachments that version no longer resolves are left out with a reason,
 * and attachments to a left-out entry are dropped, so the review accounts for each one.
 */
export function importRosterExchange(exchange: RosterExchange, loaded: LoadedCatalogue, rules: LoadedRules | null, factionName: string) {
  const unknown: UnmatchedName[] = []
  const offered = new Set((loaded.detachments.get(exchange.catalogueId)?.options ?? []).map((option) => option.id))
  const detachmentIds = exchange.detachmentIds.filter((id) => {
    if (offered.has(id)) return true
    unknown.push({ name: `Detachment ${id}`, reason: 'this rules version no longer offers it' })
    return false
  })
  const roster = { ...exchange, detachmentIds, units: exchange.picks }
  const resolved = new Set(calculateRosterPrice(roster, loaded, rules)?.units.map((unit) => unit.key) ?? [])
  const name = (pick: RosterPick, at: number) => {
    const definition = loaded.index.definitions.get(pick.entryId)
    return definition ? `${nameOf(definition, loaded.index.definitions)} (entry ${at + 1})` : `Entry ${at + 1}`
  }
  const kept = exchange.picks.flatMap((pick, at) => {
    if (resolved.has(at)) return [{ pick, at }]
    unknown.push({ name: name(pick, at), reason: 'this datasheet is not in the selected rules version' })
    return []
  })
  const position = new Map(kept.map(({ at }, next) => [at, next]))
  const unplaced: UnplacedChoices[] = []
  const units = kept.map(({ pick, at }) => {
    const { attachedTo, ...rest } = pick
    if (attachedTo === undefined) return rest
    const host = position.get(attachedTo)
    if (host !== undefined) return { ...rest, attachedTo: host }
    unplaced.push({
      unit: name(pick, at),
      choices: [{ name: `Attached to entry ${attachedTo + 1}`, reason: 'that entry is not imported' }],
    })
    return rest
  })
  const priced = calculateRosterPrice({ ...roster, units }, loaded, rules)
  return {
    name: exchange.name,
    catalogueId: exchange.catalogueId,
    catalogueName: factionName,
    detachmentIds,
    disposition: exchange.disposition,
    borrowedDetachmentId: exchange.borrowedDetachmentId,
    limit: exchange.limit,
    pointsBudget: exchange.pointsBudget ?? null,
    waivedRules: exchange.waivedRules,
    optionalRules: exchange.optionalRules,
    units,
    unknown,
    unplaced,
    source: 'praetorium' as const,
    reportedPoints: exchange.points,
    currentPoints: priced?.points ?? null,
    sourceUnitCount: exchange.picks.length,
  }
}

/** Choices a list states that its unit could not be given, named back per unit with why. */
export type UnplacedChoices = { unit: string; choices: UnplacedChoice[] }

const slug = (value: string) =>
  normalized(value)
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function importTextRoster(parsed: TextRoster, loaded: LoadedCatalogue | null, factionNames: readonly string[]) {
  const faction = loaded?.factions.find((candidate) => matchesImportFaction(parsed.faction, candidate.name))
  if (!loaded || !faction) {
    return {
      name: parsed.name,
      catalogueId: null,
      catalogueName: parsed.faction,
      detachmentIds: [],
      units: [],
      unknown: [{ name: parsed.faction, reason: unmatchedFactionReason(parsed.faction, factionNames) }],
      unplaced: [],
    }
  }

  const detachmentName = parsed.detachment
  const detachments = detachmentName ? detachmentsNamed(detachmentName, loaded.detachments.get(faction.id)?.options ?? []) : []
  const unknown: UnmatchedName[] =
    detachments.length || !detachmentName
      ? []
      : [{ name: detachmentName, reason: unmatchedDetachmentReason(detachmentName, faction.id, loaded) }]
  for (const line of parsed.unread ?? []) unknown.push({ name: line, reason: 'this line is not understood by the text importer' })
  const detachmentIds = detachments.map((detachment) => detachment.id)
  const detachmentSelections = rosterDetachments(loaded, faction.id, detachmentIds).selections
  const sourceToImported = new Map<number, number>()
  const unplaced = new Map<number, Map<string, string>>()
  const label = (unit: TextRosterUnit, at: number) =>
    parsed.units.filter((other) => normalized(other.name) === normalized(unit.name)).length > 1
      ? `${unit.name} (entry ${at + 1})`
      : unit.name
  const units = parsed.units.flatMap((unit, sourceIndex) => {
    const entryId = [...(loaded.index.datasheets.get(faction.id) ?? [])].find((candidate) => {
      const definition = loaded.index.definitions.get(candidate)
      return definition && normalized(nameOf(definition, loaded.index.definitions)) === normalized(unit.name)
    })
    if (!entryId) {
      unknown.push({ name: label(unit, sourceIndex), reason: unmatchedDatasheetReason(unit.name, faction.id, loaded) })
      return []
    }
    sourceToImported.set(sourceIndex, sourceToImported.size)
    const read = textRosterPick(unit, entryId, faction.id, detachmentIds, detachmentSelections, loaded)
    if (read.unplaced.length) note(unplaced, sourceIndex, read.unplaced)
    return [read.pick]
  })

  attachTextUnits(parsed.units, units, sourceToImported)
  // Omitted units shift saved positions, so attachments are resolved after matching.
  const importedNames = new Set([...sourceToImported.keys()].map((source) => normalized(parsed.units[source]!.name)))
  for (const [source, imported] of sourceToImported) {
    const unit = parsed.units[source]!
    if (units[imported]?.attachedTo !== undefined) continue
    if (unit.attachedToEntry !== undefined) {
      note(unplaced, source, [
        { name: `Attached to entry ${unit.attachedToEntry}`, reason: 'the attachment does not identify exactly one other matched entry' },
      ])
      continue
    }
    if (!unit.leading) continue
    note(unplaced, source, [
      { name: `Leading ${unit.leading}`, reason: attachmentReason(unit.leading, importedNames.has(normalized(unit.leading))) },
    ])
  }

  const { limit, pointsBudget } = importedBattleSize(parsed, unknown)
  if (parsed.disposition?.includes(','))
    unknown.push({ name: parsed.disposition, reason: 'more than one force disposition was stated; choose one in setup' })

  return {
    name: parsed.name,
    catalogueId: faction.id,
    catalogueName: faction.name,
    detachmentIds,
    disposition: parsed.disposition && !parsed.disposition.includes(',') ? slug(parsed.disposition) : null,
    limit,
    pointsBudget,
    units,
    unknown,
    unplaced: [...unplaced].map(([at, choices]) => ({
      unit: label(parsed.units[at]!, at),
      choices: [...choices].map(([name, reason]) => ({ name, reason })),
    })),
  }
}

/**
 * The battle size a text states, and a custom points budget when it names a size beside other points.
 *
 * Points alone only ever choose a size whose total they equal, so an unnamed number is
 * never guessed into a format.
 */
function importedBattleSize(parsed: TextRoster, unknown: UnmatchedName[]): { limit: number | null; pointsBudget: number | null } {
  if (parsed.limit === null) return { limit: null, pointsBudget: null }
  const named = GAME_SIZES.find((size) => normalized(size.name) === normalized(parsed.sizeName ?? ''))
  if (named && allowsPointsBudget(named.limit)) {
    const error = pointsBudgetError(named.limit, parsed.limit)
    if (!error) return { limit: named.limit, pointsBudget: customPointsBudget(named.limit, parsed.limit) }
    unknown.push({
      name: `${named.name} at ${parsed.limit} points`,
      reason: `${error} It is imported at the standard ${named.limit} points.`,
    })
    return { limit: named.limit, pointsBudget: null }
  }
  if (GAME_SIZES.some((size) => size.limit === parsed.limit)) return { limit: parsed.limit, pointsBudget: null }
  unknown.push({
    name: `${parsed.limit} point battle size`,
    reason: 'this battle size is not supported; choose a supported size in setup',
  })
  return { limit: null, pointsBudget: null }
}

function note(found: Map<number, Map<string, string>>, unit: number, choices: readonly UnplacedChoice[]) {
  const named = found.get(unit) ?? new Map<string, string>()
  for (const choice of choices) named.set(choice.name, choice.reason)
  found.set(unit, named)
}

function attachTextUnits(units: readonly TextRosterUnit[], picks: { attachedTo?: number }[], imported: ReadonlyMap<number, number>) {
  const importedSources = units.flatMap((_, source) => (imported.has(source) ? [source] : []))
  for (const source of importedSources) {
    const unit = units[source]!
    if (unit.attachedToEntry === undefined) continue
    const targets = importedSources.filter((candidate) => units[candidate]!.entry === unit.attachedToEntry)
    const pick = picks[imported.get(source)!]
    if (targets.length === 1 && targets[0] !== source && pick) pick.attachedTo = imported.get(targets[0]!)
  }
  const sourceOccurrences = new Map<string, number>()
  for (const source of importedSources) {
    const unit = units[source]!
    if (!unit.leading || unit.attachedToEntry !== undefined) continue
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
    const sourceAt = confirmed[occurrence] ?? named[occurrence] ?? -1
    const source = imported.get(sourceAt)
    const pick = picks[source ?? -1]
    const host = imported.get(target)
    if (pick && units[sourceAt]?.attachedToEntry === undefined && pick.attachedTo === undefined && host !== undefined)
      pick.attachedTo = host
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
  for (const line of unit.unread ?? []) unplaced.push({ name: line, reason: 'this line is not understood by the text importer' })
  // A crown this datasheet cannot wear, and a squad size it does not field, are both
  // choices the list states and this build could not take. Only a stated size counts:
  // an export that prints no model count leaves one to be inferred from its weapons.
  if (unit.warlord && !Object.keys(toggles).length) unplaced.push({ name: 'Warlord', reason: WARLORD_REASON })
  if (unit.models !== undefined && unit.models !== null && built && built.size.models !== unit.models) {
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
      size: { models: number }
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
  const roster: GwTextRoster = {
    name: data.name,
    faction: factionDisplayName(faction),
    detachments: priced.detachments,
    dispositions: dispositionNames,
    size: GAME_SIZES.find((size) => size.limit === data.limit)?.name ?? 'Battle',
    limit: data.limit,
    ...(data.pointsBudget ? { pointsBudget: data.pointsBudget } : {}),
    points: priced.points,
    units: priced.units.map((unit) => ({
      ...unit,
      models: unit.size.models,
      entry: unit.key + 1,
      attachedToEntry: data.units[unit.key]?.attachedTo !== undefined ? data.units[unit.key]!.attachedTo! + 1 : undefined,
      group: exportGroup(unit.group),
      warlord: Object.values(data.units[unit.key]?.toggles ?? {}).some((count) => count > 0),
      joined: attachmentRows(keyedPicks, unitsByPick, unit.key).map(({ label, name }) => ({ label, name })),
    })),
  }
  const metadata = (loaded.edition ? `\nCodex: ${editionLabel(loaded.edition)}` : '') + `\nRuleset: ${data.catalogueId}\n`
  return {
    text: toGwText(roster, version) + metadata,
    compactText: toCompactText(roster, version) + metadata,
    name: data.name,
    omittedUnitCount: data.units.length - priced.units.length,
  }
}

function exportGroup(group: UnitGroup): 'character' | 'battleline' | 'transport' | 'other' {
  if (group === 'epic-hero' || group === 'character') return 'character'
  if (group === 'battleline' || group === 'transport') return group
  return 'other'
}
