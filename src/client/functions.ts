import { partialMatchKey } from '@tanstack/react-query'
import { requireReviewedRoster, type ReviewedServerSave } from './offline/reviewedRoster'
import { projectBattles } from './offline/battleFunctions'
import { accountChanged, cachedRead, cachedPage } from './offline/reads'
import { hasLocalChanges, localOwner, syncLocalWork } from './offline/localRuntime'
import { lockedRosterRefusal } from '../core/rosterLock'
import { rosterDifferences } from '../core/rosterDifferences'
import { convertedSetup } from '../core/rosterSetup'
import { datasheetSchema, saveRosterSchema } from '../contracts/schemas'
import type { RosterPick } from '../core/roster'
import * as server from '../server/functions'
import { syncRoster } from '../server/functions/offline'
import { constructionRead, constructionData, localConstruction } from './offline/construction'
import { deviceLoadoutSearch, prepareDeviceConstruction } from './offline/constructionWorker'
import type { ConstructionReadData, ConstructionReadName } from './offline/constructionReads'
import {
  localClient,
  localDocument,
  localEngine,
  queueLocal,
  attemptLocalSync,
  rememberDocument,
  type LocalRoster,
  type RosterInput,
} from './offline/localRuntime'
import { calculateRosterPrice, savedRosterPriceInput } from '../shared/pricing'
import { rosterLoadoutDatasheets } from '../shared/rosterReads'
import { matchesImportFaction, importRosterFaction, importRosterCatalogueId } from '../shared/rosterFiles'
import { decodeRosterExchange, isRosterExchangeCode } from '../core/rosterExchange'
import { listUnitCount } from '../core/attachedUnits'
import { rosterUseProblem } from '../core/rosterLegality'
import { referenceData, savedQuery } from './offline/runtime'
import { orderVariantGroup, variantName } from '../core/rosterVariants'
import type { LocalState } from '../contracts/localState'
import { playerDefaults } from './offline/actionFunctions'
import { localRosterAssessment } from './offline/rosterAssessment'
import { calculationRead } from './offline/calculationRead'
import { anySignal } from './abortSignals'
import { rosterPriceKey } from './queries/rosterPriceKey'
import {
  armyUpdatesKey,
  catalogueChangesKey,
  combatUnitsKey,
  factionIndexKey,
  factionKey,
  friendBattlesKey,
  homeRostersKey,
  leagueBattlesKey,
  leagueKey,
  meKey,
  playerProfileKey,
  playerRankingsKey,
  battleRatingChangesKey,
  playerRostersKey,
  playerSearchKey,
  publicBattlesKey,
  rosterAccessKey,
  rosterBootstrapKey,
  rosterChangesKey,
  savedRosterChangedIdsKey,
  savedRosterPageKey,
  savedRosterSummariesKey,
  sharedRosterKey,
  standingsKey,
  userProfileKey,
} from './queries/queryKeys'

export * from '../server/functions'
export { browserAgentToolCatalog, callBrowserAgentTool, prepareBrowserAgentTool } from '../server/functions/agentTools'
export { mcpConnections, revokeMcpConnection } from '../server/functions/mcpConnections'

const read =
  <K extends ConstructionReadName, T>(name: K, online: (args: { data: ConstructionReadData<K>; signal?: AbortSignal }) => Promise<T>) =>
  (args: { data: ConstructionReadData<K> & { catalogueId?: string }; signal?: AbortSignal }) =>
    constructionRead(name, args.data, (signal) => online({ ...args, signal }), args.data.catalogueId, args.signal)

export { retireDeviceConstruction } from './offline/constructionWorker'

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
export const combatantDatasheets = read('combatantDatasheets', (args) => server.combatantDatasheets(args))
export const combatLoadouts = read('combatLoadouts', (args) => server.combatLoadouts(args))
export const unitWounds = read('unitWounds', (args) => server.unitWounds(args))
export const unitBattleDetails = read('unitBattleDetails', (args) => server.unitBattleDetails(args))
export const reminderAbilities = read('reminderAbilities', (args) => server.reminderAbilities(args))
export const detachmentRules = read('detachmentRules', (args) => server.detachmentRules(args))
export const exportRoster = read('exportRoster', (args) => server.exportRoster(args))
export const importRoster = async (args: Parameters<typeof server.importRoster>[0]) => {
  const factions = savedQuery<Awaited<ReturnType<typeof server.factionIndex>>>(referenceData(), factionIndexKey())?.factions
  if (isRosterExchangeCode(args.data.file)) {
    const exchange = await decodeRosterExchange(args.data.file)
    if (!factions) return server.importRoster(args)
    const faction = savedFaction(exchange.catalogueId, factions)
    return constructionRead(
      'importExchange',
      { exchange, factionName: faction?.name ?? null },
      (signal) => server.importRoster({ ...args, signal }),
      faction?.id,
      args.signal,
    )
  }
  if (!factions) return server.importRoster(args)
  const stated = importRosterFaction(args.data.file)
  const statedId = importRosterCatalogueId(args.data.file)
  const candidates = statedId
    ? [savedFaction(statedId, factions)].filter((found) => found !== undefined)
    : factions.filter((found) => found.isDefault)
  const faction = stated ? candidates.find((candidate) => matchesImportFaction(stated, candidate.name)) : null
  return constructionRead(
    'importFile',
    {
      file: args.data,
      matched: Boolean(faction),
      statedMissing: Boolean(statedId && !faction),
      factionNames: factions.map((candidate) => candidate.name),
    },
    (signal) => server.importRoster({ ...args, signal }),
    faction?.id,
    args.signal,
  )
}

/** Exact root IDs are absent from the faction index, so a book read for a roster answers first. */
function savedFaction(id: string, factions: { id: string; name: string }[]) {
  return factionFor(id) ?? factions.find((candidate) => candidate.id === id)
}

function factionFor(id: string) {
  return savedQuery<NonNullable<Awaited<ReturnType<typeof server.rosterBootstrap>>>['faction']>(referenceData(), factionKey(id))
}

function accessFor(roster: LocalRoster, state?: LocalState) {
  const cached = localClient()?.getQueryData<Awaited<ReturnType<typeof server.rosterAccess>>>(rosterAccessKey(roster.id))
  const members = Object.values(state?.documents ?? {})
    .map((document) => document.data as LocalRoster | null)
    .filter((entry): entry is LocalRoster => Boolean(entry?.catalogueId && entry.picks))
  const baseId = roster.baseRosterId ?? roster.id
  const variants = orderVariantGroup(
    members.filter((entry) => (entry.baseRosterId ?? entry.id) === baseId),
    baseId,
  ).map(summaryFor)
  const base = members.find((entry) => entry.id === roster.baseRosterId)
  const raw = base ? rosterDifferences(base, roster) : null
  const catalogue = raw ? localConstruction(roster.catalogueId)?.catalogue : undefined
  const named = (changes: NonNullable<typeof raw>['added']) =>
    changes.map((unit) => ({ count: unit.count, name: catalogue?.index.definitions.get(unit.entryId)?.name ?? unit.entryId }))
  const differences =
    raw && base
      ? { ...raw, baseId: base.id, baseName: base.name, added: named(raw.added), removed: named(raw.removed) }
      : (cached?.differences ?? null)
  return {
    ...cached,
    roster,
    editable: true,
    faction: factionFor(roster.catalogueId) ?? cached?.faction ?? null,
    variants: variants.length ? variants : (cached?.variants ?? []),
    differences,
    copiedFrom: cached?.copiedFrom ?? null,
    lentBy: null,
  }
}

function pricedRoster(roster: LocalRoster) {
  const input = savedRosterPriceInput(roster)
  const cached =
    localClient()?.getQueryData<Awaited<ReturnType<typeof server.priceRoster>>>(rosterPriceKey(input)) ??
    localClient()?.getQueryData<Awaited<ReturnType<typeof server.priceRoster>>>(rosterPriceKey({ ...input, includeUnitLimits: true }))
  if (cached !== undefined) return cached
  if (typeof window !== 'undefined' && navigator.onLine) return null
  const data = localConstruction(roster.catalogueId)
  return data ? calculateRosterPrice(input, data.catalogue, data.rules) : null
}

export async function rosterAccess(args: Parameters<typeof server.rosterAccess>[0]): ReturnType<typeof server.rosterAccess> {
  const owner = localOwner()?.id
  const resource = `roster:${args.data.id}`
  const local = !args.data.battle ? await localDocument<LocalRoster | null>(resource) : undefined
  if (local !== undefined && (!navigator.onLine || (await hasLocalChanges(resource))))
    return local ? accessFor(local, await localEngine()?.storage.read()) : null
  try {
    const result = await cachedRead(rosterAccessKey(args.data.id, args.data.battle), () => server.rosterAccess(args))
    if (result?.editable || (!result && (local !== undefined || (await localDocument(resource)) !== undefined))) {
      const saved = await rememberDocument(
        resource,
        result?.roster ?? null,
        result?.roster.updatedAt ?? null,
        owner,
        local?.updatedAt ?? null,
      )
      if (saved && saved.serverVersion !== (result?.roster.updatedAt ?? null)) {
        const current = saved.data as LocalRoster | null
        const retained = current ? accessFor(current, await localEngine()?.storage.read()) : null
        localClient()?.setQueryData(rosterAccessKey(args.data.id, args.data.battle), retained)
        return retained
      }
    }
    if (await hasLocalChanges(resource)) {
      const current = await localDocument<LocalRoster | null>(resource)
      return current ? accessFor(current, await localEngine()?.storage.read()) : null
    }
    return result
  } catch (error) {
    if (local !== undefined && localOwner()?.id === owner) return local ? accessFor(local, await localEngine()?.storage.read()) : null
    throw error
  }
}

export async function rosterBootstrap(args: Parameters<typeof server.rosterBootstrap>[0]): ReturnType<typeof server.rosterBootstrap> {
  const owner = localOwner()?.id
  const engine = localEngine()
  const assertAccount = () => {
    if (localOwner()?.id !== owner || localEngine() !== engine) throw accountChanged()
  }
  const resource = `roster:${args.data.id}`
  const local = !args.data.battle ? await localDocument<LocalRoster | null>(resource) : undefined
  const fromLocal = async (
    current = local,
    changes = localClient()?.getQueryData<Awaited<ReturnType<typeof server.rosterBootstrap>>>(rosterBootstrapKey(args.data.id))?.changes ??
      [],
  ) => {
    assertAccount()
    if (!current) return null
    const state = await engine?.storage.read()
    assertAccount()
    const price = await priceRoster({ data: savedRosterPriceInput(current), signal: args.signal })
    assertAccount()
    return { ...accessFor(current, state), price, changes }
  }
  if (local !== undefined && (!navigator.onLine || (await hasLocalChanges(resource)))) return fromLocal()
  try {
    const result = await cachedRead(rosterBootstrapKey(args.data.id, args.data.battle), () => server.rosterBootstrap(args))
    if (result?.editable || (!result && (local !== undefined || (await localDocument(resource)) !== undefined))) {
      const current = await localDocument<LocalRoster | null>(resource)
      // Saved without waiting: a save queues behind every other one this device makes, and its own guards keep a newer copy.
      void rememberDocument(resource, result?.roster ?? null, result?.roster.updatedAt ?? null, owner, local?.updatedAt ?? null).catch(
        () => {},
      )
      // A copy saved since the request started is newer than an answer that predates it.
      if (current && (result ? current.updatedAt > result.roster.updatedAt : current.updatedAt !== local?.updatedAt)) {
        const retained = await fromLocal(current, result?.changes ?? [])
        localClient()?.setQueryData(rosterBootstrapKey(args.data.id, args.data.battle), retained)
        return retained
      }
    }
    if (await hasLocalChanges(resource)) return fromLocal(await localDocument<LocalRoster | null>(resource), result?.changes ?? [])
    assertAccount()
    return result
  } catch (error) {
    if (local !== undefined && localOwner()?.id === owner) return fromLocal()
    throw error
  }
}

export async function sharedRoster(args: Parameters<typeof server.sharedRoster>[0]): ReturnType<typeof server.sharedRoster> {
  const local = !args.data.battle ? await localDocument<LocalRoster | null>(`roster:${args.data.id}`) : undefined
  if (local !== undefined && (!navigator.onLine || (await hasLocalChanges(`roster:${args.data.id}`)))) return local
  const access = await rosterAccess(args)
  return access?.roster ?? null
}

export async function saveRoster(
  args: Parameters<typeof server.saveRoster>[0],
  reviewed?: RosterInput,
  reviewedOwner?: string | null,
  serverReview?: ReviewedServerSave,
): ReturnType<typeof server.saveRoster> {
  const owner = localOwner()?.id
  if (reviewedOwner !== undefined && (owner ?? null) !== reviewedOwner)
    throw new Error('The account changed after this review. Reload before continuing.')
  if (!localEngine()) {
    if (!reviewed) return server.saveRoster(args)
    if (!serverReview || !owner || !args.data.id)
      throw new Error('Saved changes are not ready on this device. Reload the roster before reviewing it again.')
    const answer = await syncRoster({
      signal: args.signal ?? AbortSignal.timeout(15_000),
      data: { ...serverReview, owner, roster: { ...saveRosterSchema.parse(args.data), id: args.data.id } },
    })
    if (localOwner()?.id !== owner) throw new Error('The account changed after this review. Reload before continuing.')
    if (answer.outcome !== 'applied') throw new Error(`${answer.message} Go back, reload it and review the changes again.`)
    const saved = await server.sharedRoster({ data: { id: args.data.id }, signal: args.signal ?? AbortSignal.timeout(15_000) })
    if (localOwner()?.id !== owner) throw new Error('The account changed after this review. Reload before continuing.')
    if (!saved || saved.updatedAt !== answer.version)
      throw new Error('This roster changed after your review. Go back, reload it and review the changes again.')
    requireReviewedRoster(saved, args.data)
    return { id: args.data.id, updatedAt: answer.version }
  }
  const input: RosterInput & { id: string } = {
    ...saveRosterSchema.parse(args.data),
    id: args.data.id ?? crypto.randomUUID(),
    baseRosterId: (args.data as RosterInput & { baseRosterId?: string | null }).baseRosterId ?? null,
    copiedFromRosterId: (args.data as RosterInput & { copiedFromRosterId?: string | null }).copiedFromRosterId ?? null,
  } as RosterInput & { id: string; baseRosterId: string | null; copiedFromRosterId: string | null }
  const resource = `roster:${input.id}`
  let previous = await localDocument<LocalRoster | null>(resource)
  // A roster the server rendered reaches this device's storage in the background; an edit that
  // beats that download still builds on the opened version instead of saving a new roster.
  const opened =
    previous === undefined && args.data.id
      ? localClient()?.getQueryData<Awaited<ReturnType<typeof server.rosterAccess>>>(rosterAccessKey(input.id))
      : undefined
  if (opened?.editable) {
    await rememberDocument(resource, opened.roster, opened.roster.updatedAt, owner, null)
    previous = await localDocument<LocalRoster | null>(resource)
  }
  if (previous === null) throw new Error('This roster was deleted. Save it as a new roster.')
  const now = Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1)
  const roster: LocalRoster = {
    ...input,
    automaticName: !input.name,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    borrowedDetachmentId: input.borrowedDetachmentId ?? null,
    pointsBudget: input.pointsBudget === undefined ? (previous?.pointsBudget ?? null) : input.pointsBudget,
    optionalRules: input.optionalRules ?? [],
    waivedRules: input.waivedRules ?? [],
    baseRosterId: previous?.baseRosterId ?? (input as RosterInput & { baseRosterId?: string | null }).baseRosterId ?? null,
    copiedFromRosterId:
      previous?.copiedFromRosterId ?? (input as RosterInput & { copiedFromRosterId?: string | null }).copiedFromRosterId ?? null,
    visibility: input.visibility ?? 'private',
    source: input.source ?? 'editable',
    prep: input.prep ? { ...input.prep, remindersEnabled: input.prep.remindersEnabled ?? true } : null,
    remindersEnabled: input.prep?.remindersEnabled ?? true,
    locked: previous?.locked ?? false,
    archived: previous?.archived ?? false,
  }
  const refusal = lockedRosterRefusal(previous, roster)
  if (refusal) throw new Error(refusal)
  const price = roster.automaticName ? pricedRoster(roster) : null
  if (roster.automaticName) roster.name = price?.label ?? previous?.name ?? ''
  await queueLocal(
    'saveRoster',
    { ...roster, name: roster.automaticName ? '' : roster.name },
    resource,
    roster,
    undefined,
    undefined,
    owner,
    reviewed
      ? (current) => {
          requireReviewedRoster(current, reviewed)
          return roster
        }
      : undefined,
  )
  if (!previous && navigator.onLine) await attemptLocalSync()
  if (localOwner()?.id !== owner) throw new Error('The account changed while saving this roster.')
  return { id: input.id, updatedAt: now }
}

export async function copyRoster(args: Parameters<typeof server.copyRoster>[0]): ReturnType<typeof server.copyRoster> {
  const owner = localOwner()?.id
  if (!localEngine()) return server.copyRoster(args)
  const access = await rosterAccess({ data: { id: args.data.id } })
  if (!access) throw new Error('That roster could not be loaded.')
  if (args.data.variant && !access.editable) throw new Error('You do not own this roster.')
  const roster = access.roster
  const summaries = await savedRosterSummaries()
  const baseId = roster.baseRosterId ?? roster.id
  const base = summaries.find((entry) => entry.id === baseId) ?? roster
  const name = roster.automaticName
    ? ''
    : args.data.variant
      ? variantName(
          base.name,
          summaries.filter((entry) => entry.id === baseId || entry.baseRosterId === baseId).map((entry) => entry.name),
        )
      : `Copy of ${roster.name}`.slice(0, 80)
  const { rosterVisibility } = await playerDefaults()
  const input = {
    ...draftFor(roster),
    ...(args.data.setup ? convertedSetup(args.data.setup) : {}),
    id: undefined,
    name,
    visibility: rosterVisibility,
    baseRosterId: args.data.variant ? baseId : null,
    copiedFromRosterId: args.data.variant ? null : roster.id,
  }
  if (localOwner()?.id !== owner) throw new Error('The account changed before this roster could be copied.')
  const result = await saveRoster({ data: input })
  return { id: result.id }
}

function summaryFor(roster: LocalRoster) {
  return { ...roster, unitCount: listUnitCount(roster.picks) }
}
function overlaySummaries(
  summaries: Awaited<ReturnType<typeof server.savedRosterSummaries>>,
  state?: LocalState,
  all = false,
  retained?: Set<string>,
) {
  const byId = new Map(summaries.map((roster) => [roster.id, roster]))
  for (const [resource, document] of Object.entries(state?.documents ?? {})) {
    if (
      !resource.startsWith('roster:') ||
      (!all && !retained?.has(resource) && !state?.operations.some((operation) => operation.resource === resource))
    )
      continue
    const roster = document.data as LocalRoster | null
    if (!roster) byId.delete(resource.slice(7))
    else byId.set(roster.id, summaryFor(roster))
  }
  return [...byId.values()].sort((left, right) => right.updatedAt - left.updatedAt)
}
export function projectLocalState(state: LocalState) {
  const client = localClient()
  if (!client || localOwner()?.id !== state.owner) return
  for (const [resource, document] of Object.entries(state.documents)) {
    if (resource.startsWith('query:')) {
      client.setQueryData(JSON.parse(resource.slice(6)), document.data)
      continue
    }
    if (resource.startsWith('league:')) {
      if (navigator.onLine && !state.operations.some((operation) => operation.resource === resource)) continue
      const league = document.data as Awaited<ReturnType<typeof server.openLeague>>
      const keys = [leagueKey(resource.slice(7)), leagueKey(resource.slice(7), league?.eventToken)]
      client.setQueriesData({ predicate: (query) => keys.some((key) => partialMatchKey(query.queryKey, key)) }, league)
      continue
    }
    if (!resource.startsWith('roster:')) continue
    if (navigator.onLine && !state.operations.some((operation) => operation.resource === resource)) continue
    const id = resource.slice(7)
    const roster = document.data as LocalRoster | null
    const previous = client.getQueryData<Awaited<ReturnType<typeof server.rosterBootstrap>>>(rosterBootstrapKey(id))
    if (roster && previous?.roster.updatedAt === roster.updatedAt) continue
    const access = roster ? accessFor(roster, state) : null
    client.setQueryData(rosterAccessKey(id), access)
    client.setQueryData(sharedRosterKey(id), roster)
    client.setQueryData(
      rosterBootstrapKey(id),
      roster ? { ...previous, ...access, price: pricedRoster(roster), changes: previous?.changes ?? [] } : null,
    )
  }
  const summaries = client.getQueryData<Awaited<ReturnType<typeof server.savedRosterSummaries>>>(savedRosterSummariesKey())
  if (summaries !== undefined || state.operations.some((operation) => operation.resource.startsWith('roster:')))
    client.setQueryData(savedRosterSummariesKey(), overlaySummaries(summaries ?? [], state))
  projectBattles(state)
}

export async function deleteRoster(args: Parameters<typeof server.deleteRoster>[0]): ReturnType<typeof server.deleteRoster> {
  const owner = localOwner()?.id
  if (!localEngine()) return server.deleteRoster(args)
  const roster = await sharedRoster({ data: args.data })
  if (!roster) return null
  await queueLocal('deleteRoster', draftFor(roster), `roster:${roster.id}`, null, undefined, undefined, owner)
  return null
}

function draftFor(roster: LocalRoster): RosterInput {
  return { ...roster, name: roster.automaticName ? '' : roster.name }
}

export async function setRosterVisibility(
  args: Parameters<typeof server.setRosterVisibility>[0],
): ReturnType<typeof server.setRosterVisibility> {
  const owner = localOwner()?.id
  if (!localEngine()) return server.setRosterVisibility(args)
  const roster = await rosterAccess({ data: { id: args.data.id } })
  if (!roster?.editable) throw new Error('You do not own this roster.')
  if (localOwner()?.id !== owner) throw new Error('The account changed before these edits could be saved.')
  await saveRoster({ data: { ...draftFor(roster.roster), visibility: args.data.visibility } })
  return null
}

export async function shareLeagueRoster(args: Parameters<typeof server.shareLeagueRoster>[0]): ReturnType<typeof server.shareLeagueRoster> {
  const owner = localOwner()?.id
  const resource = `roster:${args.data.rosterId}`
  if (!navigator.onLine) throw new Error('Connect to the internet to share your sealed roster.')
  if (await hasLocalChanges(resource)) {
    await syncLocalWork()
    if (await hasLocalChanges(resource)) throw new Error('This roster has changes waiting to sync. Sync or review them first.')
  }
  if (localOwner()?.id !== owner) throw accountChanged()
  const result = await server.shareLeagueRoster(args)
  const roster = result.roster
  const local = await localDocument<LocalRoster | null>(resource)
  if (local)
    await rememberDocument(resource, { ...local, visibility: roster.visibility, updatedAt: roster.updatedAt }, roster.updatedAt, owner)
  return result
}

/** Saved loadouts are kept only by the server, so saving or deleting one needs a connection. */
export async function saveUnitLoadout(args: Parameters<typeof server.saveUnitLoadout>[0]): ReturnType<typeof server.saveUnitLoadout> {
  if (!navigator.onLine) throw new Error('Connect to the internet to save a loadout.')
  return server.saveUnitLoadout(args)
}

export async function renameUnitLoadout(args: Parameters<typeof server.renameUnitLoadout>[0]): ReturnType<typeof server.renameUnitLoadout> {
  if (!navigator.onLine) throw new Error('Connect to the internet to rename a loadout.')
  return server.renameUnitLoadout(args)
}

export async function deleteUnitLoadout(args: Parameters<typeof server.deleteUnitLoadout>[0]): ReturnType<typeof server.deleteUnitLoadout> {
  if (!navigator.onLine) throw new Error('Connect to the internet to delete a loadout.')
  return server.deleteUnitLoadout(args)
}

/** Locking is accepted by the server, after this device has sent the roster's saved changes. */
export async function setRosterLocked(args: Parameters<typeof server.setRosterLocked>[0]): ReturnType<typeof server.setRosterLocked> {
  const owner = localOwner()?.id
  const resource = `roster:${args.data.id}`
  if (localEngine()) {
    if (!navigator.onLine) throw new Error('Connect to the internet to lock or unlock this roster.')
    if (await hasLocalChanges(resource)) await syncLocalWork()
    if (await hasLocalChanges(resource)) throw new Error('This roster has changes waiting to sync. Sync or review them first.')
  }
  const saved = await server.setRosterLocked(args)
  const local = await localDocument<LocalRoster | null>(resource)
  if (local) await rememberDocument(resource, { ...local, locked: args.data.locked, updatedAt: saved.updatedAt }, saved.updatedAt, owner)
  return saved
}

/** Archiving is accepted by the server, after this device has sent the roster's saved changes. */
export async function setRosterArchived(args: Parameters<typeof server.setRosterArchived>[0]): ReturnType<typeof server.setRosterArchived> {
  const owner = localOwner()?.id
  const resource = `roster:${args.data.id}`
  if (localEngine()) {
    if (!navigator.onLine) throw new Error('Connect to the internet to archive or unarchive this roster.')
    if (await hasLocalChanges(resource)) await syncLocalWork()
    if (await hasLocalChanges(resource)) throw new Error('This roster has changes waiting to sync. Sync or review them first.')
  }
  const saved = await server.setRosterArchived(args)
  const local = await localDocument<LocalRoster | null>(resource)
  if (local)
    await rememberDocument(resource, { ...local, archived: args.data.archived, updatedAt: saved.updatedAt }, saved.updatedAt, owner)
  return saved
}

export async function savedRosterLoadoutDatasheets(
  args: Parameters<typeof server.savedRosterLoadoutDatasheets>[0],
): ReturnType<typeof server.savedRosterLoadoutDatasheets> {
  const owner = localOwner()?.id
  const checked = async (loading: ReturnType<typeof server.savedRosterLoadoutDatasheets>) => {
    const result = await loading
    if (localOwner()?.id !== owner) throw accountChanged()
    return result
  }
  const resource = `roster:${args.data.id}`
  const local = !args.data.battle ? await localDocument<LocalRoster | null>(resource) : undefined
  const inputFor = (roster: LocalRoster) => {
    const pick = roster.picks[args.data.pickIndex]
    if (!pick) throw new Error('This unit is no longer in the roster.')
    return {
      catalogueId: roster.catalogueId,
      entryId: pick.entryId,
      detachmentIds: roster.detachmentIds,
      picks: roster.picks,
      pickIndex: args.data.pickIndex,
      everyWeapon: false,
    }
  }
  if (local && (!navigator.onLine || (await hasLocalChanges(resource))))
    return checked(loadoutDatasheets({ data: inputFor(local), signal: args.signal }))
  return checked(
    calculationRead(
      (signal) => server.savedRosterLoadoutDatasheets({ ...args, signal }),
      async (error) => {
        const roster = !args.data.battle
          ? local
          : localClient()?.getQueryData<LocalRoster | null>(sharedRosterKey(args.data.id, args.data.battle))
        const construction = roster && localConstruction(roster.catalogueId)
        if (!roster || !construction) throw error ?? new Error('Army data is unavailable.')
        return rosterLoadoutDatasheets(construction.catalogue, datasheetSchema.parse(inputFor(roster)), construction.rules)
      },
      args.signal,
    ),
  )
}

export async function savedRosterSummaries(args?: { signal?: AbortSignal }): ReturnType<typeof server.savedRosterSummaries> {
  const engine = localEngine()
  const owner = localOwner()?.id
  const assertAccount = () => {
    if (localOwner()?.id !== owner || localEngine() !== engine) throw accountChanged()
  }
  const summaries = await cachedRead(savedRosterSummariesKey(), async () => {
    const before = await engine?.storage.read()
    assertAccount()
    const fresh = await server.savedRosterSummaries({
      signal: args?.signal ? anySignal([args.signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
    })
    assertAccount()
    const ids = new Set(fresh.map((roster) => roster.id))
    const retained = new Set<string>()
    const saved = await engine?.storage.change((current) => {
      assertAccount()
      retained.clear()
      for (const [resource, document] of Object.entries(current.documents)) {
        if (!resource.startsWith('roster:')) continue
        const previous = before?.documents[resource]
        if (
          previous?.serverVersion !== document.serverVersion ||
          (previous?.data as LocalRoster | null | undefined)?.updatedAt !== (document.data as LocalRoster | null)?.updatedAt
        )
          retained.add(resource)
      }
      return {
        ...current,
        documents: Object.fromEntries(
          Object.entries(current.documents).filter(
            ([resource]) =>
              !resource.startsWith('roster:') ||
              ids.has(resource.slice(7)) ||
              retained.has(resource) ||
              current.operations.some((operation) => operation.resource === resource),
          ),
        ),
      }
    })
    return overlaySummaries(fresh, saved, false, retained)
  })
  const state = await engine?.storage.read()
  assertAccount()
  return overlaySummaries(summaries, state, typeof window !== 'undefined' && !navigator.onLine)
}

async function assessedRoster(roster: LocalRoster, owner: string, signal?: AbortSignal) {
  return calculationRead(
    async (requestSignal) => {
      const price = await server.priceRoster({ data: savedRosterPriceInput(roster), signal: requestSignal })
      return {
        points: price?.points ?? null,
        problem: price ? (rosterUseProblem(price, roster)?.kind ?? null) : null,
        label: roster.name || price?.label || '',
      }
    },
    () => localRosterAssessment(roster, owner),
    signal,
  )
}

export async function savedRosterPage(args: Parameters<typeof server.savedRosterPage>[0]): ReturnType<typeof server.savedRosterPage> {
  const engine = localEngine()
  if (!engine) return server.savedRosterPage(args)
  const owner = localOwner()!.id
  const assertAccount = () => {
    if (localOwner()?.id !== owner || localEngine() !== engine) throw accountChanged()
  }
  const before = await engine.storage.read()
  assertAccount()
  const fresh = await calculationRead(
    (signal) => server.savedRosterPage({ ...args, signal }),
    (error) => {
      if (!constructionData()) throw error ?? new Error('Download army rules before using them offline.')
      return undefined
    },
    args.signal,
  )
  assertAccount()
  const state = await engine.storage.read()
  assertAccount()
  const cached = localClient()?.getQueryData<Awaited<ReturnType<typeof server.savedRosterPage>>>(savedRosterPageKey(args.data.ids))
  const rows = new Map((fresh ?? cached)?.map((row) => [row.id, row]))
  await Promise.all(
    args.data.ids.map(async (id) => {
      const resource = `roster:${id}`
      const document = state.documents[resource]
      const changed =
        before.documents[resource]?.serverVersion !== document?.serverVersion ||
        (before.documents[resource]?.data as LocalRoster | null)?.updatedAt !== (document?.data as LocalRoster | null)?.updatedAt
      if (fresh && !changed && !state.operations.some((operation) => operation.resource === resource)) return
      const roster = document?.data as LocalRoster | null | undefined
      if (!roster) {
        if (document) rows.delete(id)
        return
      }
      const assessment = fresh ? await assessedRoster(roster, owner, args.signal) : await localRosterAssessment(roster, owner)
      assertAccount()
      rows.set(id, {
        id,
        ...assessment,
        changes: cached?.find((row) => row.id === id)?.changes ?? 0,
        differences: accessFor(roster, state).differences,
      })
    }),
  )
  return args.data.ids.flatMap((id) => (rows.get(id) ? [rows.get(id)!] : []))
}

export async function homeRosters(args?: { signal?: AbortSignal }): ReturnType<typeof server.homeRosters> {
  const engine = localEngine()
  if (!engine) return server.homeRosters(args)
  const owner = localOwner()!.id
  const assertAccount = () => {
    if (localOwner()?.id !== owner || localEngine() !== engine) throw accountChanged()
  }
  const before = await engine.storage.read()
  assertAccount()
  const fresh = await calculationRead(
    (signal) => server.homeRosters({ signal }),
    (error) => {
      if (!constructionData()) throw error ?? new Error('Download army rules before using them offline.')
      return undefined
    },
    args?.signal,
  )
  assertAccount()
  const state = await engine.storage.read()
  assertAccount()
  if (
    fresh &&
    !state.operations.some((operation) => operation.resource.startsWith('roster:')) &&
    Object.entries(state.documents).every(
      ([resource, document]) =>
        !resource.startsWith('roster:') ||
        (document.serverVersion === before.documents[resource]?.serverVersion &&
          (document.data as LocalRoster | null)?.updatedAt === (before.documents[resource]?.data as LocalRoster | null)?.updatedAt),
    )
  )
    return fresh
  const summaries = fresh
    ? await savedRosterSummaries({ signal: args?.signal })
    : overlaySummaries(
        localClient()?.getQueryData<Awaited<ReturnType<typeof server.savedRosterSummaries>>>(savedRosterSummariesKey()) ?? [],
        state,
        true,
      )
  assertAccount()
  const active = summaries.filter((roster) => !roster.archived)
  const recent = active.slice(0, 5)
  if (fresh) {
    const page = await savedRosterPage({ data: { ids: recent.map((roster) => roster.id) }, signal: args?.signal })
    assertAccount()
    const rows = new Map(page.map((row) => [row.id, row]))
    return {
      count: active.length,
      rosters: recent.map((roster) => ({
        roster,
        points: rows.get(roster.id)?.points ?? null,
        problem: rows.get(roster.id)?.problem ?? null,
        label: rows.get(roster.id)?.label ?? roster.name,
      })),
    }
  }
  const savedHome = localClient()?.getQueryData<Awaited<ReturnType<typeof server.homeRosters>>>(homeRostersKey())
  const rosters = await Promise.all(
    recent.map(async (summary) => {
      const roster = state.documents[`roster:${summary.id}`]?.data as LocalRoster | null | undefined
      const cached = savedHome?.rosters.find((row) => row.roster.id === summary.id && row.roster.updatedAt === summary.updatedAt)
      const assessment = roster
        ? await localRosterAssessment(roster, owner)
        : { points: cached?.points ?? null, problem: cached?.problem ?? null, label: cached?.label ?? summary.name }
      assertAccount()
      return { roster: summary, ...assessment }
    }),
  )
  return { count: active.length, rosters }
}

export {
  openBattle,
  submit,
  battleReport,
  replayBattleAt,
  replayBattleBatch,
  createBattle,
  createLeagueBattle,
  myBattles,
} from './offline/battleFunctions'

export {
  collection,
  collectionCounts,
  collectionProgress,
  collectionWishes,
  collectionCountsAs,
  fieldedDatasheets,
  wishlistSuggestions,
  updateOnboardingProgress,
  favouriteFactions,
  favouriteDetachments,
  favouriteDatasheets,
  recentMatchups,
  playerDefaults,
  onboardingProgress,
  notificationSettings,
  friendships,
  opponents,
  listLeagues,
  activeFriendInvite,
  friendInvite,
  openLeagueRoster,
  listFriendLeagueRosters,
  outdatedLeagueEntriesForRoster,
  openLeague,
  requestFriend,
  acceptFriend,
  rejectFriend,
  removeFriend,
  acceptFriendInvite,
  joinLeague,
  addLeagueEntrants,
  admitLeagueEntries,
  moderateLeagueEntry,
  submitLeagueRoster,
  revealLeague,
  unsealLeagueRoster,
  assignLeagueRosterRequirement,
  assignLeagueTeam,
  chooseLeagueSide,
  updateLeague,
  deleteLeague,
  deleteBattle,
  setOwned,
  setCollectionModels,
  setCollectionProgress,
  setCollectionWanted,
  setCollectionCountsAs,
  setFavouriteFaction,
  setFavouriteDetachment,
  setFavouriteDatasheet,
  rememberMatchup,
  forgetMatchup,
  abilityReminders,
  setAbilityReminder,
  removeAbilityReminder,
  setPlayerDefaults,
  setPushNotifications,
  createFriendInvite,
  cancelFriendInvite,
  createLeague,
  leagueBattleOptions,
} from './offline/actionFunctions'

export const me = (args?: Parameters<typeof server.me>[0]) => cachedRead(meKey(), () => server.me(args))
export async function rosterChanges(args: Parameters<typeof server.rosterChanges>[0]): ReturnType<typeof server.rosterChanges> {
  const state = await localEngine()?.storage.read()
  if (
    state?.documents[`roster:${args.data.id}`]?.serverVersion === null &&
    state.operations.some((operation) => operation.resource === `roster:${args.data.id}` && operation.kind === 'saveRoster')
  )
    return []
  return cachedRead(rosterChangesKey(args.data.id), () => server.rosterChanges(args))
}
export const savedRosterChangedIds = () => cachedRead(savedRosterChangedIdsKey(), () => server.savedRosterChangedIds())

export const combatUnits = () => {
  const saved = savedQuery<Awaited<ReturnType<typeof server.combatUnits>>>(referenceData(), combatUnitsKey())
  return saved ? Promise.resolve(saved) : server.combatUnits()
}

export const publicBattles = (args: Parameters<typeof server.publicBattles>[0]) =>
  cachedPage(publicBattlesKey(), args.data.before, () => server.publicBattles(args))
export const friendBattles = (args: Parameters<typeof server.friendBattles>[0]) =>
  cachedPage(friendBattlesKey(), args.data.before, () => server.friendBattles(args))
export const listLeagueBattles = (args: Parameters<typeof server.listLeagueBattles>[0]) =>
  cachedPage(leagueBattlesKey(args.data.token, args.data.eventToken), args.data.before, () => server.listLeagueBattles(args))
export const standings = () => cachedRead(standingsKey(), () => server.standings())
export const playerRosters = (args: Parameters<typeof server.playerRosters>[0]) =>
  cachedRead(playerRostersKey(args.data.userId), () => server.playerRosters(args))
export const battleRatingChanges = (args: Parameters<typeof server.battleRatingChanges>[0]) =>
  cachedRead(battleRatingChangesKey(args.data.token), () => server.battleRatingChanges(args))
export const playerRankings = (args: Parameters<typeof server.playerRankings>[0]) =>
  cachedRead(playerRankingsKey(args.data.userId), () => server.playerRankings(args))
export const userProfile = (args: Parameters<typeof server.userProfile>[0]) =>
  cachedRead(userProfileKey(args.data.userId), () => server.userProfile(args))
export const playerProfile = (args: Parameters<typeof server.playerProfile>[0]) => {
  const { userId, ...filter } = args.data
  return cachedRead(playerProfileKey(userId, filter), () => server.playerProfile(args))
}
export const searchPlayers = (args: Parameters<typeof server.searchPlayers>[0]) =>
  cachedRead(playerSearchKey(args.data.query), () => server.searchPlayers(args))
export const catalogueChangeLog = (args: Parameters<typeof server.catalogueChangeLog>[0]) =>
  cachedRead(catalogueChangesKey(args.data.faction, args.data.before), () => server.catalogueChangeLog(args))
export const armyUpdates = (args: Parameters<typeof server.armyUpdates>[0]) =>
  cachedRead(armyUpdatesKey(args.data.factions), () => server.armyUpdates(args))
