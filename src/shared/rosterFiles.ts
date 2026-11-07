import { countBy, groupBy, remember } from '../core/collections'
import { version } from '../../package.json'
import { admitsHost, referenceAttachmentOf, type Attachment } from '../core/attach'
import { attachmentRows } from '../core/attachmentRows'
import { fromBattleBaseText } from '../core/battlebase'
import { type Definition, type Modifier, nameOf, resolve } from '../core/catalogue'
import { childrenOf, eachDefinition, isRosterToggle, maximumCount, modelProfileOf } from '../core/definitions'
import { detachmentNameVariants } from '../core/detachmentName'
import type { Selection } from '../core/evaluate'
import { fromNewRecruitText } from '../core/newRecruit'
import { normalizedNameVariants, withoutFactionPrefix } from '../core/name'
import { fromListForgeText, fromListForgeShortText, fromListForgeWtcText } from '../core/listForge'
import { fromFortyKAppText } from '../core/fortyKApp'
import { fromWarmindText } from '../core/warmind'
import { fromWarOrganText } from '../core/warOrgan'
import { fromIronbuiltText } from '../core/ironbuilt'
import { fromNewRecruitMarkdown } from '../core/newRecruitMarkdown'
import { fromWtcText } from '../core/wtcText'
import type { RosterSource } from '../core/savedRoster'
import { defaultSelection } from '../core/expand'
import { buildUnit } from '../core/roster'
import { modelCountOf } from '../core/unitSize'
import { at as selectionAt } from '../core/selection'
import { unitChoices, unitToggles } from '../core/unitChoices'
import { wargearOf } from '../core/wargear'
import { textNickname, textNote, type TextRoster, type TextRosterUnit } from '../core/textRoster'
import { nicknamedUnit } from '../core/unitNotes'
import { gwTextGroup, gwTextVersionLines, toGwText, type GwTextRoster } from '../core/gwText'
import type { UnitGroup } from '../core/unitGroups'
import { allowsPointsBudget, customPointsBudget, GAME_SIZES, isGameSize, pointsBudgetError } from '../core/battle'
import { catalogueFactionName, factionDisplayName } from './factionNames'
import { englishNames, NO_TRANSLATIONS, translationsOf, type CatalogueTranslations } from './catalogueTranslations'
import {
  attachmentReason,
  normalized,
  type UnmatchedName,
  unmatchedDatasheetReason,
  unmatchedDetachmentReason,
  NO_REMOVALS,
  type RemovedNames,
  unmatchedFactionReason,
  type UnplacedChoice,
  unplacedChoiceReason,
  squadSizeReason,
  DROPPED_REASON,
  WARLORD_REASON,
  factionOfDatasheets,
  chapterOfDatasheets,
} from './importMismatch'
import { DISPOSITIONS, type LoadedCatalogue } from './catalogueIndex'
import { datacardOf } from './datasheetJoin'
import { keywordsIn } from './catalogue'
import { isUpgrade, mfmDetachmentFor } from './mfm'
import { rosterDetachments } from './rosterDetachments'
import { importRosterSchema, type ExportRosterInput, type ImportRosterInput } from '../contracts/schemas'
import { calculateRosterPrice } from './pricing'
import type { LoadedRules } from './rules'
import type { RosterExchange } from '../core/rosterExchange'
import type { RosterPick } from '../core/roster'

/** Which tool or layout wrote an imported text, as `roster_imported` and `roster_import_failed` report it. */
export type RosterTextFormat =
  | 'praetorium'
  | 'newrecruit'
  | 'battlebase'
  | 'roster-file'
  | 'listforge'
  | 'listforge-wtc'
  | 'warorgan'
  | 'warmind'
  | 'ironbuilt'
  | 'wtc'
  | '40k-app'

function parsedImport(file: string): { parsed: TextRoster; format: RosterTextFormat } | null {
  const praetorium = /Exported with Praetorium\.gg/i.test(file)
  const newRecruit = fromNewRecruitText(file)
  if (newRecruit && (newRecruit.units.length || praetorium)) return { parsed: newRecruit, format: praetorium ? 'praetorium' : 'newrecruit' }
  const markdown = fromNewRecruitMarkdown(file)
  if (markdown) return { parsed: markdown, format: 'newrecruit' }
  // New Recruit also writes the WTC header over the official app's unit layout.
  const wtc = fromWtcText(file)
  if (wtc) return { parsed: wtc, format: newRecruit ? 'newrecruit' : 'wtc' }
  if (newRecruit) return { parsed: newRecruit, format: 'newrecruit' }
  const warmind = fromWarmindText(file)
  if (warmind) return { parsed: warmind, format: 'warmind' }
  // Short text has no bullets, so it is read before the detailed export, which would take its lines for unit names.
  const listForgeShort = fromListForgeShortText(file)
  if (listForgeShort) return { parsed: listForgeShort, format: 'listforge' }
  const listForge = fromListForgeText(file)
  if (listForge) return { parsed: listForge, format: 'listforge' }
  const ironbuilt = fromIronbuiltText(file)
  if (ironbuilt) return { parsed: ironbuilt, format: 'ironbuilt' }
  const listForgeWtc = fromListForgeWtcText(file)
  if (listForgeWtc) return { parsed: listForgeWtc, format: 'listforge-wtc' }
  const warOrgan = fromWarOrganText(file)
  if (warOrgan) return { parsed: warOrgan, format: 'warorgan' }
  const fortyKApp = fromFortyKAppText(file)
  if (fortyKApp) return { parsed: fortyKApp, format: '40k-app' }
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

/** The faction a text's units belong to, for a text whose stated faction no book answers to, as one translated by the official app. */
export function importRosterUnitFaction(file: string, loaded: LoadedCatalogue) {
  const parsed = parsedImport(file)?.parsed
  return parsed ? unitFaction(parsed, loaded) : null
}

const unitFaction = (parsed: TextRoster, loaded: LoadedCatalogue) => {
  const id = factionOfDatasheets(
    parsed.units.map((unit) => unit.name),
    loaded,
  )
  return loaded.factions.find((faction) => faction.id === id) ?? null
}

export function importRosterCatalogueId(file: string) {
  return /^Ruleset: ((?:[a-z0-9-]{1,20}~)?[^\s~]{1,40})$/m.exec(file.replaceAll('\r', ''))?.[1] ?? null
}

/** Whether a text's faction names this book, by its own name, a faction keyword such as "Heretic Astartes", or a translation of either. */
export function matchesImportFaction(stated: string, name: string, translations: CatalogueTranslations = NO_TRANSLATIONS) {
  const wanted = new Set([stated, catalogueFactionName(stated)].map(unaccented))
  const leaf = name.split(' - ').at(-1) ?? ''
  return [...translationsOf(name, translations), ...translationsOf(leaf, translations)].some((candidate) =>
    [candidate, candidate.split(' - ').at(-1) ?? ''].some((part) => wanted.has(unaccented(part))),
  )
}

/** Translations spell names with and without accents, as "Tiranidos" for "Tiránidos". */
const unaccented = (value: string) => normalized(value).normalize('NFD').replace(/\p{M}/gu, '')

export function importRosterFile(
  data: ImportRosterInput,
  loaded: LoadedCatalogue | null,
  factionNames = loaded?.factions.map((faction) => faction.name) ?? [],
  rules: LoadedRules | null = null,
  translations: CatalogueTranslations = NO_TRANSLATIONS,
  removed: RemovedNames = NO_REMOVALS,
) {
  importRosterSchema.parse(data)
  const found = parsedImport(data.file)
  if (found) return importParsedRoster(found.parsed, found.format, loaded, factionNames, rules, translations, removed)
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

/** A list already read into army text matched unit by unit, for a caller that prices it itself. */
export function matchParsedRoster(
  parsed: TextRoster,
  loaded: LoadedCatalogue | null,
  factionNames = loaded?.factions.map((faction) => faction.name) ?? [],
  translations: CatalogueTranslations = NO_TRANSLATIONS,
  removed: RemovedNames = NO_REMOVALS,
) {
  if (parsed.units.length > 100) throw new Error('An imported roster can contain at most 100 entries.')
  return importTextRoster(parsed, loaded, factionNames, translations, removed)
}

/** A list already read into army text, from a pasted export or another app's own format, matched and priced. */
export function importParsedRoster(
  parsed: TextRoster,
  format: RosterTextFormat,
  loaded: LoadedCatalogue | null,
  factionNames = loaded?.factions.map((faction) => faction.name) ?? [],
  rules: LoadedRules | null = null,
  translations: CatalogueTranslations = NO_TRANSLATIONS,
  removed: RemovedNames = NO_REMOVALS,
) {
  const result = matchParsedRoster(parsed, loaded, factionNames, translations, removed)
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
    source: savedSource(format),
    format,
    reportedPoints: parsed.reportedPoints ?? null,
    currentPoints,
    sourceUnitCount: parsed.units.length,
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

function importTextRoster(
  parsed: TextRoster,
  loaded: LoadedCatalogue | null,
  factionNames: readonly string[],
  translations: CatalogueTranslations,
  removed: RemovedNames,
) {
  const stated = loaded?.factions.find((candidate) => matchesImportFaction(parsed.faction, candidate.name, translations))
  // A list can state a chapter's parent faction, whose units then name the chapter.
  const names = parsed.units.map((unit) => unit.name)
  const chapterId = loaded && stated ? chapterOfDatasheets(names, stated.id, loaded) : null
  const faction = loaded && (loaded.factions.find((candidate) => candidate.id === chapterId) ?? stated ?? unitFaction(parsed, loaded))
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
  const offered = loaded.detachments.get(faction.id)?.options ?? []
  const printed = printedDetachments(loaded)
  const whole = detachmentName ? detachmentsNamed(detachmentName, offered, translations, printed) : []
  // Where one of several detachments is unknown, the others still count, so their enhancements stay. The last two are
  // joined by a word, "and" or a translation of it, that a detachment's own name can also hold, so a part splits at the
  // word only where one side is a known detachment.
  const known = (name: string) => detachmentsNamed(name, offered, translations, printed).length > 0
  const joined = (part: string) => {
    const words = part.split(' ')
    for (let at = 1; at < words.length - 1; at++) {
      const sides = [words.slice(0, at).join(' '), words.slice(at + 1).join(' ')]
      if (sides.some(known)) return sides
    }
    return [part]
  }
  const parts = whole.length || !detachmentName ? [] : detachmentName.split(/,\s+/).flatMap((part) => (known(part) ? [part] : joined(part)))
  const detachments = whole.length ? whole : parts.flatMap((part) => detachmentsNamed(part, offered, translations, printed))
  const unknown: UnmatchedName[] = parts
    .filter((part) => !known(part))
    .map((part) => ({ name: part, reason: unmatchedDetachmentReason(part, faction.id, loaded, removed) }))
  for (const line of parsed.unread ?? []) unknown.push({ name: line, reason: 'this line is not understood by the text importer' })
  const detachmentIds = detachments.map((detachment) => detachment.id)
  const detachmentSelections = rosterDetachments(loaded, faction.id, detachmentIds).selections
  const sourceToImported = new Map<number, number>()
  const unplaced = new Map<number, Map<string, string>>()
  const label = (unit: TextRosterUnit, at: number) =>
    parsed.units.filter((other) => normalized(other.name) === normalized(unit.name)).length > 1
      ? `${unit.name} (entry ${at + 1})`
      : unit.name
  const datasheets = [...(loaded.index.datasheets.get(faction.id) ?? [])].flatMap((id) => {
    const definition = loaded.index.definitions.get(id)
    return definition ? [{ id, name: normalized(nameOf(definition, loaded.index.definitions)) }] : []
  })
  // A datasheet another app names in the plural, as BattleBase's "Myphitic Blight-haulers", is still the one datasheet it can be;
  // one it names without the catalogue's "[Legends]" mark, as 40k.app's "Whirlwind", is the Legends datasheet.
  // A list can also name it after its faction, as 40k.app's "Chaos Warhound Titan" is a Chaos army's "Warhound Titan".
  const factionWords = new Set(normalized(faction.name).split(/[\s-]+/))
  const spelled = (name: string) => name.replaceAll('defence', 'defense')
  const datasheetNamed = (name: string): string | undefined => {
    const exact =
      datasheets.find((datasheet) => spelled(datasheet.name) === spelled(name)) ??
      datasheets.find((datasheet) => spelled(datasheet.name) === `${spelled(name)} [legends]`)
    const plural = datasheets.filter((datasheet) => nameVariants(datasheet.name).includes(name))
    // Older official-app data names a squad by its models, as "Witchseekers" for "Witchseeker Squad".
    const squad = datasheets.filter((datasheet) => nameVariants(datasheet.name.replace(/ (?:squad|sodality)$/, '')).includes(name))
    const found = exact?.id ?? [plural, squad].find((matches) => matches.length === 1)?.[0]!.id
    const [first, ...rest] = name.split(' ')
    return found ?? (rest.length && factionWords.has(first!) ? datasheetNamed(rest.join(' ')) : undefined)
  }
  // A list exported in another language names its units in it, as the French "Mékadakka de Gros Mek", in the words its
  // datasheet's card prints or the community translations give. Entries sharing a catalogue name, as Wolf Guard Headtakers
  // and their Crusade variant, resolve as that name does.
  let printedDatasheets: Map<string, Set<string>> | undefined
  const printedDatasheet = (name: string) => {
    printedDatasheets ??= new Map(
      datasheets
        .flatMap((datasheet) =>
          (datacardOf(loaded, faction.id, datasheet.id)?.details.printedName ?? []).map(
            (spelling) => [normalized(spelling), datasheet.name] as const,
          ),
        )
        .reduce(
          (found, [spelling, own]) => found.set(spelling, (found.get(spelling) ?? new Set()).add(own)),
          new Map<string, Set<string>>(),
        ),
    )
    const owns = printedDatasheets.get(name)
    return owns?.size === 1 ? datasheetNamed([...owns][0]!) : undefined
  }
  const namedInAnyLanguage = (name: string) =>
    datasheetNamed(name) ??
    printedDatasheet(name) ??
    englishNames(name, translations)
      .map((english) => datasheetNamed(normalized(english)))
      .find(Boolean)
  // BSData splits a datasheet the official app offers a choice for, as the app's "Soul Grinder" with "Daemonic Allegiance:
  // Tzeentch" is the "Tzeentch Soul Grinder"; the line that chose it is then no wargear.
  const variantNamed = (unit: TextRosterUnit) =>
    unit.selections.flatMap((selection) => {
      const entryId = datasheetNamed(normalized(`${selection.name.replace(/^(?:Enhancements?|Upgrade):\s*/i, '')} ${unit.name}`))
      return entryId ? [{ entryId, unit: { ...unit, selections: unit.selections.filter((other) => other !== selection) } }] : []
    })
  const units = parsed.units.flatMap((listed, sourceIndex) => {
    const named = namedInAnyLanguage(normalized(listed.name))
    const variants = named ? [] : variantNamed(listed)
    const { entryId, unit } = named
      ? { entryId: named, unit: listed }
      : variants.length === 1
        ? variants[0]!
        : { entryId: null, unit: listed }
    if (!entryId) {
      unknown.push({ name: label(unit, sourceIndex), reason: unmatchedDatasheetReason(unit.name, faction.id, loaded, removed) })
      return []
    }
    sourceToImported.set(sourceIndex, sourceToImported.size)
    const read = textRosterPick(
      joinedSplit(unit, entryId, loaded.index),
      entryId,
      faction.id,
      detachmentIds,
      detachmentSelections,
      loaded,
      translations,
      removed,
    )
    if (read.unplaced.length) note(unplaced, sourceIndex, read.unplaced)
    return [read.pick]
  })

  attachTextUnits(parsed.units, units, sourceToImported)
  // A group that does not say which unit is its bodyguard joins the one unit of it another can join; legality then judges the rest.
  const joins = (member: { entryId: string }, host: { entryId: string }) => {
    const leader = loaded.index.definitions.get(member.entryId)
    const bodyguard = loaded.index.definitions.get(host.entryId)
    const attachment = leader && referenceAttachmentOf(leader, loaded.index)
    return Boolean(
      attachment &&
      bodyguard &&
      admitsHost(attachment, nameOf(bodyguard, loaded.index.definitions), keywordsIn(loaded, faction.id, host.entryId)),
    )
  }
  const grouped = [...sourceToImported].filter(([source]) => parsed.units[source]!.group !== undefined)
  for (const members of groupBy(grouped, ([source]) => parsed.units[source]!.group).values()) {
    const picks = members.map(([, imported]) => units[imported]!)
    const hosts = picks.filter((host) => picks.some((member) => member !== host && joins(member, host)))
    if (hosts.length !== 1) continue
    for (const member of picks) if (member !== hosts[0] && member.attachedTo === undefined) member.attachedTo = units.indexOf(hosts[0]!)
  }
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
  const disposition = importedDisposition(parsed.disposition, detachments, unknown, translations)
  // An export from older app data can name what a later update renamed or removed, which explains what did not match.
  // The app has one data version for every army, and not every faction's file says which it was written for.
  const current = Math.max(0, ...[...loaded.factionContents.values()].flatMap((content) => content.dataVersion ?? []))
  const olderData = parsed.dataVersion && parsed.dataVersion < current ? { exported: parsed.dataVersion, current } : null

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
    olderData,
  }
}

/** The stated force disposition, or its detachments' own when the text names it in another language. */
function importedDisposition(
  stated: string | null,
  detachments: readonly { disposition: string | null }[],
  unknown: UnmatchedName[],
  translations: CatalogueTranslations,
) {
  if (!stated) return null
  if (stated.includes(',')) {
    unknown.push({ name: stated, reason: 'more than one force disposition was stated; choose one in setup' })
    return null
  }
  const named = [stated, ...englishNames(stated, translations)].map(slug).find((name) => DISPOSITIONS.has(name))
  if (named) return named
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

const printedDetachmentCache = new WeakMap<LoadedCatalogue, Map<string, readonly string[]>>()
/** Every spelling the cards print a detachment in, by its English name: Space Wolves field Space Marines' "Force d’Assaut Terminator". */
const printedDetachments = (loaded: LoadedCatalogue) =>
  remember(printedDetachmentCache, loaded, () => {
    const found = new Map<string, readonly string[]>()
    for (const content of new Set(loaded.factionContents.values()))
      for (const names of content.printedDetachments ?? []) {
        const key = normalized(names[0]!)
        found.set(key, [...new Set([...(found.get(key) ?? []), ...names])])
      }
    return found
  })

function detachmentsNamed<T extends { id: string; name: string }>(
  combined: string,
  options: readonly T[],
  translations: CatalogueTranslations = NO_TRANSLATIONS,
  printed: ReadonlyMap<string, readonly string[]> = new Map(),
): T[] {
  const names = new Map(
    options.map((option) => [
      option,
      [
        ...new Set(
          detachmentNameVariants(option.name)
            .flatMap((name) => [...translationsOf(name, translations), ...(printed.get(normalized(name)) ?? [])])
            .map(normalized),
        ),
      ],
    ]),
  )
  const candidates = options.toSorted((left, right) => normalized(right.name).length - normalized(left.name).length)
  const visit = (remaining: string, available: readonly T[]): T[] | null => {
    for (const candidate of available) {
      for (const name of names.get(candidate)!) {
        // "Haloscreed Battle Clade" is the catalogue's "Haloscreed Battleclade".
        if (remaining === name || remaining.replaceAll(' ', '') === name.replaceAll(' ', '')) return [candidate]
        if (!remaining.startsWith(name)) continue
        const after = remaining.slice(name.length)
        // The official app joins the last two with its own language's "and", as the Spanish "y".
        for (const separator of [/^,\s+/, /^,?\s+\S+\s+/].flatMap((pattern) => pattern.exec(after)?.[0] ?? [])) {
          const rest = visit(
            after.slice(separator.length),
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
// BSData can also bracket the loadout, as a "Sicarian Infiltrator Princeps (Taser goad & flechette blaster)".
const modelAliases = (name: string) => {
  const kind = name
    .replace(modelLoadout, '')
    .replace(/\s+\([^()]+\)$/, '')
    .replace(/\s+(?:Squad|Sodality)$/i, '')
  // Ork plurals end in z, as BSData's "Flash Gitz" model is the official app's "Flash Git".
  return [normalized(name), ...nameVariants(kind), ...(/[^z]z$/i.test(kind) ? [normalized(kind.slice(0, -1))] : [])]
}
// BSData prefixes weapons the official app does not, as its "Astartes Chainsword" and "Steed's savage claws" are the app's "Chainsword" and "Savage claws".
// "Exo-armour" and "Exoarmour", "sabre & clawed limbs" and "sabre and clawed limbs", "Company Veteran w/ Bolt Rifle" and "with bolt rifle", are one piece.
const spellingKey = (name: string) =>
  name
    .replace(/^(?:astartes|\S+'s) /, '')
    .replaceAll('&', 'and')
    .replaceAll(/\s+with\s+/g, 'w/')
    .replaceAll(/[\s-]/g, '')
// The official app prints some datasheets' power weapon as the sword or maul the model holds, as Bladeguard Veterans' "Master-crafted Power Sword".
const powerWeaponKey = (key: string) => key.replace(/power(?:sword|maul)/, 'powerweapon')
// The official app names a datasheet's plain melee profile "Close combat weapon" where the catalogue names it for what it is, as a Prosecutor's "Gun Stock".
const GENERIC_MELEE = spellingKey('close combat weapon')
/** The kind of model a counted group fields, as "1 - 2 Gun Servitors" fields a "Gun Servitor", which the official app names it by. */
const groupKind = (name: string) => normalized(name).match(/^\d+(?:\s*-\s*\d+)?\s+(.+?)s?$/)?.[1]

/**
 * A unit whose lines join several pieces with commas and "and", as an "Agent Firearm and Mystic Stave", read as each piece,
 * only where every piece is a name the datasheet knows, since "and" also falls inside a name, as a "Lacerator and daemonic claw".
 * A comma falls inside a name too, as a Jakhals' "1 mauler chainblade, 7 chainblades", which a layout listing items with
 * commas cuts in two, so neighbouring lines that join into a name the datasheet knows are read as that one. ListForge's
 * short text likewise reads a bracketed qualifier as what a counted model carries, as "4x Drakolithe (Once per battle, per token)".
 */
function joinedSplit(unit: TextRosterUnit, entryId: string, index: LoadedCatalogue['index']): TextRosterUnit {
  const respelled = respelledNames(entryId, index)
  const known = (name: string) => {
    const key = spellingKey(normalized(name))
    return respelled.has(key) || respelled.has(powerWeaponKey(key)) || key === GENERIC_MELEE
  }
  const selections = unit.selections.flatMap((selection) => {
    // A piece can carry its own count, as "Dual Caestus Fists and 2x Twin Neutronium Cascade Projectors".
    const pieces = selection.name.split(/,\s+|\s+and\s+/i).map((piece) => piece.match(/^(?:(\d+)x\s+)?(.+)$/)!)
    return pieces.length > 1 && !known(selection.name) && pieces.every((piece) => known(piece[2]!))
      ? pieces.map((piece) => ({ ...selection, name: piece[2]!, count: selection.count * Number(piece[1] ?? 1) }))
      : [selection]
  })
  const joined: typeof selections = []
  for (const selection of selections) {
    const before = joined.at(-1)
    const qualified = before && selection.model === before.name && `${before.name} (${selection.name})`
    const listed = before && selection.model === before.model && `${before.name}, ${selection.name}`
    // Only a line the datasheet does not know is a cut piece: a Terminator's "Power fist" stays apart from the "Combi-bolter" before it
    // although it offers a "Combi-bolter, Power fist", and a Sicarian Ruststalker's "Transonic razor and chordclaw" is what it carries.
    const name =
      before?.count === selection.count && !known(selection.name)
        ? [qualified, listed].find((candidate) => candidate && known(candidate))
        : undefined
    if (before && name) before.name = name
    else joined.push({ ...selection })
  }
  return { ...unit, selections: joined }
}

function wargearCounts(selection: Selection, index: LoadedCatalogue['index']) {
  const counts = new Map<string, number>()
  for (const piece of wargearOf(selection, index))
    for (const name of nameVariants(piece.name)) counts.set(name, (counts.get(name) ?? 0) + piece.count)
  return counts
}

/** A name without the bracketed qualifier a list can add, as "(Aura)". */
const withoutQualifier = (name: string) => name.replace(/\s*\([^()]*\)$/, '')

function textRosterPick(
  unit: TextRosterUnit,
  entryId: string,
  catalogueId: string,
  detachmentIds: readonly string[],
  roster: readonly Selection[],
  loaded: LoadedCatalogue,
  translations: CatalogueTranslations,
  removed: RemovedNames,
) {
  const stated = new Map<string, number>()
  const labels = new Map<string, string>()
  const statedUnder = new Map<string, Map<string, number>>()
  // Lines no model holds, which are the only ones that can name a body: a Terminator Champion's "Paired accursed weapons" is not a Terminator.
  const statedLines = new Map<string, number>()
  const respelled = respelledNames(entryId, loaded.index)
  const models = modelNames(entryId, loaded.index)
  // Some exporters prefix wargear with the unit it belongs to, as BattleBase's "Scout sniper rifle" is a Scout Squad's "Sniper Rifle",
  // and the official app prefixes a model with a keyword of its unit, as a Cultist Mob's "Chaos Cultist" or a "World Eaters Terminator Champion".
  const unitWords = new Set(
    [unit.name, ...keywordsIn(loaded, catalogueId, entryId).map(withoutFactionPrefix)].flatMap((name) =>
      normalized(name).split(' ').flatMap(nameVariants),
    ),
  )
  const unprefixed = (label: string) => {
    const words = normalized(label).split(' ')
    for (let at = 1; at < words.length && unitWords.has(words[at - 1]!); at++) {
      const rest = words.slice(at).join(' ')
      const found = respelled.get(spellingKey(rest)) ?? (models.has(rest) ? rest : undefined)
      if (found) return found
    }
    // It can also prefix one with its squadmates' whole name, as a Purgation Squad's "Purgator Justicar".
    for (let at = 1; at < words.length; at++) {
      const [kind, rest] = [words.slice(0, at).join(' '), words.slice(at).join(' ')]
      if (models.has(kind) && models.has(rest)) return rest
    }
    return undefined
  }
  // A model answers to whose wargear it carries, as a Brotherhood Terminator Squad's "Ancient" or a "Paladin Ancient".
  const bearers = bearerNames(entryId, loaded.index)
  const bearer = (label: string) => bearers.get(spellingKey(normalized(label).split(' ').at(-1)!))
  // The official app can name a model for its whole loadout, as a "Kill Team Heavy Intercessor with Melta Rifle, Bolt Pistol and Ceramite Fists":
  // the one model of that kind carrying each piece listed beneath it, or else each piece the name lists, since the app can title
  // models by a squadmate's loadout.
  const loadouts = modelLoadouts(entryId, loaded.index)
  const loadoutModel = (label: string) => {
    const [, kind, loadout] = normalized(label).match(/^(.+?)\s+(?:with|w\/)\s*(.+?)\.?$/) ?? []
    if (!kind || !loadout) return undefined
    const beneath = unit.selections.filter((selection) => selection.model === label).map((selection) => normalized(selection.name))
    const candidates = loadouts.filter((model) => model.kinds.includes(kind))
    for (const pieces of [beneath, loadout.split(/,\s*|\s+(?:and|&)\s+/)]) {
      const holding = candidates.filter((model) => pieces.length > 0 && pieces.every((piece) => model.pieces.has(spellingKey(piece))))
      if (holding.length === 1) return holding[0]!.name
    }
    return undefined
  }
  const context = { primaryCatalogueId: catalogueId, roster }
  let manualNames: ReadonlyMap<string, string> | undefined
  const modelFor = new Map<string, string>()
  const defaultMelee = new Map<string, string | null>()
  const resolved = (label: string, enhancement: boolean) => {
    // A list can add a qualifier the catalogue does not, as "Icon of Despair (Aura)" or "Pulsa Rokkit (Once per battle, per unit)".
    const key =
      [spellingKey(normalized(label)), spellingKey(normalized(withoutQualifier(label)))].find((candidate) => respelled.has(candidate)) ??
      spellingKey(normalized(label))
    const known = respelled.has(key) || respelled.has(powerWeaponKey(key))
    if (enhancement && !known) manualNames ??= enhancementRespellings(entryId, catalogueId, detachmentIds, loaded, context)
    return (
      (respelled.has(key) ? respelled.get(key) : (respelled.get(powerWeaponKey(key)) ?? unprefixed(label) ?? bearer(label))) ??
      (enhancement ? manualNames?.get(normalized(label)) : undefined) ??
      (key === GENERIC_MELEE ? remember(defaultMelee, key, () => soleDefaultMelee(entryId, loaded.index, context)) : null) ??
      loadoutModel(label)
    )
  }
  // A list exported in another language names its wargear and enhancements in it, as the Spanish "Talismán del tormento".
  const translated = (label: string, enhancement: boolean) =>
    [...new Set([label, withoutQualifier(label)])]
      .flatMap((name) => englishNames(name, translations))
      .map((english) => resolved(english, enhancement))
      .find(Boolean)
  // The official app prints its datasheet card's names, which can be another spelling of the catalogue's in any language.
  const printedGroups = datacardOf(loaded, catalogueId, entryId)?.details.printedPieces ?? []
  const printedAs = (label: string) => printedGroups.filter((names) => names.some((name) => normalized(name) === normalized(label)))
  const printed = (label: string, enhancement: boolean) =>
    printedAs(label)
      .flatMap((names) => names.filter((name) => normalized(name) !== normalized(label)))
      .map((name) => resolved(name, enhancement))
      .find(Boolean)
  // A name only the card knows reads as its English one, so a French "Chef de Meute de Cavalerie sur Loups Tonnerre" is
  // the "Thunderwolf Cavalry Pack Leader" its datasheet titles.
  const nameFor = (label: string, enhancement = false) =>
    resolved(label, enhancement) ??
    translated(label, enhancement) ??
    printed(label, enhancement) ??
    normalized(printedAs(label)[0]?.[0] ?? label)
  const unitEnhancements = new Map<string, number>()
  for (const selection of unit.selections) {
    const enhancement = /^(?:Enhancements?|Upgrade):/i.test(selection.name)
    const label = selection.name.replace(/^(?:Enhancements?|Upgrade):\s*(.+)$/i, (_, name: string) => upgradeName(name)).trim()
    const name = nameFor(label, enhancement)
    stated.set(name, (stated.get(name) ?? 0) + selection.count)
    if (!selection.model) statedLines.set(name, (statedLines.get(name) ?? 0) + selection.count)
    if (!labels.has(name)) labels.set(name, label)
    // A model's lines are kept under the name its line resolved to where that is one model's, so they scope it:
    // a stat line several models share, as Cthonian Beserks' "Beserk", says no more than the list did.
    if (!selection.model) {
      if (enhancement) unitEnhancements.set(name, (unitEnhancements.get(name) ?? 0) + selection.count)
      if (loadouts.filter((model) => model.name === name || model.profile === name).length === 1) modelFor.set(normalized(label), name)
      continue
    }
    const model = modelFor.get(normalized(selection.model)) ?? normalized(selection.model)
    const under = statedUnder.get(model) ?? new Map<string, number>()
    under.set(name, (under.get(name) ?? 0) + selection.count)
    statedUnder.set(model, under)
  }
  // The official app titles a model after its datasheet, as a "Thunderwolf Cavalry Pack Leader" the catalogue does not name;
  // a name the datasheet holds, as a "Piranha fusion blaster", is not one.
  const ownNames = [unit.name, nameOf(loaded.index.definitions.get(entryId)!, loaded.index.definitions)].flatMap(nameVariants)
  const namedForUnit = (name: string) => !respelled.has(spellingKey(name)) && ownNames.some((own) => name.startsWith(`${own} `))
  const statedModels = [...stated].reduce((total, [name, count]) => total + (models.has(name) || namedForUnit(name) ? count : 0), 0)
  // Model lines size the unit; without them, its most numerous wargear stands in.
  const requestedModels =
    unit.models ?? (unit.defaultSize ? undefined : statedModels || Math.max(1, ...unit.selections.map((selection) => selection.count)))
  const built = buildUnit(entryId, loaded.index, requestedModels, {}, context)
  const warlordNames = warlordAliases(entryId, loaded.index)
  const warlord = unit.warlord || [...warlordNames].some((name) => stated.has(name))
  const pickFrom = (selection: Selection, earlier: RosterPick['spreads'] = {}) => {
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
        // An enhancement the official app prints for the whole unit is still its character's, as a Rogue Trader's
        // Fleetmaster in an Entourage whose models the list names; it joins only the lines of a model offered it.
        for (const [name, count] of unitEnhancements)
          if (choice.options.some((option) => normalized(option.name) === name)) under.set(name, count)
        const model = selectionAt(selection, path.slice(0, depth + 1))
        const own = model ? wargearCounts(model, loaded.index) : new Map<string, number>()
        return { stated: under, held: own, scoped: true }
      }
      return { stated, held, scoped: false }
    })
    // Lines a scoped model claims are not also the rest of the unit's to choose from, as a Scout Sergeant's shotgun is not a Scout's.
    // A choice offering that model still reads them, as the master vox under "4x Tempestus Scion" says which Scion carries it,
    // unless the list names its models apart, where each named model's lines already place its own wargear.
    // What the claiming model holds leaves with its lines, so a Champion's plasma pistol is not one a squadmate already has.
    const claims = scopes.flatMap((scope, at) => (scope.scoped ? [{ key: choices[at]!.key, stated: scope.stated, held: scope.held }] : []))
    const without = (from: ReadonlyMap<string, number>, taken: ReadonlyMap<string, number>) => {
      const left = new Map(from)
      for (const [name, count] of taken) {
        const rest = (left.get(name) ?? 0) - count
        if (rest > 0) left.set(name, rest)
        else left.delete(name)
      }
      return left
    }
    // A model claims only the lines it or its own choices could hold: a Chosen's Chaos icon, or an Intercessor squad's
    // grenade launcher, is still the squad's to place when the list prints it under the Champion or Sergeant.
    const holdable = (claimed: ReadonlyMap<string, number>, own: ReadonlyMap<string, number>) => {
      const names = new Set([
        ...own.keys(),
        ...choices.flatMap((_, at) =>
          scopes[at]!.stated === claimed ? [...aliases[at]!.values()].flatMap((offered) => [...offered.keys()]) : [],
        ),
      ])
      return new Map([...claimed].filter(([name]) => names.has(name)))
    }
    scopes.forEach((scope, at) => {
      if (scope.scoped) return
      const { key, options } = choices[at]!
      const namedApart = options.filter((option) => stated.has(normalized(option.name))).length > 1
      const offered = (claim: { key: string }) => !namedApart && options.some((option) => claim.key.startsWith(`${key}/${option.id}/`))
      const claimed = new Map(claims.filter((claim) => !offered(claim)).map((claim) => [claim.stated, claim.held]))
      scope.stated = [...claimed].map(([lines, own]) => holdable(lines, own)).reduce(without, stated)
      scope.held = [...claimed.values()].reduce(without, held)
    })
    const offeredBy = countBy(
      aliases.flatMap((choice) => [...new Set([...choice.values()].flatMap((names) => [...names.keys()]))]),
      (name) => name,
    )
    // Any line with wargear printed beneath it is a model's, as a "Canoptek Wraith" the official app names after its
    // datasheet, carrying the particle caster that marks its loadout.
    const modelLines = new Set([...models, ...statedUnder.keys()])
    // How many of a piece the unit's other choices could take, so a Crisis Shas'ui pair takes the two gun drones their
    // Shas'vre, who may carry one, leaves them. A choice enclosing this one, as a unit's size, offers nothing besides it.
    const roomBesides = (at: number) => (name: string) =>
      choices.reduce(
        (total, other, inner) =>
          inner === at || choices[at]!.key.startsWith(`${other.key}/`)
            ? total
            : total +
              Math.max(
                0,
                ...other.options
                  .filter((option) => aliases[inner]!.get(option.id)?.has(name))
                  .map((option) => Math.min(option.max, other.room)),
              ),
        0,
      )
    const countsAt = (
      choice: (typeof choices)[number],
      at: number,
      from: ReadonlyMap<string, ReadonlyMap<string, number>>,
      lines: ReadonlyMap<string, number>,
    ) =>
      countsForChoice(
        choice,
        from,
        lines,
        scopes[at]!.held,
        modelLines,
        offeredBy,
        (id) => optionWargear(id, loaded, context),
        roomBesides(at),
      )
    // The choices whose own lines field the models carrying them.
    const fielding = new Set<string>()
    // A model only a choice nested on it can arm, as the heavy weapon Terminator a reaper autocannon marks, is fielded by
    // what that choice states, as are the models of a group nested in this one, as Chaos Bikers with plasma guns; the
    // rest of the group divides what is left.
    const nestedBodies = (at: number) => {
      const { key, options } = choices[at]!
      const lines = scopes[at]!.stated
      const bodies = new Map<string, number>()
      const taken = new Map<string, number>()
      let besides = 0
      choices.forEach((nested, inner) => {
        if (!nested.key.startsWith(`${key}/`)) return
        const carrier = options.find((option) => nested.key.startsWith(`${key}/${option.id}/`))
        const grouped = !carrier && nested.options.every((option) => isModel(option.id, loaded.index))
        if (carrier ? !isModel(carrier.id, loaded.index) : !grouped || nested.key.slice(key.length + 1).includes('/')) return
        const elsewhere = new Set(
          aliases.flatMap((offered, other) =>
            other === inner ? [] : [...offered].flatMap(([id, names]) => (other === at && id === carrier?.id ? [] : [...names.keys()])),
          ),
        )
        let fielded = 0
        for (const names of aliases[inner]!.values()) {
          const marks = [...names].filter(([name]) => !elsewhere.has(name) && lines.has(name))
          if (!marks.length) continue
          const count = Math.min(...marks.map(([name, each]) => Math.floor(lines.get(name)! / each)))
          fielded += count
          for (const [name, each] of marks) taken.set(name, (taken.get(name) ?? 0) + count * each)
        }
        // The group's room already leaves out the nested models the unit fields.
        if (!carrier) {
          besides += Math.max(0, Math.min(nested.room, fielded) - nested.options.reduce((total, option) => total + option.count, 0))
          return
        }
        // No more of the model than it or the nested choice allows, so a second heavy weapon is reported rather than fielded.
        const most = Math.min(choices[at]!.room, Math.max(carrier.max, nested.room))
        if (!fielded) return
        bodies.set(carrier.id, Math.min(most, Math.max(bodies.get(carrier.id) ?? 0, fielded)))
        fielding.add(nested.key)
      })
      return { bodies, taken, besides }
    }
    const statedChoiceCounts = new Map(
      choices.map((choice, at) => {
        const { bodies, taken, besides } = nestedBodies(at)
        if (!bodies.size && !besides) return [choice.key, countsAt(choice, at, aliases[at]!, scopes[at]!.stated)]
        const room = choice.room - besides - [...bodies.values()].reduce((total, count) => total + count, 0)
        const rest = { ...choice, room, options: choice.options.filter((option) => !bodies.has(option.id)) }
        const others = new Map([...aliases[at]!].filter(([id]) => !bodies.has(id)))
        return [choice.key, new Map([...bodies, ...(room > 0 ? countsAt(rest, at, others, without(scopes[at]!.stated, taken)) : [])])]
      }),
    )
    // Models are counted even where only one may join, since choosing one would not place its body.
    const counted = (choice: (typeof choices)[number]) =>
      choice.room > 1 || choice.options.some((option) => isModel(option.id, loaded.index))
    const placed = new Set([...placeableNames(selection, aliases, models, unit.name, loaded), ...warlordNames])
    const fieldedKinds = new Set<string>()
    const spreadEntries: [string, Record<string, number>][] = []
    // A piece the counted choices already place is not also another choice's to take,
    // except the default of a choice on the placed model itself, as a heavy weapon
    // Terminator's accursed weapon is the one its melee choice decides.
    const spreadPlaced = (within: string, lines?: ReadonlyMap<string, number>) => {
      const pieces = new Map<string, number>()
      for (const [key, counts] of spreadEntries) {
        const at = choices.findIndex((choice) => choice.key === key)
        if (lines && scopes[at]!.stated !== lines) continue
        const names = aliases[at]
        for (const [id, count] of Object.entries(counts)) {
          if (within.startsWith(`${key}/${id}/`)) continue
          for (const [name, each] of names?.get(id) ?? []) pieces.set(name, (pieces.get(name) ?? 0) + count * each)
        }
      }
      return pieces
    }
    const spreadFor = (choice: (typeof choices)[number]): [string, Record<string, number>][] => {
      const at = choices.indexOf(choice)
      // A choice on a model another choice fields holds only as many as are fielded, as one Harlequin Player
      // with a special weapon holds one.
      const carrier = spreadEntries
        .flatMap(([key, counts]) =>
          choices
            .find((other) => other.key === key)!
            .options.filter((option) => choice.key.startsWith(`${key}/${option.id}/`))
            .map((option) => counts[option.id] ?? option.count),
        )
        .at(-1)
      const group = loaded.index.definitions.get(choice.key.split('/').at(-1)!)
      const each = group ? maximumCount(group, loaded.index) : null
      const room = carrier === undefined ? choice.room : Math.min(choice.room, carrier * (each ?? choice.room))
      // Wargear the list does not say who carries is read after the counted choices before it, so a Crisis
      // Shas'vre's drones are the ones its Shas'ui do not take.
      // A model the list names reads only what the choices before it placed from its own lines, as a Carnifex's second arm
      // takes the crushing claws its first arm leaves.
      const follows = spreadEntries.length > 0 && !choice.options.some((option) => isModel(option.id, loaded.index))
      const placedBefore = follows
        ? spreadPlaced(choice.key, scopes[at]!.scoped ? scopes[at]!.stated : undefined)
        : new Map<string, number>()
      const counts = follows
        ? countsForChoice(
            { ...choice, room },
            aliases[at]!,
            without(scopes[at]!.stated, placedBefore),
            without(scopes[at]!.held, placedBefore),
            modelLines,
            offeredBy,
            (id) => optionWargear(id, loaded, context),
            roomBesides(at),
          )
        : (statedChoiceCounts.get(choice.key) ?? new Map<string, number>())
      const explicit = counts.size > 0
      // A model the list does not count keeps the body a choice gave it: the cyclone
      // missile launcher brings its Terminator, and counting none would take it away.
      // A list naming every body in the group by kind, nested specialists included,
      // says what each model is: the rest are left out on purpose, and the weapons it
      // lists are no longer evidence of more bodies.
      if (choice.options.some((option) => isModel(option.id, loaded.index))) {
        const named = (option: { name: string }) => statedLines.get(normalized(option.name)) ?? 0
        const bodies = choices
          .filter((other) => other === choice || other.key.startsWith(`${choice.key}/`))
          .flatMap((other) => other.options)
          .filter((option) => isModel(option.id, loaded.index))
          .reduce((total, option) => total + named(option), 0)
        const groupNamed = groupKind(choice.name)
        const kindBodies = !bodies && groupNamed ? (stated.get(groupNamed) ?? 0) : 0
        let asked =
          bodies >= choice.room
            ? new Map(choice.options.map((option) => [option.id, named(option)]))
            : kindBodies
              ? kindCounts(
                  // What a first read fielded is its choice, not a default the second must keep.
                  choice.options.map((option) => (earlier[choice.key]?.[option.id] === undefined ? option : { ...option, count: 0 })),
                  counts,
                  kindBodies,
                )
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
        if (!asked?.size) return []
        // A group nested in another fields only the bodies its squadmates' loadouts leave, so a Plague Marine
        // squad's second plasma gun, with no body left to take it, is its Champion's. Only a loadout marked by
        // wargear no nested model holds counts, as a heavy plague weapon does and a Chaos Biker's chainsword,
        // which his meltagun squadmates also carry, does not; nor does a model the list counts by its own line.
        const enclosing = choices.findIndex(
          (other) => choice.key.startsWith(`${other.key}/`) && !choice.key.slice(other.key.length + 1).includes('/'),
        )
        const around = spreadEntries.find(([key]) => key === choices[enclosing]?.key)?.[1]
        const squad = around && selectionAt(selection, choices[enclosing]!.key.split('/'))
        if (squad) {
          const total = (values: Iterable<number>) => [...values].reduce((sum, value) => sum + value, 0)
          const nested = new Set(
            choices.flatMap((other, inner) =>
              other.key === choice.key || other.key.startsWith(`${choice.key}/`)
                ? [...aliases[inner]!.values()].flatMap((names) => [...names.keys()])
                : [],
            ),
          )
          const marked = choices[enclosing]!.options.filter(
            (option) =>
              !statedLines.has(normalized(option.name)) &&
              [...(aliases[enclosing]!.get(option.id)?.keys() ?? [])].some((name) => stated.has(name) && !nested.has(name)),
          )
          let over = total(asked.values()) - (modelCountOf(squad, loaded.index) - total(marked.map((option) => around[option.id] ?? 0)))
          asked = new Map(asked)
          for (const [id, count] of [...asked].toSorted((left, right) => right[1] - left[1])) {
            const cut = Math.max(0, Math.min(count, over))
            asked.set(id, count - cut)
            over -= cut
          }
        }
        // Bodies that fill the group leave none for the model the unit is sized by.
        const full = [...asked.values()].reduce((total, count) => total + count, 0) >= choice.room
        const fielded = full ? choice.options.map((option) => [option.id, asked.get(option.id) ?? 0] as const) : [...asked]
        return [[choice.key, Object.fromEntries(fielded.map(([id, count]) => [id, Math.min(choice.room, count)]))]]
      }
      const spread = new Map(
        choice.options.map((option) => [option.id, Math.min(room, counts.get(option.id) ?? (explicit ? 0 : option.count))]),
      )
      // Every carrier of a required choice holds one, so those the list leaves unsaid keep the default, as heavy weapon
      // Terminators whose fists a list does not name. Carriers this choice's own lines field are not unsaid: a cyclone
      // the squad cannot take is reported, not swapped for another weapon.
      const unsaid =
        choice.least === undefined || fielding.has(choice.key) ? 0 : room - [...spread.values()].reduce((total, count) => total + count, 0)
      const fallback =
        choice.options.find((option) => option.default) ?? choice.options.toSorted((left, right) => right.count - left.count)[0]
      if (unsaid > 0 && fallback) spread.set(fallback.id, spread.get(fallback.id)! + unsaid)
      return [[choice.key, Object.fromEntries(spread)]]
    }
    for (const choice of choices.filter(counted)) spreadEntries.push(...spreadFor(choice))
    // A weapon spread under a model the list leaves out would only bring that model back.
    const absent = spreadEntries.flatMap(([key, counts]) =>
      Object.entries(counts).flatMap(([id, count]) => (count === 0 && isModel(id, loaded.index) ? [`${key}/${id}/`] : [])),
    )
    // A line stated under its model is that model's alone, as a heavy weapon Terminator's power fist is not a squadmate's.
    // A piece another one-pick choice took is not also this one's, so a Battle Sisters Squad's one meltagun is the
    // special weapon Sister's, who must take one, and the Sister who may take a heavy weapon takes the multi-melta.
    // A choice nested in another decides what that one holds, so the two spend nothing against each other.
    const taken: { at: number; pieces: Map<string, number> }[] = []
    const spentBesides = (at: number) => {
      const spent = new Map<string, number>()
      const { key } = choices[at]!
      for (const { at: other, pieces } of taken) {
        const otherKey = choices[other]!.key
        if (scopes[other]!.stated !== scopes[at]!.stated || key.startsWith(`${otherKey}/`) || otherKey.startsWith(`${key}/`)) continue
        for (const [name, count] of pieces) spent.set(name, (spent.get(name) ?? 0) + count)
      }
      return spent
    }
    const leftFor = (at: number, id: string) => {
      const pieces = scopes[at]!.scoped ? new Map<string, number>() : spreadPlaced(choices[at]!.key)
      const spent = spentBesides(at)
      return [...(aliases[at]!.get(id) ?? [])].some(
        ([name]) => (scopes[at]!.stated.get(name) ?? 0) > (pieces.get(name) ?? 0) + (spent.get(name) ?? 0),
      )
    }
    const singlePicks = new Map<string, string>()
    for (const at of [...choices.keys()].toSorted((left, right) => Number(choices[left]!.optional) - Number(choices[right]!.optional))) {
      const choice = choices[at]!
      if (counted(choice)) continue
      // An optional choice takes nothing the list gives it no count for.
      const counts = [...(statedChoiceCounts.get(choice.key) ?? [])].filter(
        ([id, count]) => (!choice.optional || count > 0) && (count === 0 || leftFor(at, id)),
      )
      // A choice enclosing this one offers its options only through it, so a Lieutenant's ceramite fists are his melee
      // choice's, and the master-crafted power weapon he lists takes his bolter's place.
      const apart = countBy(
        aliases.flatMap((offered, inner) =>
          inner !== at && (choices[inner]!.key.startsWith(`${choice.key}/`) || choice.key.startsWith(`${choices[inner]!.key}/`))
            ? []
            : [...new Set([...offered.values()].flatMap((names) => [...names.keys()]))],
        ),
        (name) => name,
      )
      const found = singleChoice(choice.options, aliases[at]!, new Map(counts), scopes[at]!.stated, offeredBy, apart)
      if (found) {
        // A model the list leaves out carries nothing, so its choices take no piece from a squadmate's.
        const pieces = new Map([...(aliases[at]!.get(found) ?? [])].filter(([name]) => scopes[at]!.stated.has(name)))
        if (!absent.some((prefix) => choice.key.startsWith(prefix))) taken.push({ at, pieces })
        singlePicks.set(choice.key, found)
        continue
      }
      // An optional default whose pieces another choice took is let go, so the group beside it can hold what the list states.
      const spent = spentBesides(at)
      const given = choice.chosen && [...(aliases[at]!.get(choice.chosen)?.keys() ?? [])].some((name) => spent.has(name))
      if (choice.optional && given && !leftFor(at, choice.chosen)) singlePicks.set(choice.key, '')
      else if (choice.chosen) singlePicks.set(choice.key, choice.chosen)
    }
    const pick = {
      entryId,
      catalogueId,
      models: built?.size.models ?? 1,
      choices: Object.fromEntries(
        choices.flatMap((choice) => (singlePicks.has(choice.key) ? [[choice.key, singlePicks.get(choice.key)!]] : [])),
      ),
      spreads: Object.fromEntries(spreadEntries.filter(([key]) => !absent.some((prefix) => key.startsWith(prefix)))),
      toggles,
      attachedTo: undefined as number | undefined,
      ...(unit.nickname ? { nickname: unit.nickname } : {}),
      ...(unit.note ? { note: unit.note } : {}),
    }
    return { pick, placed, fieldedKinds }
  }
  const first = pickFrom(built?.selection ?? { id: entryId, count: 1 })
  // Read again from the unit as first picked: a choice can open another, as a Trygon's
  // Character upgrade opens its enhancements, and a default the list swaps away no longer
  // accounts for what it states, as a Lord Commissar's power weapon taken for a power fist.
  // Building is most of an import's time, so a read or build that would repeat the last one is skipped.
  const opened = buildUnit(entryId, loaded.index, first.pick.models, first.pick.choices, { ...context, spreads: first.pick.spreads })
  const reopened = opened && JSON.stringify(opened.selection) !== JSON.stringify(built?.selection)
  const { pick, placed, fieldedKinds } = opened && reopened ? pickFrom(opened.selection, first.pick.spreads) : first
  const toggles = pick.toggles

  // Only the unit the pick builds says what was kept: an option the datasheet offers can
  // still be left off it, as a heavy weapon is when its model is not in the squad.
  const imported =
    pick === first.pick || JSON.stringify(pick) === JSON.stringify(first.pick)
      ? opened
      : buildUnit(entryId, loaded.index, pick.models, pick.choices, { ...context, spreads: pick.spreads })
  const carried = imported ? carriedNames(imported.selection, loaded.index) : new Set<string>()
  // What the datasheet's card says every model starts with is carried where the catalogue names it nowhere, as a
  // Solitaire's flip belt; a piece the catalogue does name was placed or lost with its option.
  for (const group of datacardOf(loaded, catalogueId, entryId)?.details.wargearGroups ?? [])
    if (/^default wargear$/i.test(group.instruction))
      for (const option of group.options) if (!respelled.has(spellingKey(normalized(option)))) carried.add(withoutArticle(option))
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
      const reason = placed.has(name) ? DROPPED_REASON : unplacedChoiceReason(label, { loaded, catalogueId, detachmentIds, removed })
      return { name: label, reason }
    })
  // A lone line nothing in the catalogue answers to is the player's note, not wargear the unit lost.
  const noteAt = unplaced.findIndex(
    (choice) => normalized(choice.name) === normalized(unit.noteOrWargear ?? '') && choice.reason.startsWith('nothing in'),
  )
  if (noteAt >= 0) {
    unplaced.splice(noteAt, 1)
    pick.note = textNote([unit.noteOrWargear!, ...(pick.note ? [pick.note] : [])])
  }
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
    // A model's own weapons and abilities can be wargear another builder lists, as Azrael's Lion Helm.
    const weapons =
      target.type === 'model'
        ? (target.profiles ?? []).flatMap((held) => (held.typeName !== 'Unit' && held.name) || [])
        : (target.profiles ?? []).flatMap((held) => held.name?.replace(/^➤\s*/, '').replace(/\s+-\s+.+$/, '') ?? [])
    // A group holds nothing itself, though it is often named after its default, as a Lord Commissar's "Power Weapon" holds a power fist.
    // It does field the kind of model it counts, as "9 Traitor Guardsmen" fields Traitor Guardsmen.
    const kind = target.type === undefined ? groupKind(nameOf(definition, index.definitions)) : undefined
    if (kind && node.selections?.some((child) => (child.count ?? 1) > 0)) found.add(kind)
    const names =
      target.type === undefined
        ? []
        : [nameOf(definition, index.definitions), target.name, profile, ...weapons, ...grantedKeywords(definition, target, index)]
    for (const name of names) {
      if (!name) continue
      found.add(withoutArticle(name))
      found.add(withoutArticle(upgradeName(name.replace(modelLoadout, ''))))
      // A model named for what it carries, as a "Wulfen w/Death Totem", carries it.
      const loadout = target.type === 'model' ? name.match(modelLoadout)?.[1] : undefined
      if (loadout) found.add(withoutArticle(loadout))
      if (target.type === 'model') for (const alias of modelAliases(name)) found.add(withoutArticle(alias))
      else for (const alias of nameVariants(name)) found.add(withoutArticle(alias))
      // A piece the catalogue names for two weapons carries each, as a Techmarine's "Omnissian Power Axe and Servo-arm"
      // or a Captain in Gravis Armour's "Boltstorm Gauntlet, Powerfist, and Relic weapon".
      const parts = name.split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
      if (target.type !== 'model' && parts.length > 1) for (const part of parts) found.add(withoutArticle(part))
    }
    node.selections?.forEach(walk)
  }
  walk(selection)
  return found
}

/** The one melee weapon every model of a datasheet starts with, or null where they start with several or none. */
function soleDefaultMelee(
  entryId: string,
  index: LoadedCatalogue['index'],
  context: { primaryCatalogueId: string; roster: readonly Selection[] },
) {
  const names = new Set<string>()
  const walk = (node: Selection) => {
    const definition = index.definitions.get(node.id)
    const target = definition && resolve(definition, index)
    const linked = (target?.infoLinks ?? []).flatMap((link) => (link.type === 'profile' ? [index.shared.get(link.targetId)] : []))
    if (
      definition &&
      target?.type === 'upgrade' &&
      [...(target.profiles ?? []), ...linked].some((held) => held && 'typeName' in held && held.typeName === 'Melee Weapons')
    )
      names.add(normalized(nameOf(definition, index.definitions)))
    node.selections?.forEach(walk)
  }
  const built = buildUnit(entryId, index, undefined, {}, context)
  if (built) walk(built.selection)
  return names.size === 1 ? [...names][0]! : null
}

/** The keywords an upgrade gives its unit, which the official app prints in place of the upgrade, as Steel Hammer's "Keywords: Character". */
function grantedKeywords(definition: Definition, target: Definition, index: LoadedCatalogue['index']) {
  // A Trygon's Character upgrade grants it in a group that also makes it the primary keyword.
  const modifiers = [definition, target].flatMap((source) => [
    ...(source.modifiers ?? []),
    ...(source.modifierGroups ?? []).flatMap((group) => group.modifiers ?? []),
  ])
  return modifiers.flatMap((modifier) => {
    if (modifier.field !== 'category' || modifier.type !== 'add' || typeof modifier.value !== 'string') return []
    const keyword = index.categories.get(modifier.value)?.name
    return keyword ? [normalized(keyword)] : []
  })
}

const withoutArticle = (name: string) => normalized(name).replace(/^the /, '')

/** Whether a built unit holds a stated name, however spelled, including Warmind's "Splinter Pistol and 1 Razorflail" for a loadout that holds both. */
function isCarried(name: string, carried: ReadonlySet<string>) {
  const keys = new Set([...carried].map(spellingKey))
  const has = (piece: string) => keys.has(spellingKey(withoutArticle(piece)))
  const parts = name.split(/\s+and\s+(?:\d+\s+)?/)
  return has(name) || (parts.length > 1 && parts.every(has))
}

/**
 * Every kind of model a datasheet can field, by entry and stat-line name, so stated model lines size the squad.
 * Exporters can name a "Recon Trooper w/ Long-las" by the model alone.
 */
function modelNames(entryId: string, index: LoadedCatalogue['index']) {
  const names = new Set<string>()
  eachDefinition([entryId], index, (definition, target) => {
    const kind = groupKind(nameOf(definition, index.definitions))
    if (kind && childrenOf(definition, index).some((child) => resolve(child.definition, index).type === 'model')) names.add(kind)
    if (target.type !== 'model') return
    for (const name of [nameOf(definition, index.definitions), modelProfileOf(definition, index)]) {
      if (!name) continue
      for (const alias of modelAliases(name)) names.add(alias)
    }
  })
  return names
}

/** Each model a datasheet fields, by its name, stat line and kinds, and the wargear it can carry keyed by spellingKey. */
function modelLoadouts(entryId: string, index: LoadedCatalogue['index']) {
  const found: { name: string; profile: string; kinds: string[]; pieces: Set<string> }[] = []
  eachDefinition([entryId], index, (definition, target) => {
    if (target.type !== 'model') return
    const pieces = new Set<string>()
    eachDefinition([definition.id], index, (held, heldTarget) => {
      if (heldTarget.type === 'upgrade') for (const name of nameVariants(nameOf(held, index.definitions))) pieces.add(spellingKey(name))
    })
    const name = normalized(nameOf(definition, index.definitions))
    found.push({ name, profile: normalized(modelProfileOf(definition, index) ?? ''), kinds: modelAliases(name), pieces })
  })
  return found
}

/** A datasheet's names keyed by spellingKey, as BSData's "Relic Great Axe" is the app's "Relic Greataxe"; null where two collide. */
function respelledNames(entryId: string, index: LoadedCatalogue['index']) {
  const names = new Map<string, string | null>()
  const prefixed: [string, string][] = []
  const root = index.definitions.get(entryId)
  const unitWords = new Set(root ? normalized(nameOf(root, index.definitions)).split(' ').flatMap(nameVariants) : [])
  eachDefinition([entryId], index, (definition, target) => {
    // A model also goes by its stat line's name, as a Talonstrike Kill Team's "Kill Team Intercessor w/ Jump Pack".
    const profile = target.type === 'model' ? modelProfileOf(definition, index) : null
    for (const name of new Set([nameOf(definition, index.definitions), target.name ?? '', profile ?? ''].filter(Boolean).map(normalized))) {
      const key = spellingKey(name)
      names.set(key, names.has(key) && names.get(key) !== name ? null : name)
      // The catalogue can name a piece after its unit where a list does not, as a Gladiator Lancer's "Lancer laser destroyer".
      const words = name.split(' ')
      const at = words.findIndex((word, position) => !unitWords.has(word) || position === words.length - 1)
      if (at > 0) prefixed.push([spellingKey(words.slice(at).join(' ')), name])
      // The official app can name a model without its unit's last words, as a Paragon Warsuit is a "Paragon".
      if (target.type === 'model')
        for (let end = words.length - 1; end > 0 && unitWords.has(words[end]!); end--)
          prefixed.push([spellingKey(words.slice(0, end).join(' ')), name])
      // And by its kind without the unit's first words, as a Terminator Assault Squad's "Assault Terminator w/ Twin Lightning Claws" is a "Terminator".
      const kind = name.replace(modelLoadout, '').split(' ')
      const from = kind.findIndex((word, position) => !unitWords.has(word) || position === kind.length - 1)
      if (target.type === 'model' && from > 0 && kind.length < words.length)
        prefixed.push([spellingKey(kind.slice(from).join(' ')), kind.join(' ')])
    }
    if (target.type !== 'model') return
    // BSData can rename a model's stat line and keep an older spelling on its entry, as Hellions' "Heliarch" prints as "Helliarch".
    const statLines = [
      ...(target.profiles ?? []).filter((held) => held.typeName === 'Unit'),
      ...(target.infoLinks ?? []).filter((link) => {
        const linked = link.type === 'profile' ? index.shared.get(link.targetId) : undefined
        return linked && 'typeName' in linked && linked.typeName === 'Unit'
      }),
    ]
    for (const renamed of statLines.flatMap((line) => line.modifiers ?? []).flatMap(nameSetBy))
      prefixed.push([spellingKey(normalized(renamed)), normalized(nameOf(definition, index.definitions))])
  })
  // Only where the catalogue's own names leave the key free; two such names for one key mean neither.
  const unprefixed = new Map<string, string | null>()
  for (const [key, name] of prefixed) unprefixed.set(key, unprefixed.has(key) && unprefixed.get(key) !== name ? null : name)
  for (const [key, name] of unprefixed) if (!names.has(key)) names.set(key, name)
  return names
}

/** Models the catalogue names for wargear only they carry, keyed by whose it is, as Gaunt's Ghosts' "Colm Corbec" is a "Tanith Ghost w/ Corbec's hot-shot lascarbine". */
function bearerNames(entryId: string, index: LoadedCatalogue['index']) {
  const names = new Map<string, string | null>()
  eachDefinition([entryId], index, (definition, target) => {
    if (target.type !== 'model') return
    const name = normalized(nameOf(definition, index.definitions))
    const owner = name.match(/\s(?:w\/|with)\s*(.+?)'s\s/)?.[1]
    if (!owner) return
    const key = spellingKey(owner)
    names.set(key, names.has(key) && names.get(key) !== name ? null : name)
  })
  return names
}

/** The name a modifier always gives what it modifies. */
const nameSetBy = (modifier: Modifier) =>
  modifier.field === 'name' &&
  modifier.type === 'set' &&
  !modifier.conditions?.length &&
  !modifier.conditionGroups?.length &&
  typeof modifier.value === 'string'
    ? [modifier.value]
    : []

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
      for (const name of (definition.modifiers ?? []).flatMap(nameSetBy)) names.add(normalized(name))
    }
    for (const child of childrenOf(definition, index)) walk(child.definition, warlord)
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
          for (const keyword of grantedKeywords(definition, target, loaded.index)) if (!names.has(keyword)) names.set(keyword, 1)
          // And to the weapons its profiles print, as "Particle caster and voidblade" holds a particle caster and a voidblade.
          for (const profile of target.profiles ?? []) {
            if (!/weapon/i.test(profile.typeName ?? '') || !profile.name) continue
            const name = normalized(profile.name.replace(/^➤\s*/, '').replace(/\s+-\s+.+$/, ''))
            if (!names.has(name)) names.set(name, 1)
          }
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
 * hull lascannon is not read as one of the heavy bolters the sponsons account for;
 * failing that, a name only the choices enclosing or nested in this one also offer.
 */
function singleChoice(
  options: readonly { id: string }[],
  aliases: ReadonlyMap<string, ReadonlyMap<string, number>>,
  counts: ReadonlyMap<string, number> | undefined,
  stated: ReadonlyMap<string, number>,
  offeredBy: ReadonlyMap<string, number>,
  offeredApart: ReadonlyMap<string, number> = offeredBy,
) {
  // A zero says the rest of the unit accounts for every one stated, as the squad's
  // splinter pistols do when only the leader's blast pistol is hers.
  const candidates = options.filter((option) => (counts?.get(option.id) ?? 0) > 0)
  const exclusive = (offers: ReadonlyMap<string, number>) =>
    candidates.find((option) => [...(aliases.get(option.id)?.keys() ?? [])].some((name) => offers.get(name) === 1 && stated.has(name)))
  return (exclusive(offeredBy) ?? exclusive(offeredApart) ?? candidates[0])?.id
}

function countsForChoice(
  {
    options,
    room,
  }: { options: readonly { id: string; name: string; count: number; min: number; max: number; default?: boolean }[]; room: number },
  aliases: ReadonlyMap<string, ReadonlyMap<string, number>>,
  stated: ReadonlyMap<string, number>,
  held: ReadonlyMap<string, number>,
  models: ReadonlySet<string>,
  offeredBy: ReadonlyMap<string, number>,
  wargearOfOption: (id: string) => ReadonlyMap<string, number>,
  besides: (name: string) => number,
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
  // A model replacing a squadmate keeps what that squadmate carried, so a bolt pistol the
  // rest of the unit also holds cannot rule out the Berzerker who swapped his chainblade.
  // Such a model takes only what no other choice could hold instead: a plasma pistol may
  // be the Champion's, an eviscerator only a Berzerker's.
  const undecided = new Set<string>()
  for (const option of options) {
    const owned = [...(aliases.get(option.id) ?? [])]
      .filter(([name]) => owners.get(name) === 1 && stated.has(name))
      .map(([name, each]) => ({ name, elsewhere: Math.max(0, (held.get(name) ?? 0) - inChoice(name)), stated: stated.get(name)!, each }))
    // What the option is and holds says how many took it better than a swap it merely allows, as a cyclone
    // Terminator's launchers count him where the thunder hammer he could take instead does not.
    const pieces = wargearOfOption(option.id)
    const labels = new Set([option.name, upgradeName(option.name), option.name.match(modelLoadout)?.[1] ?? ''].map(normalized))
    const holds = owned.filter((name) => pieces.has(name.name) || labels.has(name.name))
    const marks = holds.length ? holds : owned
    const alone = marks.filter((name) => name.elsewhere === 0)
    const distinctive = (alone.length ? alone : marks).map(({ elsewhere, stated: count, each }) =>
      Math.ceil(Math.max(0, count - elsewhere) / Math.max(1, each)),
    )
    if (!distinctive.length) continue
    distinctiveCounts.set(option.id, Math.min(...distinctive))
    if (!alone.length && !distinctiveCounts.get(option.id) && models.has(normalized(option.name))) undecided.add(option.id)
  }
  // Wargear a choice of several has no room for is left to another, as a Crisis Shas'vre takes the drones its Shas'ui
  // cannot, and a Rhino's second combi-bolter is its own rather than one its wargear adds. What no other choice offers
  // goes first, as a Talos's liquifier guns before the macro-scalpels its other arm can take, then the fewest, so a
  // squad's one axe stays beside the spears that overflow it.
  if (room > 1) {
    const wargear = options.filter((option) => distinctiveCounts.has(option.id) && !models.has(normalized(option.name)))
    const shared = (option: { id: string }) =>
      Math.min(...[...(aliases.get(option.id)?.keys() ?? [])].filter((name) => stated.has(name)).map((name) => offeredBy.get(name) ?? 1))
    let free =
      room - [...distinctiveCounts].reduce((total, [id, count]) => total + (wargear.some((option) => option.id === id) ? 0 : count), 0)
    const placing = wargear.toSorted(
      (left, right) => shared(left) - shared(right) || distinctiveCounts.get(left.id)! - distinctiveCounts.get(right.id)!,
    )
    // What no other choice has room for is placed here first, when the others can hold the rest; a list stating more
    // than the unit holds keeps the order above.
    const elsewhere = (option: (typeof options)[number]) =>
      Math.min(
        distinctiveCounts.get(option.id)!,
        Math.max(0, ...[...(aliases.get(option.id) ?? [])].filter(([name]) => stated.has(name)).map(([name]) => besides(name))),
      )
    const forced = (option: (typeof options)[number]) => distinctiveCounts.get(option.id)! - elsewhere(option)
    const placed = new Map<string, number>()
    const fitting = placing.reduce((total, option) => total + distinctiveCounts.get(option.id)! - elsewhere(option), 0) <= free
    // Where the rest could go either way, the datasheet's default stays here, as a cyclone Terminator's power fist.
    const settling = fitting ? placing.toSorted((left, right) => Number(!left.default) - Number(!right.default)) : placing
    for (const [share, order] of [
      [fitting ? forced : () => 0, placing],
      [(option: (typeof options)[number]) => distinctiveCounts.get(option.id)!, settling],
    ] as const)
      for (const option of order) {
        const before = placed.get(option.id) ?? 0
        const fits = Math.max(0, Math.min(share(option), option.max, before + free) - before)
        placed.set(option.id, before + fits)
        free -= fits
      }
    for (const [id, count] of placed) distinctiveCounts.set(id, count)
  }
  if (!distinctiveCounts.size) {
    const named = new Map(
      options.flatMap((option) => {
        const count = stated.get(normalized(option.name))
        return count === undefined ? [] : [[option.id, count]]
      }),
    )
    return named.size ? named : (combinedCounts(options, room, models, wargearOfOption, stated, held) ?? named)
  }

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
      .filter((option) => !distinctiveCounts.has(option.id) || undecided.has(option.id))
      .filter((option) => [...(aliases.get(option.id)?.keys() ?? [])].every((name) => owners.get(name) === 1 || isStated(name)))
      .map((option) => ({
        option,
        names: [...(aliases.get(option.id) ?? [])].filter(
          ([name]) => owners.get(name)! > 1 && leftOver(name) > 0 && (!undecided.has(option.id) || offeredBy.get(name) === 1),
        ),
      }))
      .filter(({ names }) => names.length)
      .sort((left, right) => right.names.length - left.names.length)
    const free = room - [...distinctiveCounts.values()].reduce((total, count) => total + count, 0)
    if (!best || free <= 0) return distinctiveCounts
    undecided.delete(best.option.id)
    distinctiveCounts.set(best.option.id, Math.min(free, ...best.names.map(([name, each]) => Math.floor(leftOver(name) / each))))
  }
}

/**
 * The catalogue's name for each enhancement the Munitorum Field Manual spells differently,
 * as its "Biomorph Adaptation" is BSData's "Biomorph Adaption": the one option this unit is
 * offered that the manual names nowhere in the list's detachments, at the same points.
 */
function enhancementRespellings(
  entryId: string,
  catalogueId: string,
  detachmentIds: readonly string[],
  loaded: LoadedCatalogue,
  context: { primaryCatalogueId: string; roster: readonly Selection[] },
) {
  const names = new Map<string, string>()
  const detachments = loaded.detachments.get(catalogueId)?.options.filter((option) => detachmentIds.includes(option.id)) ?? []
  const manual = detachments.flatMap(
    (detachment) => mfmDetachmentFor(loaded, catalogueId, detachment.name)?.enhancements?.filter((entry) => !isUpgrade(entry.name)) ?? [],
  )
  const built = buildUnit(entryId, loaded.index, undefined, {}, context)
  if (!manual.length || !built) return names
  const inManual = (name: string) => manual.some((entry) => normalized(entry.name) === normalized(name))
  const offered = unitChoices(entryId, built.selection, loaded.index, context).flatMap((choice) => choice.options)
  for (const entry of manual) {
    if (offered.some((option) => normalized(option.name) === normalized(entry.name))) continue
    const unnamed = offered.filter((option) => !inManual(option.name) && option.points === entry.points)
    if (unnamed.length === 1) names.set(normalized(entry.name), normalized(unnamed[0]!.name))
  }
  return names
}

/** The wargear an option brings, each piece under its one catalogue name. */
function optionWargear(id: string, loaded: LoadedCatalogue, context: { primaryCatalogueId: string; roster: readonly Selection[] }) {
  const counts = new Map<string, number>()
  const selection = defaultSelection(id, loaded.index, context)
  for (const piece of selection ? wargearOf(selection, loaded.index) : [])
    counts.set(normalized(piece.name), (counts.get(normalized(piece.name)) ?? 0) + piece.count)
  return counts
}

/**
 * How many of each option add up to the wargear a list states, where every piece comes in
 * more than one option, as a Kataphron Breacher's arms do in "Heavy arc rifle & hydraulic
 * claw" and "Torsion cannon & hydraulic claw". Null unless it accounts for some of what
 * the list states; a choice that is full stays full.
 */
function combinedCounts(
  options: readonly { id: string; count: number; min: number; max: number }[],
  room: number,
  models: ReadonlySet<string>,
  wargearOfOption: (id: string) => ReadonlyMap<string, number>,
  stated: ReadonlyMap<string, number>,
  held: ReadonlyMap<string, number>,
) {
  const wargear = options.map((option) => wargearOfOption(option.id))
  const names = [...new Set(wargear.flatMap((pieces) => [...pieces.keys()]))]
  const spelled = (counts: ReadonlyMap<string, number>, name: string) =>
    nameVariants(name)
      .map((variant) => counts.get(variant))
      .find((count) => count !== undefined) ?? 0
  // A piece the unit neither carries nor these options start with, as a heavy weapon
  // Terminator's cyclone, comes through another choice these counts cannot weigh.
  const known = new Set([...names, ...held.keys(), ...models].flatMap(nameVariants))
  if ([...stated.keys()].some((name) => !known.has(name))) return null
  const inChoice = (name: string) => options.reduce((total, option, at) => total + option.count * (wargear[at]!.get(name) ?? 0), 0)
  // What the rest of the unit carries is not this choice's to account for, and a piece the list prints none of, as the
  // autopistols the official app leaves off Jakhals, says nothing about which loadout was taken.
  const weighed = names.filter((name) => spelled(stated, name) > 0)
  const target = weighed.map((name) => Math.max(0, spelled(stated, name) - Math.max(0, spelled(held, name) - inChoice(name))))
  const unexplained = target.reduce((total, count) => total + count, 0)
  if (!unexplained) return null
  const full = options.reduce((total, option) => total + option.count, 0) >= room
  const cost = (counts: readonly number[]) =>
    weighed.reduce(
      (total, name, at) =>
        total + Math.abs(counts.reduce((sum, count, option) => sum + count * (wargear[option]!.get(name) ?? 0), 0) - target[at]!),
      0,
    )
  const current = options.map((option) => option.count)
  let best = { cost: cost(current), counts: current }
  let budget = 100_000
  const counts = options.map(() => 0)
  const visit = (at: number, left: number) => {
    if (--budget < 0) return
    if (at === options.length) {
      if (full && left > 0) return
      const total = cost(counts)
      if (total < best.cost) best = { cost: total, counts: [...counts] }
      return
    }
    const option = options[at]!
    for (let count = option.min; count <= Math.min(option.max, left); count++) {
      counts[at] = count
      visit(at + 1, left - count)
    }
    counts[at] = 0
  }
  visit(0, room)
  return best.cost < unexplained ? new Map(options.map((option, at) => [option.id, best.counts[at]!])) : null
}

type ExportPrice = {
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
}

/** The disposition names a priced list fields: its chosen one, or every one its detachments allow. */
export const pricedDispositionNames = (
  priced: { disposition?: string | null; dispositions: readonly string[] },
  rules: Pick<LoadedRules, 'dispositions'> | null,
) => (priced.disposition ? [priced.disposition] : priced.dispositions).map((id) => rules?.dispositions.get(id) ?? id)

export function exportRosterFile(data: ExportRosterInput, loaded: LoadedCatalogue, priced: ExportPrice, dispositionNames: string[]) {
  return {
    text: toGwText(readableRoster(data, loaded, priced, dispositionNames), version) + gwTextVersionLines(loaded.edition, data.catalogueId),
    name: data.name,
    omittedUnitCount: data.units.length - priced.units.length,
  }
}

/** A priced list by name, points, loadout and attachment, as the readable export prints it. */
export function readableRoster(data: ExportRosterInput, loaded: LoadedCatalogue, priced: ExportPrice, dispositionNames: string[]) {
  const faction = loaded.index.catalogues.get(data.catalogueId)?.name ?? data.catalogueId
  const keyedPicks = data.units.map((pick, key) => ({ ...pick, key }))
  const unitsByPick = data.units.map((pick, index) => {
    const unit = priced.units.find((candidate) => candidate.key === index)
    return unit && { ...unit, name: nicknamedUnit(unit.name, textNickname(pick.nickname ?? '')) }
  })
  return {
    name: data.name,
    faction: factionDisplayName(faction),
    detachments: priced.detachments.map(({ name, points }) => ({ name, points })),
    dispositions: dispositionNames,
    size: GAME_SIZES.find((size) => size.limit === data.limit)?.name ?? 'Battle',
    limit: data.limit,
    ...(data.pointsBudget ? { pointsBudget: data.pointsBudget } : {}),
    points: priced.points,
    units: priced.units.map((unit) => ({
      name: unit.name,
      nickname: textNickname(data.units[unit.key]?.nickname ?? ''),
      models: unit.size.models,
      entry: unit.key + 1,
      attachedToEntry: data.units[unit.key]?.attachedTo !== undefined ? data.units[unit.key]!.attachedTo! + 1 : undefined,
      points: unit.points,
      group: gwTextGroup(unit.group),
      warlord: Object.values(data.units[unit.key]?.toggles ?? {}).some((count) => count > 0),
      joined: attachmentRows(keyedPicks, unitsByPick, unit.key).map(({ label, name }) => ({ label, name })),
      enhancements: unit.enhancements,
      upgrades: unit.upgrades,
      wargear: unit.wargear.map(({ name, count }) => ({ name, count })),
    })),
  } satisfies GwTextRoster
}
