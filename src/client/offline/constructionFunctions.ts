import type { RosterPick } from '../../core/roster'
import * as server from '../../server/functions'
import { constructionRead } from './construction'
import { deviceLoadoutSearch, prepareDeviceConstruction } from './constructionWorker'
import type { ConstructionReadData, ConstructionReadName } from './constructionReads'
import { matchesImportFaction, importRosterFaction, importRosterCatalogueId } from '../../shared/rosterFiles'
import { decodeRosterExchange, isRosterExchangeCode } from '../../core/rosterExchange'
import { loadSavedQuery, referenceData, savedQuery } from './runtime'
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
export const datasheet = read('datasheet', (args) => server.datasheet(args))
export const loadoutDatasheets = read('loadoutDatasheets', (args) => server.loadoutDatasheets(args))
export const combatantDatasheet = read('combatantDatasheet', (args) => server.combatantDatasheet(args))
// A roster comparison sends these together and a device without the army's rules has no answer of its own, so a short deadline blanks whole rows.
export const combatantDatasheets = read('combatantDatasheets', (args) => server.combatantDatasheets(args), 16_000)
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
      { exchange, factionName: faction?.name ?? null },
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
  const faction = stated ? candidates.find((candidate) => matchesImportFaction(stated, candidate.name, new Map(translations))) : null
  return constructionRead(
    'importFile',
    {
      file: args.data,
      matched: Boolean(faction),
      statedMissing: Boolean(statedId && !faction),
      factionNames: factions.map((candidate) => candidate.name),
      translations,
    },
    (signal) => server.importRoster({ ...args, signal }),
    faction?.id,
    args.signal,
  )
}

/** Exact root IDs are absent from the faction index, so a book read for a roster answers first. */
async function savedFaction(id: string, factions: { id: string; name: string }[]) {
  return (await loadFaction(id)) ?? factions.find((candidate) => candidate.id === id)
}

type SavedFaction = NonNullable<Awaited<ReturnType<typeof server.rosterBootstrap>>>['faction']
export const loadFaction = (id: string) => loadSavedQuery<SavedFaction>(referenceData(), factionKey(id))
export const factionFor = (id: string) => savedQuery<SavedFaction>(referenceData(), factionKey(id))
