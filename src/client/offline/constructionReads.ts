import type * as server from '../../server/functions'
import { priceSchema, datasheetSchema, combatLoadoutSchema, reminderAbilitiesSchema } from '../../contracts/schemas'
import { datasheetReminderAbilities } from '../../shared/reminderAbilities'
import { calculateRosterPrice } from '../../shared/pricing'
import { pickerUnitsFor, booksOffering } from '../../shared/pickerUnits'
import { rosterDatasheetContext } from '../../shared/rosterDatasheetContext'
import { rosterDatasheet, rosterLoadoutDatasheets } from '../../shared/rosterReads'
import { rosterCombatant } from '../../shared/rosterCombatRules'
import { combatLoadoutSpace } from '../../shared/combatLoadouts'
import { exportRosterFile, importRosterFile, importRosterExchange, pricedDispositionNames } from '../../shared/rosterFiles'
import { ROSTER_EXCHANGE_RULES_UNAVAILABLE, type decodeRosterExchange } from '../../core/rosterExchange'
import { battleDetachmentData, selectedBattleDetachmentData } from '../../shared/battleDetachmentData'
import { unitBattleDetailsIn, unitWoundsIn } from '../../shared/catalogue'
import { rosterCombatantsSchema } from '../../contracts/combatCalculation'
import { rosterCombatants } from '../../shared/rosterCombatants'
import type { LoadedCatalogue } from '../../shared/catalogueIndex'
import type { LoadedRules } from '../../shared/rules'
import { ROSTER_PRICED_SAMPLE_RATE, rosterDatasheetLoadedProperties, rosterPricedProperties } from '../../shared/rosterTelemetry'

type Construction = { catalogue: LoadedCatalogue; rules: LoadedRules }
type Data<F extends (...args: never[]) => unknown> = Parameters<F>[0] extends { data: infer D } ? D : never

/**
 * Reads answered from downloaded construction data, by name so the construction worker and the page run the same
 * function. Each takes only data that survives `postMessage`.
 */
export const constructionReads = {
  priceRoster: ({ catalogue, rules }: Construction, data: Data<typeof server.priceRoster>) =>
    calculateRosterPrice(priceSchema.parse(data), catalogue, rules),
  units: ({ catalogue, rules }: Construction, data: Data<typeof server.units>) =>
    pickerUnitsFor(catalogue, rules, data.catalogueId, data.query ?? '', data.battleSize, data.waivedRules, data.detachmentIds),
  booksOffering: ({ catalogue, rules }: Construction, data: { entryId: string; catalogueId: string }) =>
    booksOffering(catalogue, rules, data.entryId, [data.catalogueId]),
  datasheet: ({ catalogue, rules }: Construction, data: Data<typeof server.datasheet>) =>
    rosterDatasheet(catalogue, data, rosterDatasheetContext(catalogue, datasheetSchema.parse(data)), data.everyWeapon ?? false, rules),
  loadoutDatasheets: ({ catalogue, rules }: Construction, data: Data<typeof server.loadoutDatasheets>) =>
    rosterLoadoutDatasheets(catalogue, datasheetSchema.parse(data), rules),
  combatantDatasheet: ({ catalogue, rules }: Construction, data: Data<typeof server.combatantDatasheet>) =>
    rosterCombatant(catalogue, rules, { ...datasheetSchema.parse(data), inactivePicks: data.inactivePicks }),
  combatantDatasheets: ({ catalogue, rules }: Construction, data: Data<typeof server.combatantDatasheets>) =>
    rosterCombatants(catalogue, rules, rosterCombatantsSchema.parse(data)),
  combatLoadouts: ({ catalogue }: Construction, data: Data<typeof server.combatLoadouts>) =>
    combatLoadoutSpace(catalogue, combatLoadoutSchema.parse(data)),
  unitWounds: ({ catalogue }: Construction, data: Data<typeof server.unitWounds>) =>
    unitWoundsIn(catalogue, data.catalogueId, data.entryIds),
  reminderAbilities: ({ catalogue, rules }: Construction, data: Data<typeof server.reminderAbilities>) =>
    datasheetReminderAbilities(catalogue, rules, reminderAbilitiesSchema.parse(data)),
  unitBattleDetails: ({ catalogue }: Construction, data: Data<typeof server.unitBattleDetails>) =>
    unitBattleDetailsIn(catalogue, data.catalogueId, data.entryIds),
  detachmentRules: ({ catalogue, rules }: Construction, data: Data<typeof server.detachmentRules>) => {
    const selected = battleDetachmentData(catalogue, rules, data.catalogueId)
    return selected ? selectedBattleDetachmentData(selected, data.detachmentNames) : null
  },
  exportRoster: ({ catalogue, rules }: Construction, data: Data<typeof server.exportRoster>) => {
    const priced = calculateRosterPrice(priceSchema.parse(data), catalogue, rules)
    if (!priced) throw new Error('Army data is unavailable.')
    return exportRosterFile(data, catalogue, { ...priced, disposition: priced.disposition ?? null }, pricedDispositionNames(priced, rules))
  },
  importExchange: (
    { catalogue, rules }: Construction,
    data: { exchange: Awaited<ReturnType<typeof decodeRosterExchange>>; factionName: string | null },
  ) => {
    if (data.factionName === null) throw new Error(ROSTER_EXCHANGE_RULES_UNAVAILABLE)
    return importRosterExchange(data.exchange, catalogue, rules, data.factionName)
  },
  importFile: (
    { catalogue, rules }: Construction,
    data: { file: Data<typeof server.importRoster>; matched: boolean; statedMissing: boolean; factionNames: string[] },
  ) => {
    if (data.statedMissing) throw new Error('The exported codex version is not available.')
    return importRosterFile(data.file, data.matched ? catalogue : null, data.factionNames, rules)
  },
}

/**
 * Reads the server records as product events (`roster_exported`, `roster_imported`). They are one-off actions, so
 * they stay on the server while it answers; the device answers them only when it cannot.
 */
export const SERVER_READS = new Set<ConstructionReadName>(['exportRoster', 'importExchange', 'importFile'])

type ReadEvent = { name: string; properties: Record<string, unknown>; sampleRate?: number }

/** The event the server records for a read, which the device records instead when it answers. */
export const constructionReadEvents: {
  [K in ConstructionReadName]?: (construction: Construction, data: ConstructionReadData<K>, result: ConstructionReadResult<K>) => ReadEvent
} = {
  priceRoster: ({ catalogue, rules }, data, result) => ({
    name: 'roster_priced',
    properties: rosterPricedProperties(data, catalogue, rules, result),
    sampleRate: ROSTER_PRICED_SAMPLE_RATE,
  }),
  loadoutDatasheets: (_, data, result) => ({
    name: 'roster_datasheet_loaded',
    properties: rosterDatasheetLoadedProperties(datasheetSchema.parse(data), result),
  }),
}

export type ConstructionReadEvent = ReadEvent

export type ConstructionReads = typeof constructionReads
export type ConstructionReadName = keyof ConstructionReads
export type ConstructionReadData<K extends ConstructionReadName> = Parameters<ConstructionReads[K]>[1]
export type ConstructionReadResult<K extends ConstructionReadName> = ReturnType<ConstructionReads[K]>

/** What each read's server function answers; the device must answer the same so a page cannot tell them apart. */
type ServerAnswers = {
  priceRoster: Awaited<ReturnType<typeof server.priceRoster>>
  units: Awaited<ReturnType<typeof server.units>>
  booksOffering: Awaited<ReturnType<typeof server.datasheetOfferedBy>>
  datasheet: Awaited<ReturnType<typeof server.datasheet>>
  loadoutDatasheets: Awaited<ReturnType<typeof server.loadoutDatasheets>>
  combatantDatasheet: Awaited<ReturnType<typeof server.combatantDatasheet>>
  combatantDatasheets: Awaited<ReturnType<typeof server.combatantDatasheets>>
  combatLoadouts: Awaited<ReturnType<typeof server.combatLoadouts>>
  unitWounds: Awaited<ReturnType<typeof server.unitWounds>>
  reminderAbilities: Awaited<ReturnType<typeof server.reminderAbilities>>
  unitBattleDetails: Awaited<ReturnType<typeof server.unitBattleDetails>>
  detachmentRules: Awaited<ReturnType<typeof server.detachmentRules>>
  exportRoster: Awaited<ReturnType<typeof server.exportRoster>>
  importExchange: Awaited<ReturnType<typeof server.importRoster>>
  importFile: Awaited<ReturnType<typeof server.importRoster>>
}
type Agreement = { [K in ConstructionReadName]: ConstructionReadResult<K> extends ServerAnswers[K] ? true : K }
/** Fails to compile, naming the read, when a device read answers differently from its server function. */
type EveryReadAgrees<T extends Record<ConstructionReadName, true>> = T
export type ReadsAnswerAsServer = EveryReadAgrees<Agreement>
