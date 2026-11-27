import { partialMatchKey } from '@tanstack/react-query'
import { requireReviewedRoster, type ReviewedServerSave } from './reviewedRoster'
import { projectBattles } from './battleFunctions'
import { accountChanged, accountGuard, cachedRead, isOffline } from './reads'
import { hasLocalChanges, localOwner, syncLocalWork } from './localRuntime'
import { byId } from '../../core/collections'
import { lockedRosterRefusal } from '../../core/rosterLock'
import { ROSTER_BATCH_CHANGES } from '../../core/rosterLibrary'
import { rosterDifferences } from '../../core/rosterDifferences'
import { convertedSetup } from '../../core/rosterSetup'
import { datasheetSchema, picksSchema, saveRosterSchema, type PriceInput } from '../../contracts/schemas'
import { withHeldVs } from '../../core/savedPicks'
import * as server from '../../server/functions'
import { syncRoster } from '../../server/functions/offline'
import { builtConstruction, hasLocalConstruction, localConstruction } from './construction'
import {
  localClient,
  localDocument,
  localEngine,
  queueLocal,
  attemptLocalSync,
  rememberDocument,
  type LocalRoster,
  type RosterInput,
} from './localRuntime'
import { calculateRosterPrice, savedRosterPriceInput } from '../../shared/pricing'
import { rosterLoadoutDatasheets } from '../../shared/rosterReads'
import { rosterFaction } from '../../shared/rosterFaction'
import { listUnitCount } from '../../core/attachedUnits'
import { rosterUseProblem } from '../../core/rosterLegality'
import { loadSavedQuery, referenceData } from './runtime'
import { orderVariantGroup, variantName } from '../../core/rosterVariants'
import type { LocalState } from '../../contracts/localState'
import { playerDefaults } from './actionFunctions'
import { localRosterAssessment } from './rosterAssessment'
import { ACCOUNT_CHANGED_AFTER_REVIEW, DELETED_ROSTER_MESSAGE } from './rosterMessages'
import { calculationRead, SERVER_ONLY_TIMEOUT_MS } from './calculationRead'
import { withTimeout } from '../abortSignals'
import {
  factionIndexKey,
  homeRostersKey,
  sealedEventKey,
  rosterAccessKey,
  rosterBootstrapKey,
  rosterChangesKey,
  savedRosterChangedIdsKey,
  savedRosterPlaysKey,
  savedRosterPageKey,
  savedRosterSummariesKey,
  sharedRosterKey,
  rosterPriceKey,
} from '../queries/queryKeys'
import { factionFor, loadFaction, loadoutDatasheets, priceRoster } from './constructionFunctions'

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
  const catalogue = raw ? builtConstruction(roster.catalogueId)?.catalogue : undefined
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

/** `accessFor` with its faction decoded and the catalogue its variant differences are named from built first. */
async function accessOf(roster: LocalRoster, state?: LocalState) {
  await Promise.all([loadFaction(roster.catalogueId), roster.baseRosterId && localConstruction(roster.catalogueId)])
  return accessFor(roster, state)
}

/** The price shown for a roster saved on this device; offline, from construction data already built for it. */
const cachedPrice = (input: PriceInput) =>
  localClient()?.getQueryData<Awaited<ReturnType<typeof server.priceRoster>>>(rosterPriceKey(input))

function pricedRoster(roster: LocalRoster) {
  const input = savedRosterPriceInput(roster)
  const cached = cachedPrice(input) ?? cachedPrice({ ...input, includeUnitLimits: true })
  if (cached !== undefined) return cached
  if (!isOffline()) return null
  const data = builtConstruction(roster.catalogueId)
  return data ? calculateRosterPrice(input, data.catalogue, data.rules) : null
}

export async function rosterAccess(args: Parameters<typeof server.rosterAccess>[0]): ReturnType<typeof server.rosterAccess> {
  const owner = localOwner()?.id
  const resource = `roster:${args.data.id}`
  const local = await localDocument<LocalRoster | null>(resource)
  if (local !== undefined && (isOffline() || (await hasLocalChanges(resource))))
    return local ? accessOf(local, await localEngine()?.storage.read()) : null
  try {
    let answered = false
    const result = await cachedRead(rosterAccessKey(args.data.id), async () => {
      const answer = await server.rosterAccess(args)
      answered = true
      return answer
    })
    // A copy shown after a failed read can be this device's unsynced edit, whose updatedAt is a device time, not a server
    // version, so it is never saved; this device's own copy is newer than it whenever a library change replaced it.
    if (!answered && local !== undefined) {
      const current = await localDocument<LocalRoster | null>(resource)
      return current ? accessOf(current, await localEngine()?.storage.read()) : null
    }
    if (answered && (result?.editable || (!result && (local !== undefined || (await localDocument(resource)) !== undefined)))) {
      const saved = await rememberDocument(
        resource,
        result?.roster ?? null,
        result?.roster.updatedAt ?? null,
        owner,
        local?.updatedAt ?? null,
      )
      if (saved && saved.serverVersion !== (result?.roster.updatedAt ?? null)) {
        const current = saved.data as LocalRoster | null
        const retained = current ? await accessOf(current, await localEngine()?.storage.read()) : null
        localClient()?.setQueryData(rosterAccessKey(args.data.id), retained)
        return retained
      }
    }
    if (await hasLocalChanges(resource)) {
      const current = await localDocument<LocalRoster | null>(resource)
      return current ? accessOf(current, await localEngine()?.storage.read()) : null
    }
    return result
  } catch (error) {
    if (local !== undefined && localOwner()?.id === owner) return local ? accessOf(local, await localEngine()?.storage.read()) : null
    throw error
  }
}

export async function rosterBootstrap(args: Parameters<typeof server.rosterBootstrap>[0]): ReturnType<typeof server.rosterBootstrap> {
  const owner = localOwner()?.id
  const engine = localEngine()
  const assertAccount = accountGuard()
  const resource = `roster:${args.data.id}`
  const local = await localDocument<LocalRoster | null>(resource)
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
    return { ...(await accessOf(current, state)), price, changes }
  }
  if (local !== undefined && (isOffline() || (await hasLocalChanges(resource)))) return fromLocal()
  try {
    let answered = false
    const result = await cachedRead(rosterBootstrapKey(args.data.id), async () => {
      const answer = await server.rosterBootstrap(args)
      answered = true
      return answer
    })
    if (!answered && local !== undefined) return fromLocal(await localDocument<LocalRoster | null>(resource), result?.changes ?? [])
    if (answered && (result?.editable || (!result && (local !== undefined || (await localDocument(resource)) !== undefined)))) {
      const current = await localDocument<LocalRoster | null>(resource)
      // Saved without waiting: a save queues behind every other one this device makes, and its own guards keep a newer copy.
      void rememberDocument(resource, result?.roster ?? null, result?.roster.updatedAt ?? null, owner, local?.updatedAt ?? null).catch(
        () => {},
      )
      // A copy saved since the request started is newer than an answer that predates it.
      if (current && (result ? current.updatedAt > result.roster.updatedAt : current.updatedAt !== local?.updatedAt)) {
        const retained = await fromLocal(current, result?.changes ?? [])
        localClient()?.setQueryData(rosterBootstrapKey(args.data.id), retained)
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
  const local = await localDocument<LocalRoster | null>(`roster:${args.data.id}`)
  if (local !== undefined && (isOffline() || (await hasLocalChanges(`roster:${args.data.id}`)))) return local
  const access = await rosterAccess(args)
  return access?.roster ?? null
}

export async function saveRoster(
  save: Parameters<typeof server.saveRoster>[0],
  reviewed?: RosterInput,
  reviewedOwner?: string | null,
  serverReview?: ReviewedServerSave,
): ReturnType<typeof server.saveRoster> {
  // Every save this code makes, sent now or queued for later, says it starts a choice on its printed default; one
  // queued by an older version of the app says nothing, and the module keeps that list's units on their cheapest.
  const args = { ...save, data: { ...save.data, printedDefaults: true as const } }
  const owner = localOwner()?.id
  if (reviewedOwner !== undefined && (owner ?? null) !== reviewedOwner) throw new Error(ACCOUNT_CHANGED_AFTER_REVIEW)
  if (!localEngine()) {
    if (!reviewed) return server.saveRoster(args)
    if (!serverReview || !owner || !args.data.id)
      throw new Error('Saved changes are not ready on this device. Reload the roster before reviewing it again.')
    const answer = await syncRoster({
      signal: args.signal ?? AbortSignal.timeout(15_000),
      data: { ...serverReview, owner, roster: { ...args.data, id: args.data.id } },
    })
    if (localOwner()?.id !== owner) throw new Error(ACCOUNT_CHANGED_AFTER_REVIEW)
    if (answer.outcome !== 'applied') throw new Error(`${answer.message} Go back, reload it and review the changes again.`)
    const saved = await server.sharedRoster({ data: { id: args.data.id }, signal: args.signal ?? AbortSignal.timeout(15_000) })
    if (localOwner()?.id !== owner) throw new Error(ACCOUNT_CHANGED_AFTER_REVIEW)
    if (!saved || saved.updatedAt !== answer.version)
      throw new Error('This roster changed after your review. Go back, reload it and review the changes again.')
    requireReviewedRoster(saved, saveRosterSchema.parse(args.data))
    return { id: args.data.id, updatedAt: answer.version }
  }
  const input = {
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
  if (previous === null) throw new Error(DELETED_ROSTER_MESSAGE)
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
    baseRosterId: previous?.baseRosterId ?? input.baseRosterId,
    copiedFromRosterId: previous?.copiedFromRosterId ?? input.copiedFromRosterId,
    visibility: input.visibility ?? 'private',
    source: input.source ?? 'editable',
    prep: input.prep ? { ...input.prep, remindersEnabled: input.prep.remindersEnabled ?? true } : null,
    remindersEnabled: input.prep?.remindersEnabled ?? true,
    locked: previous?.locked ?? false,
    archived: previous?.archived ?? false,
  }
  // The device's copy can hold translations it was served, which a save never sends, so both sides compare as stored.
  const refusal = lockedRosterRefusal(previous && { ...previous, picks: picksSchema.parse(previous.picks) }, roster)
  if (refusal) throw new Error(refusal)
  if (roster.automaticName && !navigator.onLine) await localConstruction(roster.catalogueId)
  const price = roster.automaticName ? pricedRoster(roster) : null
  if (roster.automaticName) roster.name = price?.label ?? previous?.name ?? ''
  // The device projects resolved IDs, while sync validates the original IDs against the same migration as the server.
  await queueLocal(
    'saveRoster',
    {
      ...draftFor(roster),
      catalogueId: args.data.catalogueId,
      detachmentIds: args.data.detachmentIds,
      borrowedDetachmentId: args.data.borrowedDetachmentId ?? null,
      picks: args.data.picks,
    },
    resource,
    {
      data: roster,
      owner,
      update: reviewed
        ? (current) => {
            requireReviewedRoster(current, reviewed)
            return roster
          }
        : undefined,
    },
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
    // A copy keeps, as its own, the translations its reader was served.
    picks: roster.picks.map(withHeldVs),
    ...(args.data.setup ? convertedSetup(args.data.setup) : {}),
    id: undefined,
    name,
    visibility: rosterVisibility,
    baseRosterId: args.data.variant ? baseId : null,
    copiedFromRosterId: args.data.variant ? null : roster.id,
  }
  if (localOwner()?.id !== owner) throw new Error('The account changed before this roster could be copied.')
  const result = await saveRoster({ data: input })
  return { id: result.id, visibility: rosterVisibility }
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
  const listed = byId(summaries)
  for (const [resource, document] of Object.entries(state?.documents ?? {})) {
    if (
      !resource.startsWith('roster:') ||
      (!all && !retained?.has(resource) && !state?.operations.some((operation) => operation.resource === resource))
    )
      continue
    const roster = document.data as LocalRoster | null
    if (!roster) listed.delete(resource.slice(7))
    // The device keeps no answer to the sharing prompt, so the server's stays.
    else listed.set(roster.id, { ...summaryFor(roster), sharingDeclined: listed.get(roster.id)?.sharingDeclined ?? false })
  }
  return [...listed.values()].sort((left, right) => right.updatedAt - left.updatedAt)
}
export function projectLocalState(state: LocalState) {
  const client = localClient()
  if (!client || localOwner()?.id !== state.owner) return
  const unbuilt = new Set<string>()
  for (const [resource, document] of Object.entries(state.documents)) {
    if (resource.startsWith('sealed-event:')) {
      if (navigator.onLine && !state.operations.some((operation) => operation.resource === resource)) continue
      const sealedEvent = document.data as Awaited<ReturnType<typeof server.openSealedEvent>>
      const keys = [sealedEventKey(resource.slice(13)), sealedEventKey(resource.slice(13), sealedEvent?.eventToken)]
      client.setQueriesData({ predicate: (query) => keys.some((key) => partialMatchKey(query.queryKey, key)) }, sealedEvent)
      continue
    }
    if (!resource.startsWith('roster:')) continue
    if (navigator.onLine && !state.operations.some((operation) => operation.resource === resource)) continue
    const id = resource.slice(7)
    const roster = document.data as LocalRoster | null
    const previous = client.getQueryData<Awaited<ReturnType<typeof server.rosterBootstrap>>>(rosterBootstrapKey(id))
    // Offline, prices and variant names come from construction data built on this thread, which costs a phone a whole
    // rules version, so only a roster on screen builds it and is projected again once it has.
    const built = navigator.onLine || !roster || Boolean(builtConstruction(roster.catalogueId))
    const shown = Boolean(
      client
        .getQueryCache()
        .find({ queryKey: rosterBootstrapKey(id), exact: true })
        ?.getObserversCount(),
    )
    if (roster && !built && shown) unbuilt.add(roster.catalogueId)
    if (roster && previous?.roster.updatedAt === roster.updatedAt && (previous.price !== null || !built)) continue
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
  for (const catalogueId of unbuilt)
    void localConstruction(catalogueId).then(async (built) => {
      const latest = built && (await localEngine()?.storage.read())
      if (latest) projectLocalState(latest)
    })
}

export async function deleteRoster(args: Parameters<typeof server.deleteRoster>[0]): ReturnType<typeof server.deleteRoster> {
  const owner = localOwner()?.id
  if (!localEngine()) return server.deleteRoster(args)
  const roster = await sharedRoster({ data: args.data })
  if (!roster) return null
  await queueLocal('deleteRoster', draftFor(roster), `roster:${roster.id}`, { data: null, owner })
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

export async function shareSealedEventRoster(
  args: Parameters<typeof server.shareSealedEventRoster>[0],
): ReturnType<typeof server.shareSealedEventRoster> {
  const owner = localOwner()?.id
  const resource = `roster:${args.data.rosterId}`
  if (!navigator.onLine) throw new Error('Connect to the internet to share your sealed roster.')
  if (await hasLocalChanges(resource)) {
    await syncLocalWork()
    if (await hasLocalChanges(resource)) throw new Error('This roster has changes waiting to sync. Sync or review them first.')
  }
  if (localOwner()?.id !== owner) throw accountChanged()
  const result = await server.shareSealedEventRoster(args)
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

type StoredDocument = LocalState['documents'][string]

const rosterMoved = (before: StoredDocument | undefined, after: StoredDocument | undefined) =>
  before?.serverVersion !== after?.serverVersion ||
  (before?.data as LocalRoster | null | undefined)?.updatedAt !== (after?.data as LocalRoster | null | undefined)?.updatedAt

/** An action only the server accepts, sent once this device has sent the roster's saved changes, and then recorded on the saved copy. */
async function serverAcceptedRoster<Saved extends { updatedAt: LocalRoster['updatedAt'] }>(
  id: string,
  action: string,
  send: () => Promise<Saved>,
  patch: Partial<LocalRoster>,
) {
  const owner = localOwner()?.id
  const resource = `roster:${id}`
  if (localEngine()) {
    if (!navigator.onLine) throw new Error(`Connect to the internet to ${action}.`)
    if (await hasLocalChanges(resource)) await syncLocalWork()
    if (await hasLocalChanges(resource)) throw new Error('This roster has changes waiting to sync. Sync or review them first.')
  }
  const saved = await send()
  const local = await localDocument<LocalRoster | null>(resource)
  if (local) await rememberDocument(resource, { ...local, ...patch, updatedAt: saved.updatedAt }, saved.updatedAt, owner)
  return saved
}

export function setRosterLocked(args: Parameters<typeof server.setRosterLocked>[0]): ReturnType<typeof server.setRosterLocked> {
  return serverAcceptedRoster(args.data.id, 'lock or unlock this roster', () => server.setRosterLocked(args), { locked: args.data.locked })
}

export function setRosterArchived(args: Parameters<typeof server.setRosterArchived>[0]): ReturnType<typeof server.setRosterArchived> {
  return serverAcceptedRoster(args.data.id, 'archive or unarchive this roster', () => server.setRosterArchived(args), {
    archived: args.data.archived,
  })
}

/** Needs a connection: the device keeps no copy of the answer. */
export function declineRosterSharing(
  args: Parameters<typeof server.declineRosterSharing>[0],
): ReturnType<typeof server.declineRosterSharing> {
  return server.declineRosterSharing(args)
}

export function splitRosterVariant(args: Parameters<typeof server.splitRosterVariant>[0]): ReturnType<typeof server.splitRosterVariant> {
  return serverAcceptedRoster(args.data.id, 'make this variant its own roster', () => server.splitRosterVariant(args), {
    baseRosterId: null,
  })
}

/**
 * A library action on several rosters is accepted by the server all together, after this device has sent their saved
 * changes, so unlike most single actions it needs a connection.
 */
export async function changeRosters(args: Parameters<typeof server.changeRosters>[0]): ReturnType<typeof server.changeRosters> {
  const owner = localOwner()?.id
  const waiting = async () => (await Promise.all(args.data.ids.map((id) => hasLocalChanges(`roster:${id}`)))).some(Boolean)
  if (localEngine()) {
    if (!navigator.onLine) throw new Error('Connect to the internet to change several rosters at once.')
    if (await waiting()) await syncLocalWork()
    if (await waiting()) throw new Error('Some of these rosters have changes waiting to sync. Sync or review them first.')
  }
  const saved = await server.changeRosters(args)
  const { action } = args.data
  for (const { id, updatedAt } of saved) {
    const resource = `roster:${id}`
    const local = await localDocument<LocalRoster | null>(resource)
    if (action === 'delete') await rememberDocument(resource, null, updatedAt, owner)
    else if (local) await rememberDocument(resource, { ...local, ...ROSTER_BATCH_CHANGES[action], updatedAt }, updatedAt, owner)
  }
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
  const local = await localDocument<LocalRoster | null>(resource)
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
  if (local && (isOffline() || (await hasLocalChanges(resource))))
    return checked(loadoutDatasheets({ data: inputFor(local), signal: args.signal }))
  return checked(
    calculationRead(
      (signal) => server.savedRosterLoadoutDatasheets({ ...args, signal }),
      async (error) => {
        const roster = local
        const construction = roster && (await localConstruction(roster.catalogueId))
        if (!roster || !construction) throw error ?? new Error('Army data is unavailable.')
        return rosterLoadoutDatasheets(construction.catalogue, datasheetSchema.parse(inputFor(roster)), construction.rules)
      },
      args.signal,
    ),
  )
}

export async function savedRosterSummaries(args?: { signal?: AbortSignal }): ReturnType<typeof server.savedRosterSummaries> {
  const engine = localEngine()
  const assertAccount = accountGuard()
  const summaries = await cachedRead(savedRosterSummariesKey(), async () => {
    const before = await engine?.storage.read()
    assertAccount()
    const fresh = await server.savedRosterSummaries({
      signal: withTimeout(args?.signal, 5_000),
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
        if (rosterMoved(previous, document)) retained.add(resource)
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
  return overlaySummaries(summaries, state, isOffline())
}

async function assessedRoster(roster: LocalRoster, owner: string, signal?: AbortSignal) {
  return calculationRead(
    async (requestSignal) => {
      const input = savedRosterPriceInput(roster)
      // A price depends only on its key, so a list repriced on every library read asks the server once per version.
      let price = cachedPrice(input)
      if (price === undefined) {
        price = await server.priceRoster({ data: input, signal: requestSignal })
        localClient()?.setQueryData(rosterPriceKey(input), price)
      }
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
  const assertAccount = accountGuard()
  const before = await engine.storage.read()
  assertAccount()
  const fresh = await calculationRead(
    (signal) => server.savedRosterPage({ ...args, signal }),
    (error) => {
      if (!hasLocalConstruction()) throw error ?? new Error('Download army rules before using them offline.')
      return undefined
    },
    args.signal,
    hasLocalConstruction() ? undefined : SERVER_ONLY_TIMEOUT_MS,
  )
  assertAccount()
  const state = await engine.storage.read()
  assertAccount()
  const cachedRow = (id: string) =>
    localClient()?.getQueryData<Awaited<ReturnType<typeof server.savedRosterPage>>[number] | null>(savedRosterPageKey(id)) ?? undefined
  const rows = new Map((fresh ?? args.data.ids.flatMap((id) => cachedRow(id) ?? [])).map((row) => [row.id, row]))
  await Promise.all(
    args.data.ids.map(async (id) => {
      const resource = `roster:${id}`
      const document = state.documents[resource]
      const changed = rosterMoved(before.documents[resource], document)
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
        changes: cachedRow(id)?.changes ?? 0,
        differences: (await accessOf(roster, state)).differences,
      })
    }),
  )
  return args.data.ids.flatMap((id) => (rows.get(id) ? [rows.get(id)!] : []))
}

export async function homeRosters(args?: { signal?: AbortSignal }): ReturnType<typeof server.homeRosters> {
  const engine = localEngine()
  if (!engine) return server.homeRosters(args)
  const owner = localOwner()!.id
  const assertAccount = accountGuard()
  const before = await engine.storage.read()
  assertAccount()
  const fresh = await calculationRead(
    (signal) => server.homeRosters({ signal }),
    (error) => {
      if (!hasLocalConstruction()) throw error ?? new Error('Download army rules before using them offline.')
      return undefined
    },
    args?.signal,
    hasLocalConstruction() ? undefined : SERVER_ONLY_TIMEOUT_MS,
  )
  assertAccount()
  const state = await engine.storage.read()
  assertAccount()
  if (
    fresh &&
    !state.operations.some((operation) => operation.resource.startsWith('roster:')) &&
    Object.entries(state.documents).every(
      ([resource, document]) => !resource.startsWith('roster:') || !rosterMoved(before.documents[resource], document),
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
  const savedHome = localClient()?.getQueryData<Awaited<ReturnType<typeof server.homeRosters>>>(homeRostersKey())
  // Rows already joined to their army name it first; a list only this device has needs the saved faction index.
  const joined = new Map([...(savedHome?.rosters ?? []), ...(fresh?.rosters ?? [])].map((row) => [row.roster.catalogueId, row.faction]))
  const index = recent.every((roster) => joined.get(roster.catalogueId))
    ? null
    : await loadSavedQuery<Awaited<ReturnType<typeof server.factionIndex>>>(referenceData(), factionIndexKey())
  assertAccount()
  const factionOf = (catalogueId: string) => {
    const indexed = index?.factions.find((faction) => faction.id === catalogueId)
    return joined.get(catalogueId) ?? (indexed && rosterFaction(indexed))
  }
  if (fresh) {
    const page = await savedRosterPage({ data: { ids: recent.map((roster) => roster.id) }, signal: args?.signal })
    assertAccount()
    const rows = byId(page)
    return {
      count: active.length,
      rosters: recent.map((roster) => ({
        roster,
        faction: factionOf(roster.catalogueId),
        points: rows.get(roster.id)?.points ?? null,
        problem: rows.get(roster.id)?.problem ?? null,
        label: rows.get(roster.id)?.label ?? roster.name,
      })),
    }
  }
  const rosters = await Promise.all(
    recent.map(async (summary) => {
      const roster = state.documents[`roster:${summary.id}`]?.data as LocalRoster | null | undefined
      const cached = savedHome?.rosters.find((row) => row.roster.id === summary.id && row.roster.updatedAt === summary.updatedAt)
      const assessment = roster
        ? await localRosterAssessment(roster, owner)
        : { points: cached?.points ?? null, problem: cached?.problem ?? null, label: cached?.label ?? summary.name }
      assertAccount()
      return { roster: summary, faction: factionOf(summary.catalogueId), ...assessment }
    }),
  )
  return { count: active.length, rosters }
}

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
export const savedRosterPlays = () => cachedRead(savedRosterPlaysKey(), () => server.savedRosterPlays())
