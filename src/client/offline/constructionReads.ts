import type * as server from '../../server/functions'
import { priceSchema, datasheetSchema, combatLoadoutSchema } from '../../contracts/schemas'
import { calculateRosterPrice } from '../../shared/pricing'
import { pickerUnitsFor, booksOffering } from '../../shared/pickerUnits'
import { rosterDatasheetContext } from '../../shared/rosterDatasheetContext'
import { rosterDatasheet, rosterLoadoutDatasheets } from '../../shared/rosterReads'
import { rosterCombatant } from '../../shared/rosterCombatRules'
import { combatLoadoutSpace } from '../../shared/combatLoadouts'
import { exportRosterFile, importRosterFile, importRosterExchange } from '../../shared/rosterFiles'
import { ROSTER_EXCHANGE_RULES_UNAVAILABLE, type decodeRosterExchange } from '../../core/rosterExchange'
import { battleDetachmentData, selectedBattleDetachmentData } from '../../shared/battleDetachmentData'
import { unitWoundsIn } from '../../shared/catalogue'
import { rosterCombatantsSchema } from '../../contracts/combatCalculation'
import { rosterCombatants } from '../../shared/rosterCombatants'
import type { LoadedCatalogue } from '../../shared/catalogueIndex'
import type { LoadedRules } from '../../shared/rules'

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
  detachmentRules: ({ catalogue, rules }: Construction, data: Data<typeof server.detachmentRules>) => {
    const selected = battleDetachmentData(catalogue, rules, data.catalogueId)
    return selected ? selectedBattleDetachmentData(selected, data.detachmentNames) : null
  },
  exportRoster: ({ catalogue, rules }: Construction, data: Data<typeof server.exportRoster>) => {
    const priced = calculateRosterPrice(priceSchema.parse(data), catalogue, rules)
    if (!priced) throw new Error('Army data is unavailable.')
    return exportRosterFile(
      data,
      catalogue,
      { ...priced, disposition: priced.disposition ?? null },
      (priced.disposition ? [priced.disposition] : priced.dispositions).map((id) => rules.dispositions.get(id) ?? id),
    )
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

export type ConstructionReads = typeof constructionReads
export type ConstructionReadName = keyof ConstructionReads
export type ConstructionReadData<K extends ConstructionReadName> = Parameters<ConstructionReads[K]>[1]
export type ConstructionReadResult<K extends ConstructionReadName> = ReturnType<ConstructionReads[K]>
