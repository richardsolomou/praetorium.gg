import { countBy } from '../core/collections'
import { version } from '../../package.json'
import type { Attachment } from '../core/attach'
import { attachmentRows } from '../core/attachmentRows'
import { fromBattleBaseText } from '../core/battlebase'
import { type Definition, nameOf } from '../core/catalogue'
import { childrenOf, eachDefinition, isRosterToggle, modelProfileOf, resolve } from '../core/definitions'
import { detachmentNameVariants } from '../core/detachmentName'
import type { Selection } from '../core/evaluate'
import { fromNewRecruitText } from '../core/newRecruit'
import { normalizedNameVariants } from '../core/name'
import { fromListForgeText, fromListForgeWtcText } from '../core/listForge'
import { fromWarmindText } from '../core/warmind'
import { fromWtcText } from '../core/wtcText'
import type { RosterSource } from '../core/savedRoster'
import { defaultSelection } from '../core/expand'
import { buildUnit } from '../core/roster'
import { at as selectionAt } from '../core/selection'
import { unitChoices, unitToggles } from '../core/unitChoices'
import { wargearOf } from '../core/wargear'
import { textNickname, type TextRoster, type TextRosterUnit } from '../core/textRoster'
import { toGwText, type GwTextRoster } from '../core/gwText'
import type { UnitGroup } from '../core/unitGroups'
import { allowsPointsBudget, customPointsBudget, GAME_SIZES, isGameSize, pointsBudgetError } from '../core/battle'
import { catalogueFactionName, factionDisplayName } from './factionNames'
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
  DROPPED_REASON,
  WARLORD_REASON,
} from './importMismatch'
import { DISPOSITIONS, type LoadedCatalogue } from './catalogueIndex'
import { rosterDetachments } from './rosterDetachments'
import { importRosterSchema, type ExportRosterInput, type ImportRosterInput } from '../contracts/schemas'
import { editionLabel } from '../core/catalogueEdition'
import { calculateRosterPrice } from './pricing'
import type { LoadedRules } from './rules'
import type { RosterExchange } from '../core/rosterExchange'
import type { RosterPick } from '../core/roster'

/** Which tool or layout wrote an imported text, as `roster_imported` and `roster_import_failed` report it. */
type RosterTextFormat = 'praetorium' | 'newrecruit' | 'battlebase' | 'roster-file' | 'listforge' | 'listforge-wtc' | 'warmind' | 'wtc'

function parsedImport(file: string): { parsed: TextRoster; format: RosterTextFormat } | null {
  const praetorium = /Exported with Praetorium\.gg/i.test(file)
  const newRecruit = fromNewRecruitText(file)
  if (newRecruit && (newRecruit.units.length || praetorium)) return { parsed: newRecruit, format: praetorium ? 'praetorium' : 'newrecruit' }
  // New Recruit also writes the WTC header over the official app's unit layout.
  const wtc = fromWtcText(file)
  if (wtc) return { parsed: wtc, format: newRecruit ? 'newrecruit' : 'wtc' }
  if (newRecruit) return { parsed: newRecruit, format: 'newrecruit' }
  const warmind = fromWarmindText(file)
  if (warmind) return { parsed: warmind, format: 'warmind' }
  const listForge = fromListForgeText(file)
  if (listForge) return { parsed: listForge, format: 'listforge' }
  const listForgeWtc = fromListForgeWtcText(file)
  if (listForgeWtc) return { parsed: listForgeWtc, format: 'listforge-wtc' }
  const battleBase = fromBattleBaseText(file)
  if (battleBase)
    return {
      parsed: battleBase,
      format: praetorium ? 'praetorium' : /Exported with BattleBase/i.test(file) ? 'battlebase' : 'roster-file',
    }
  return null
}

/** The roster origin a format saves as; formats without one of their own save as a roster file. */
const savedSource = (format: RosterTextFormat): RosterSource =>
  format === 'praetorium' || format === 'newrecruit' || format === 'battlebase' ? format : 'roster-file'

/** The format of a pasted text, or `unrecognized` when no importer reads it. */
export function importRosterFormat(file: string): RosterTextFormat | 'unrecognized' {
  return parsedImport(file)?.format ?? 'unrecognized'
}

export function importRosterFaction(file: string) {
  return parsedImport(file)?.parsed.faction ?? null
}

export function importRosterCatalogueId(file: string) {
  return /^Ruleset: ((?:[a-z0-9-]{1,20}~)?[^\s~]{1,40})$/m.exec(file.replaceAll('\r', ''))?.[1] ?? null
}

/** Whether a text's faction names this book, by its own name or a faction keyword such as "Heretic Astartes". */
export function matchesImportFaction(stated: string, name: string) {
  const wanted = new Set([stated, catalogueFactionName(stated)].map(normalized))
  return [name, name.split(' - ').at(-1) ?? ''].some((candidate) => wanted.has(normalized(candidate)))
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
      source: savedSource(found.format),
      format: found.format,
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
    format: null,
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
    format: 'praetorium' as const,
    reportedPoints: exchange.points,
    currentPoints: priced?.points ?? null,
    sourceUnitCount: exchange.picks.length,
  }
}

/** Choices a list states that its unit could not be given, named back per unit with why. */
type UnplacedChoices = { unit: string; choices: UnplacedChoice[] }

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
  const disposition = importedDisposition(parsed.disposition, detachments, unknown)

  return {
    name: parsed.name,
    catalogueId: faction.id,
    catalogueName: faction.name,
    detachmentIds,
    disposition,
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

/** The stated force disposition, or its detachments' own when the text names it in another language. */
function importedDisposition(stated: string | null, detachments: readonly { disposition: string | null }[], unknown: UnmatchedName[]) {
  if (!stated) return null
  if (stated.includes(',')) {
    unknown.push({ name: stated, reason: 'more than one force disposition was stated; choose one in setup' })
    return null
  }
  if (DISPOSITIONS.has(slug(stated))) return slug(stated)
  const own = new Set(detachments.map((detachment) => detachment.disposition))
  const [only] = own
  if (own.size === 1 && only) return only
  unknown.push({ name: stated, reason: 'this force disposition is not recognised; choose one in setup' })
  return null
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
  if (isGameSize(parsed.limit)) return { limit: parsed.limit, pointsBudget: null }
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
      for (const name of new Set(detachmentNameVariants(candidate.name).map(normalized))) {
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
    }
    return null
  }
  return visit(normalized(combined), candidates) ?? []
}

const upgradeName = (name: string) => name.replace(/(?:\s+\((?:one per army|Upgrade)\))+$/i, '')
const nameVariants = (name: string) => normalizedNameVariants(normalized(name))
const modelLoadout = /\s+w\/\s*(.+)$/i
const modelAliases = (name: string) => [
  normalized(name),
  ...nameVariants(name.replace(modelLoadout, '').replace(/\s+(?:Squad|Sodality)$/i, '')),
]
// BSData prefixes weapons the official app does not, as its "Astartes Chainsword" and "Steed's savage claws" are the app's "Chainsword" and "Savage claws".
const spellingKey = (name: string) => name.replace(/^(?:astartes|\S+'s) /, '').replaceAll(' ', '')
// The official app prints some datasheets' power weapon as the sword or maul the model holds, as Bladeguard Veterans' "Master-crafted Power Sword".
const powerWeaponKey = (key: string) => key.replace(/power(?:sword|maul)/, 'powerweapon')
/** The kind of model a counted group fields, as "1 - 2 Gun Servitors" fields a "Gun Servitor", which the official app names it by. */
const groupKind = (name: string) => normalized(name).match(/^\d+(?:\s*-\s*\d+)?\s+(.+?)s?$/)?.[1]

function wargearCounts(selection: Selection, index: LoadedCatalogue['index']) {
  const counts = new Map<string, number>()
  for (const piece of wargearOf(selection, index))
    for (const name of nameVariants(piece.name)) counts.set(name, (counts.get(name) ?? 0) + piece.count)
  return counts
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
  const statedUnder = new Map<string, Map<string, number>>()
  const respelled = respelledNames(entryId, loaded.index)
  for (const selection of unit.selections) {
    const label = selection.name.replace(/^(?:Enhancements?|Upgrade):\s*(.+)$/i, (_, name: string) => upgradeName(name)).trim()
    const key = spellingKey(normalized(label))
    const name = (respelled.has(key) ? respelled.get(key) : respelled.get(powerWeaponKey(key))) ?? normalized(label)
    stated.set(name, (stated.get(name) ?? 0) + selection.count)
    if (!labels.has(name)) labels.set(name, label)
    if (!selection.model) continue
    const model = normalized(selection.model)
    const under = statedUnder.get(model) ?? new Map<string, number>()
    under.set(name, (under.get(name) ?? 0) + selection.count)
    statedUnder.set(model, under)
  }
  const models = modelNames(entryId, loaded.index)
  // The official app titles a model after its datasheet, as a "Thunderwolf Cavalry Pack Leader" the catalogue does not name;
  // a name the datasheet holds, as a "Piranha fusion blaster", is not one.
  const ownNames = nameVariants(unit.name)
  const namedForUnit = (name: string) => !respelled.has(spellingKey(name)) && ownNames.some((own) => name.startsWith(`${own} `))
  const statedModels = [...stated].reduce((total, [name, count]) => total + (models.has(name) || namedForUnit(name) ? count : 0), 0)
  // Model lines size the unit; without them, its most numerous wargear stands in.
  const requestedModels = unit.models ?? (statedModels || Math.max(1, ...unit.selections.map((selection) => selection.count)))
  const context = { primaryCatalogueId: catalogueId, roster }
  const built = buildUnit(entryId, loaded.index, requestedModels, {}, context)
  const warlordNames = warlordAliases(entryId, loaded.index)
  const warlord = unit.warlord || [...warlordNames].some((name) => stated.has(name))
  const pickFrom = (selection: Selection) => {
    const choices = unitChoices(entryId, selection, loaded.index, context)
    const toggles = Object.fromEntries(
      unitToggles(entryId, selection, loaded.index, context).map((toggle) => [toggle.key, warlord ? 1 : 0]),
    )
    const aliases = choices.map((choice) => optionAliases(choice.options, loaded, context))
    const held = wargearCounts(selection, loaded.index)
    // A choice on a model the list names, with its wargear listed beneath it, reads only those lines.
    const scopes = choices.map((choice) => {
      const path = choice.key.split('/')
      for (let depth = path.length - 1; depth >= 0; depth--) {
        const definition = loaded.index.definitions.get(path[depth]!)
        if (!definition || resolve(definition, loaded.index).type !== 'model') continue
        const names = [nameOf(definition, loaded.index.definitions), modelProfileOf(definition, loaded.index)]
        const under = names.flatMap((name) => statedUnder.get(normalized(name ?? '')) ?? [])[0]
        if (!under) break
        const model = selectionAt(selection, path.slice(0, depth + 1))
        const own = model ? wargearCounts(model, loaded.index) : new Map<string, number>()
        return { stated: under, held: own, scoped: true }
      }
      return { stated, held, scoped: false }
    })
    // Lines a scoped model claims are not also the rest of the unit's to choose from, as a Scout Sergeant's shotgun is not a Scout's.
    // A choice offering that model still reads them, as the master vox under "4x Tempestus Scion" says which Scion carries it.
    const claims = scopes.flatMap((scope, at) => (scope.scoped ? [{ key: choices[at]!.key, stated: scope.stated }] : []))
    scopes.forEach((scope, at) => {
      if (scope.scoped) return
      const { key, options } = choices[at]!
      const offered = (claim: { key: string }) => options.some((option) => claim.key.startsWith(`${key}/${option.id}/`))
      const unclaimed = new Map(stated)
      for (const under of new Set(claims.filter((claim) => !offered(claim)).map((claim) => claim.stated)))
        for (const [name, count] of under) {
          const left = (unclaimed.get(name) ?? 0) - count
          if (left > 0) unclaimed.set(name, left)
          else unclaimed.delete(name)
        }
      scope.stated = unclaimed
    })
    const statedChoiceCounts = new Map(
      choices.map((choice, at) => [choice.key, countsForChoice(choice, aliases[at]!, scopes[at]!.stated, scopes[at]!.held)]),
    )
    const offeredBy = countBy(
      aliases.flatMap((choice) => [...new Set([...choice.values()].flatMap((names) => [...names.keys()]))]),
      (name) => name,
    )
    // Models are counted even where only one may join, since choosing one would not place its body.
    const counted = (choice: (typeof choices)[number]) =>
      choice.room > 1 || choice.options.some((option) => isModel(option.id, loaded.index))
    const placed = new Set([...placeableNames(selection, aliases, models, unit.name, loaded), ...warlordNames])
    const fieldedKinds = new Set<string>()
    const spreadEntries = choices.filter(counted).flatMap((choice): [string, Record<string, number>][] => {
      const counts = statedChoiceCounts.get(choice.key) ?? new Map<string, number>()
      const explicit = counts.size > 0
      // A model the list does not count keeps the body a choice gave it: the cyclone
      // missile launcher brings its Terminator, and counting none would take it away.
      // A list naming every body in the group by kind, nested specialists included,
      // says what each model is: the rest are left out on purpose, and the weapons it
      // lists are no longer evidence of more bodies.
      if (choice.options.some((option) => isModel(option.id, loaded.index))) {
        const named = (option: { name: string }) => stated.get(normalized(option.name)) ?? 0
        const bodies = choices
          .filter((other) => other === choice || other.key.startsWith(`${choice.key}/`))
          .flatMap((other) => other.options)
          .filter((option) => isModel(option.id, loaded.index))
          .reduce((total, option) => total + named(option), 0)
        const groupNamed = groupKind(choice.name)
        const kindBodies = !bodies && groupNamed ? (stated.get(groupNamed) ?? 0) : 0
        const asked =
          bodies >= choice.room
            ? new Map(choice.options.map((option) => [option.id, named(option)]))
            : kindBodies
              ? kindCounts(choice.options, counts, kindBodies)
              : explicit
                ? counts
                : null
        if (kindBodies) fieldedKinds.add(groupNamed!)
        // The official app names a model by its kind alone, as an "Eradicator" for the Eradicator with Multi-melta its wargear marks.
        for (const variant of bodies >= choice.room ? choice.options : []) {
          const kind = normalized(variant.name.replace(/\s+(?:w\/|with)\s*.+$/i, ''))
          const base = choice.options.find((option) => option !== variant && normalized(option.name) === kind)
          if (!base || asked!.get(variant.id) || !counts.get(variant.id)) continue
          const moved = Math.min(counts.get(variant.id)!, asked!.get(base.id)!)
          asked!.set(base.id, asked!.get(base.id)! - moved)
          asked!.set(variant.id, moved)
        }
        return asked?.size ? [[choice.key, Object.fromEntries([...asked].map(([id, count]) => [id, Math.min(choice.room, count)]))]] : []
      }
      return [
        [
          choice.key,
          Object.fromEntries(
            choice.options.map((option) => [option.id, Math.min(choice.room, counts.get(option.id) ?? (explicit ? 0 : option.count))]),
          ),
        ],
      ]
    })
    // A weapon spread under a model the list leaves out would only bring that model back.
    const absent = spreadEntries.flatMap(([key, counts]) =>
      Object.entries(counts).flatMap(([id, count]) => (count === 0 && isModel(id, loaded.index) ? [`${key}/${id}/`] : [])),
    )
    // A piece the counted choices already place is not also another choice's to take,
    // except the default of a choice on the placed model itself, as a heavy weapon
    // Terminator's accursed weapon is the one its melee choice decides.
    const spreadPlaced = (within: string) => {
      const pieces = new Map<string, number>()
      for (const [key, counts] of spreadEntries) {
        const names = aliases[choices.findIndex((choice) => choice.key === key)]
        for (const [id, count] of Object.entries(counts)) {
          if (within.startsWith(`${key}/${id}/`)) continue
          for (const [name, each] of names?.get(id) ?? []) pieces.set(name, (pieces.get(name) ?? 0) + count * each)
        }
      }
      return pieces
    }
    const leftFor = (at: number, id: string) => {
      const pieces = spreadPlaced(choices[at]!.key)
      return [...(aliases[at]!.get(id) ?? [])].some(([name]) => (scopes[at]!.stated.get(name) ?? 0) > (pieces.get(name) ?? 0))
    }
    const pick = {
      entryId,
      catalogueId,
      models: built?.size.models ?? 1,
      choices: Object.fromEntries(
        choices.flatMap((choice, at) => {
          if (counted(choice)) return []
          // An optional choice takes nothing the list gives it no count for.
          const counts = [...(statedChoiceCounts.get(choice.key) ?? [])].filter(
            ([id, count]) => (!choice.optional || count > 0) && (count === 0 || leftFor(at, id)),
          )
          const chosen = singleChoice(choice.options, aliases[at]!, new Map(counts), scopes[at]!.stated, offeredBy) ?? choice.chosen
          return chosen ? [[choice.key, chosen]] : []
        }),
      ),
      spreads: Object.fromEntries(spreadEntries.filter(([key]) => !absent.some((prefix) => key.startsWith(prefix)))),
      toggles,
      attachedTo: undefined as number | undefined,
      ...(unit.nickname ? { nickname: unit.nickname } : {}),
    }
    return { pick, placed, fieldedKinds }
  }
  const first = pickFrom(built?.selection ?? { id: entryId, count: 1 })
  // Read again from the unit as first picked: a choice can open another, as a Trygon's
  // Character upgrade opens its enhancements, and a default the list swaps away no longer
  // accounts for what it states, as a Lord Commissar's power weapon taken for a power fist.
  const opened = buildUnit(entryId, loaded.index, first.pick.models, first.pick.choices, { ...context, spreads: first.pick.spreads })
  const { pick, placed, fieldedKinds } = opened ? pickFrom(opened.selection) : first
  const toggles = pick.toggles

  // Only the unit the pick builds says what was kept: an option the datasheet offers can
  // still be left off it, as a heavy weapon is when its model is not in the squad.
  const imported = buildUnit(entryId, loaded.index, pick.models, pick.choices, { ...context, spreads: pick.spreads })
  const carried = imported ? carriedNames(imported.selection, loaded.index) : new Set<string>()
  const unplaced = [...stated.keys()]
    .filter(
      (name) =>
        !isCarried(name, carried) &&
        !warlordNames.has(name) &&
        !namedForUnit(name) &&
        !fieldedKinds.has(name) &&
        name !== normalized(unit.name),
    )
    .map((name) => {
      const label = labels.get(name) ?? name
      const reason = placed.has(name) ? DROPPED_REASON : unplacedChoiceReason(label, { loaded, catalogueId, detachmentIds })
      return { name: label, reason }
    })
  for (const line of unit.unread ?? []) unplaced.push({ name: line, reason: 'this line is not understood by the text importer' })
  // A crown this datasheet cannot wear, and a squad size it does not field, are both
  // choices the list states and this build could not take. Only a stated size counts:
  // an export that prints no model count leaves one to be inferred from its weapons.
  if (warlord && !Object.keys(toggles).length) unplaced.push({ name: 'Warlord', reason: WARLORD_REASON })
  if (unit.models !== undefined && unit.models !== null && built && built.size.models !== unit.models) {
    unplaced.push({ name: `${unit.models} models`, reason: squadSizeReason(built.size) })
  }
  return { pick, unplaced }
}

/**
 * A group's options brought to the bodies the list states for it: those its wargear marks
 * keep their count, and the defaults it does not mark give way to them or make up the rest.
 * An option the group fields none of by default is not a default, so a group that fills
 * itself with a model outside its options, as Tempestus Aquilons do, keeps the rest there.
 */
function kindCounts(options: readonly { id: string; count: number }[], marked: ReadonlyMap<string, number>, bodies: number) {
  const counts = new Map(options.map((option) => [option.id, marked.get(option.id) ?? option.count]))
  const defaults = options
    .filter((option) => !marked.has(option.id) && option.count > 0)
    .toSorted((left, right) => right.count - left.count)
  let rest = bodies - [...counts.values()].reduce((total, count) => total + count, 0)
  for (const option of defaults) {
    const change = Math.max(rest, -counts.get(option.id)!)
    counts.set(option.id, counts.get(option.id)! + change)
    rest -= change
  }
  return counts
}

const isModel = (id: string, index: LoadedCatalogue['index']) => {
  const definition = index.definitions.get(id)
  return definition !== undefined && resolve(definition, index).type === 'model'
}

/** Every name a built unit holds something under, leaving out what it holds none of. */
function carriedNames(selection: Selection, index: LoadedCatalogue['index']) {
  const found = new Set<string>()
  const walk = (node: Selection) => {
    const definition = index.definitions.get(node.id)
    if (!definition || (node.count ?? 1) <= 0) return
    const target = resolve(definition, index)
    const profile = target.type === 'model' ? modelProfileOf(definition, index) : undefined
    // A datacard can name the weapons an entry's profiles hold, as Lady Malys's "Melee Weapons" holds a blade and a fan.
    const weapons =
      target.type === 'model'
        ? []
        : (target.profiles ?? []).flatMap((held) => held.name?.replace(/^➤\s*/, '').replace(/\s+-\s+.+$/, '') ?? [])
    // A group holds nothing itself, though it is often named after its default, as a Lord Commissar's "Power Weapon" holds a power fist.
    const names = target.type === undefined ? [] : [nameOf(definition, index.definitions), target.name, profile, ...weapons]
    for (const name of names) {
      if (!name) continue
      found.add(withoutArticle(name))
      found.add(withoutArticle(upgradeName(name.replace(modelLoadout, ''))))
      // A model named for what it carries, as a "Wulfen w/Death Totem", carries it.
      const loadout = target.type === 'model' ? name.match(modelLoadout)?.[1] : undefined
      if (loadout) found.add(withoutArticle(loadout))
      if (target.type === 'model') for (const alias of modelAliases(name)) found.add(withoutArticle(alias))
      else for (const alias of nameVariants(name)) found.add(withoutArticle(alias))
    }
    node.selections?.forEach(walk)
  }
  walk(selection)
  return found
}

const withoutArticle = (name: string) => normalized(name).replace(/^the /, '')

/** Whether a built unit holds a stated name, including Warmind's "Splinter Pistol and 1 Razorflail" for a loadout that holds both. */
function isCarried(name: string, carried: ReadonlySet<string>) {
  const parts = name.split(/\s+and\s+(?:\d+\s+)?/)
  return carried.has(withoutArticle(name)) || (parts.length > 1 && parts.every((part) => carried.has(withoutArticle(part))))
}

/**
 * Every kind of model a datasheet can field, by entry and stat-line name, so stated model lines size the squad.
 * Exporters can name a "Recon Trooper w/ Long-las" by the model alone.
 */
function modelNames(entryId: string, index: LoadedCatalogue['index']) {
  const names = new Set<string>()
  eachDefinition([entryId], index, (definition, target) => {
    const kind = groupKind(nameOf(definition, index.definitions))
    if (kind && childrenOf(target, index).some((child) => resolve(child.definition, index).type === 'model')) names.add(kind)
    if (target.type !== 'model') return
    for (const name of [nameOf(definition, index.definitions), modelProfileOf(definition, index)]) {
      if (!name) continue
      for (const alias of modelAliases(name)) names.add(alias)
    }
  })
  return names
}

/** A datasheet's names keyed by spellingKey, as BSData's "Relic Great Axe" is the app's "Relic Greataxe"; null where two collide. */
function respelledNames(entryId: string, index: LoadedCatalogue['index']) {
  const names = new Map<string, string | null>()
  eachDefinition([entryId], index, (definition, target) => {
    for (const name of new Set([nameOf(definition, index.definitions), target.name ?? ''].filter(Boolean).map(normalized))) {
      const key = spellingKey(name)
      names.set(key, names.has(key) && names.get(key) !== name ? null : name)
    }
  })
  return names
}

/** What a datasheet's Warlord entries are renamed to, such as "Militarum Tempestus Warlord", which exporters list as wargear. */
function warlordAliases(entryId: string, index: LoadedCatalogue['index']) {
  const names = new Set<string>()
  const seen = new Set<string>()
  const walk = (definition: Definition, inWarlord: boolean) => {
    if (seen.has(definition.id)) return
    seen.add(definition.id)
    const target = resolve(definition, index)
    const warlord = inWarlord || isRosterToggle(target.name ?? definition.name)
    if (warlord) {
      for (const modifier of definition.modifiers ?? []) {
        const unconditional = !modifier.conditions?.length && !modifier.conditionGroups?.length
        if (modifier.field === 'name' && modifier.type === 'set' && unconditional && typeof modifier.value === 'string') {
          names.add(normalized(modifier.value))
        }
      }
    }
    for (const child of childrenOf(target, index)) walk(child.definition, warlord)
  }
  const root = index.definitions.get(entryId)
  if (root) walk(root, false)
  return names
}

/** Each option under every name a list could call it by, its own and the wargear taking it brings, with how many one option holds. */
function optionAliases(
  options: readonly { id: string; name: string }[],
  loaded: LoadedCatalogue,
  context: { primaryCatalogueId: string; roster: readonly Selection[] },
) {
  return new Map(
    options.map((option) => {
      const selection = defaultSelection(option.id, loaded.index, context)
      // A model named for what it carries answers to it, as a "Battle Sister w/ Simulacrum Imperialis" is a "Simulacrum Imperialis".
      const loadout = isModel(option.id, loaded.index) ? option.name.match(modelLoadout)?.[1] : undefined
      const names = new Map([option.name, upgradeName(option.name), ...(loadout ? [loadout] : [])].map((name) => [normalized(name), 1]))
      for (const [name, count] of selection ? wargearCounts(selection, loaded.index) : []) names.set(name, count)
      // A loadout also answers to the swaps it holds, as a Watchmaster's plasma pistol is taken through "Laspistol and chainsword".
      if (!isModel(option.id, loaded.index)) {
        eachDefinition([option.id], loaded.index, (definition, target) => {
          if (target.type === undefined) return
          for (const name of nameVariants(nameOf(definition, loaded.index.definitions))) if (!names.has(name)) names.set(name, 1)
        })
      }
      return [option.id, names]
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
  aliases: readonly ReadonlyMap<string, ReadonlyMap<string, number>>[],
  models: ReadonlySet<string>,
  unitName: string,
  loaded: LoadedCatalogue,
) {
  const names = new Set([normalized(unitName), ...models])
  for (const choice of aliases) for (const option of choice.values()) for (const name of option.keys()) names.add(name)
  for (const piece of wargearOf(selection, loaded.index)) names.add(normalized(piece.name))
  const walk = (node: Selection) => {
    const definition = loaded.index.definitions.get(node.id)
    if (definition) names.add(normalized(nameOf(definition, loaded.index.definitions)))
    for (const child of node.selections ?? []) walk(child)
  }
  walk(selection)
  return names
}

/**
 * The option a one-pick choice takes. A name no other choice offers decides it, so a
 * hull lascannon is not read as one of the heavy bolters the sponsons account for.
 */
function singleChoice(
  options: readonly { id: string }[],
  aliases: ReadonlyMap<string, ReadonlyMap<string, number>>,
  counts: ReadonlyMap<string, number> | undefined,
  stated: ReadonlyMap<string, number>,
  offeredBy: ReadonlyMap<string, number>,
) {
  // A zero says the rest of the unit accounts for every one stated, as the squad's
  // splinter pistols do when only the leader's blast pistol is hers.
  const candidates = options.filter((option) => (counts?.get(option.id) ?? 0) > 0)
  const exclusive = candidates.find((option) =>
    [...(aliases.get(option.id)?.keys() ?? [])].some((name) => offeredBy.get(name) === 1 && stated.has(name)),
  )
  return (exclusive ?? candidates[0])?.id
}

function countsForChoice(
  { options, room }: { options: readonly { id: string; name: string; count: number }[]; room: number },
  aliases: ReadonlyMap<string, ReadonlyMap<string, number>>,
  stated: ReadonlyMap<string, number>,
  held: ReadonlyMap<string, number>,
) {
  const owners = countBy(
    [...aliases.values()].flatMap((names) => [...names.keys()]),
    (name) => name,
  )

  // The fewest any distinctive name allows: a lasgun the sergeant also carries is
  // stated for more models than took the option that brings one. What the rest of the
  // unit already carries is not this choice's to claim, so troopers' lasguns are not
  // vox-casters; a name nobody else carries says it best.
  const inChoice = (name: string) => options.reduce((total, option) => total + option.count * (aliases.get(option.id)?.get(name) ?? 0), 0)
  const distinctiveCounts = new Map<string, number>()
  for (const option of options) {
    const owned = [...(aliases.get(option.id) ?? [])]
      .filter(([name]) => owners.get(name) === 1 && stated.has(name))
      .map(([name, each]) => ({ elsewhere: Math.max(0, (held.get(name) ?? 0) - inChoice(name)), stated: stated.get(name)!, each }))
    const alone = owned.filter((name) => name.elsewhere === 0)
    const distinctive = (alone.length ? alone : owned).map(({ elsewhere, stated: count, each }) =>
      Math.ceil(Math.max(0, count - elsewhere) / Math.max(1, each)),
    )
    if (distinctive.length) distinctiveCounts.set(option.id, Math.min(...distinctive))
  }
  if (!distinctiveCounts.size)
    return new Map(
      options.flatMap((option) => {
        const count = stated.get(normalized(option.name))
        return count === undefined ? [] : [[option.id, count]]
      }),
    )

  // A name several options share can be left over once the distinctive ones are counted,
  // as a Raider list's meltaguns are when both loadouts holding one also hold a power fist.
  // The option holding most of what is left takes it, if the list states all it holds
  // and the choice has room left for it.
  const isStated = (name: string) => nameVariants(name).some((variant) => stated.has(variant))
  const leftOver = (name: string) =>
    (stated.get(name) ?? 0) -
    Math.max(0, (held.get(name) ?? 0) - inChoice(name)) -
    [...distinctiveCounts].reduce((total, [id, count]) => total + count * (aliases.get(id)?.get(name) ?? 0), 0)
  for (;;) {
    const [best] = options
      .filter((option) => !distinctiveCounts.has(option.id))
      .filter((option) => [...(aliases.get(option.id)?.keys() ?? [])].every((name) => owners.get(name) === 1 || isStated(name)))
      .map((option) => ({
        option,
        names: [...(aliases.get(option.id) ?? [])].filter(([name]) => owners.get(name)! > 1 && leftOver(name) > 0),
      }))
      .filter(({ names }) => names.length)
      .sort((left, right) => right.names.length - left.names.length)
    const free = room - [...distinctiveCounts.values()].reduce((total, count) => total + count, 0)
    if (!best || free <= 0) return distinctiveCounts
    distinctiveCounts.set(best.option.id, Math.min(free, ...best.names.map(([name, each]) => Math.floor(leftOver(name) / each))))
  }
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
      nickname: textNickname(data.units[unit.key]?.nickname ?? ''),
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
    name: data.name,
    omittedUnitCount: data.units.length - priced.units.length,
  }
}

function exportGroup(group: UnitGroup): 'character' | 'battleline' | 'transport' | 'other' {
  if (group === 'epic-hero' || group === 'character') return 'character'
  if (group === 'battleline' || group === 'transport') return group
  return 'other'
}
