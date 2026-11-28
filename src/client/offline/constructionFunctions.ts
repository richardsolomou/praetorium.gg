import type { RosterPick } from '../../core/roster'
import * as server from '../../server/functions'
import { constructionRead } from './construction'
import { deviceLoadoutSearch, prepareDeviceConstruction } from './constructionWorker'
import type { ConstructionReadData, ConstructionReadName } from './constructionReads'
import { matchesImportFaction, importRosterFaction, importRosterCatalogueId } from '../../shared/rosterFiles'
import { decodeRosterExchange, isRosterExchangeCode } from '../../core/rosterExchange'
import { loadSavedQuery, referenceData, referenceRead, savedQuery } from './runtime'
import { catalogueEditionId } from '../../core/catalogueEdition'
import { withVsDataSaves } from '../../shared/vsDataSaves'
import type { VsDataUnits } from '../../shared/vsData'
import { factionIndexKey, importTranslationsKey, factionKey } from '../queries/queryKeys'

const read =
  <K extends ConstructionReadName, T>(
    name: K,
    online: (args: { data: ConstructionReadData<K>; signal?: AbortSignal }) => Promise<T>,
    serverTimeoutMs?: number,
  ) =>
  (args: { data: ConstructionReadData<K> & { catalogueId?: string }; signal?: AbortSignal }) =>
    constructionRead(name, args.data, (signal) => online({ ...args, signal }), args.data.catalogueId, args.signal, serverTimeoutMs)

/** A unit's loadouts as a stream of candidate batches, searched on this device when it has the data, otherwise by the server. */
export const loadoutSearch = async (
  input: {
    catalogueId: string
    detachmentIds: readonly string[]
    picks: readonly RosterPick[]
    pickIndex: number
    walk?: { seed: number; steps: number }
  },
  signal: AbortSignal,
) =>
  deviceLoadoutSearch(input, signal) ??
  fetch('/api/simulator/optimize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify(input),
  })

/** Prepares a faction's units on the device ahead of the roster that will list them. */
export const prepareFactionUnits = (catalogueId: string) => prepareDeviceConstruction(catalogueId, true)

export const priceRoster = read('priceRoster', (args) => server.priceRoster(args))
export const units = read('units', (args) => server.units(args))
export const datasheetOfferedBy = async (args: Parameters<typeof server.datasheetOfferedBy>[0]) =>
  (
    await Promise.all(
      args.data.catalogueIds.map((catalogueId) =>
        constructionRead(
          'booksOffering',
          { entryId: args.data.entryId, catalogueId },
          (signal) => server.datasheetOfferedBy({ data: { ...args.data, catalogueIds: [catalogueId] }, signal }),
          catalogueId,
          args.signal,
        ),
      ),
    )
  ).flat()
export const datasheet = read('datasheet', (args) => (args.data.picks?.length ? server.rosterUnitDatasheet(args) : server.datasheet(args)))
export const loadoutDatasheets = read('loadoutDatasheets', (args) => server.loadoutDatasheets(args))
// A combatant's invulnerable saves are VS Data's, whichever answers the read, so each rules version's units are fetched once.
const vsDataUnits = new Map<string, Promise<VsDataUnits | null>>()
function unitsFor(catalogueId: string | undefined) {
  const edition = (catalogueId && catalogueEditionId(catalogueId)) ?? null
  let held = vsDataUnits.get(edition ?? '')
  if (!held) {
    held = referenceRead(['rule-units', edition], () => server.ruleUnits({ data: { edition } })).catch(() => null)
    vsDataUnits.set(edition ?? '', held)
    void held.then((found) => found || vsDataUnits.delete(edition ?? ''))
  }
  return held
}
const readCombatant = read('combatantDatasheet', (args) => server.combatantDatasheet(args))
export const combatantDatasheet = async (args: Parameters<typeof readCombatant>[0]) => {
  const [combatant, typed] = await Promise.all([readCombatant(args), unitsFor(args.data.catalogueId)])
  return combatant && withVsDataSaves(combatant, typed)
}
// A roster comparison sends these together and a device without the army's rules has no answer of its own, so a short deadline blanks whole rows.
const readCombatants = read('combatantDatasheets', (args) => server.combatantDatasheets(args), 16_000)
export const combatantDatasheets = async (args: Parameters<typeof readCombatants>[0]) => {
  const [combatants, typed] = await Promise.all([readCombatants(args), unitsFor(args.data.catalogueId)])
  return combatants.map((combatant) => combatant && withVsDataSaves(combatant, typed))
}
export const combatLoadouts = read('combatLoadouts', (args) => server.combatLoadouts(args))
export const unitBattleDetails = read('unitBattleDetails', (args) => server.unitBattleDetails(args))
export const reminderAbilities = read('reminderAbilities', (args) => server.reminderAbilities(args))
export const detachmentRules = read('detachmentRules', (args) => server.detachmentRules(args))
export const exportRoster = read('exportRoster', (args) => server.exportRoster(args))
export const importRoster = async (args: Parameters<typeof server.importRoster>[0]) => {
  const factions = (await loadSavedQuery<Awaited<ReturnType<typeof server.factionIndex>>>(referenceData(), factionIndexKey()))?.factions
  if (isRosterExchangeCode(args.data.file)) {
    const exchange = await decodeRosterExchange(args.data.file)
    if (!factions) return server.importRoster(args)
    const faction = await savedFaction(exchange.catalogueId, factions)
    return constructionRead(
      'importExchange',
      { exchange, factionName: faction ? (savedBookNames(faction).at(-1) ?? null) : null },
      (signal) => server.importRoster({ ...args, signal }),
      faction?.id,
      args.signal,
    )
  }
  if (!factions) return server.importRoster(args)
  const translations = (await loadSavedQuery<[string, string[]][]>(referenceData(), importTranslationsKey())) ?? []
  const stated = importRosterFaction(args.data.file)
  const statedId = importRosterCatalogueId(args.data.file)
  const candidates = statedId
    ? [await savedFaction(statedId, factions)].filter((found) => found !== undefined)
    : factions.filter((found) => found.isDefault)
  const faction = stated
    ? candidates.find((candidate) =>
        matchesImportFaction(stated, { ...candidate, bookNames: savedBookNames(candidate) }, new Map(translations)),
      )
    : null
  return constructionRead(
    'importFile',
    {
      file: args.data,
      matched: Boolean(faction),
      statedMissing: Boolean(statedId && !faction),
      factionNames: factions.flatMap((candidate) => savedBookNames(candidate).slice(-1)),
      translations,
    },
    (signal) => server.importRoster({ ...args, signal }),
    faction?.id,
    args.signal,
  )
}

/** A saved faction's frozen book names; a download from an earlier release has only its catalogue name. */
const savedBookNames = (faction: { name: string; bookNames?: readonly string[] }) => faction.bookNames ?? [faction.name]

/** Exact root IDs are absent from the faction index, so a book read for a roster answers first. */
async function savedFaction(id: string, factions: { id: string; name: string; bookNames?: readonly string[] }[]) {
  return (await loadFaction(id)) ?? factions.find((candidate) => candidate.id === id)
}

type SavedFaction = NonNullable<Awaited<ReturnType<typeof server.rosterBootstrap>>>['faction']
export const loadFaction = (id: string) => loadSavedQuery<SavedFaction>(referenceData(), factionKey(id))
export const factionFor = (id: string) => savedQuery<SavedFaction>(referenceData(), factionKey(id))
