import { combatUnitsFor } from '../shared/combatUnits'
import { projectBattles } from './offline/battleFunctions'
import { cachedRead, cachedPage } from './offline/reads'
import { hasLocalChanges, localOwner } from './offline/localRuntime'
import { rosterDifferences } from '../core/rosterDifferences'
import { priceSchema, datasheetSchema, combatLoadoutSchema, saveRosterSchema } from '../contracts/schemas'
import * as server from '../server/functions'
import { constructionRead, localConstruction } from './offline/construction'
import {
  localClient,
  localDocument,
  localEngine,
  queueLocal,
  rememberDocument,
  type LocalRoster,
  type RosterInput,
} from './offline/localRuntime'
import { calculateRosterPrice, savedRosterPriceInput } from '../shared/pricing'
import { pickerUnitsFor, booksOffering } from '../shared/pickerUnits'
import { rosterDatasheetContext } from '../shared/rosterDatasheetContext'
import { rosterDatasheet, rosterLoadoutDatasheets } from '../shared/rosterReads'
import { rosterCombatant } from '../shared/rosterCombatRules'
import { combatLoadoutSpace } from '../shared/combatLoadouts'
import { exportRosterFile, importRosterFile, matchesImportFaction, importRosterFaction } from '../shared/rosterFiles'
import { battleDetachmentData, selectedBattleDetachmentData } from '../shared/battleDetachmentData'
import { unitWoundsIn } from '../shared/catalogue'
import { attachedUnitCount } from '../core/attachedUnits'
import { rosterUseProblem } from '../core/rosterLegality'
import { referenceData } from './offline/runtime'
import { variantName } from '../core/rosterVariants'
import type { LocalState } from '../contracts/localState'
import { playerDefaults } from './offline/actionFunctions'
import { localRosterAssessment } from './offline/rosterAssessment'

export * from '../server/functions'

export const priceRoster = (args: Parameters<typeof server.priceRoster>[0]) =>
  constructionRead(
    ({ catalogue, rules }) => calculateRosterPrice(priceSchema.parse(args.data), catalogue, rules),
    () => server.priceRoster(args),
  )
export const units = (args: Parameters<typeof server.units>[0]) =>
  constructionRead(
    ({ catalogue, rules }) =>
      pickerUnitsFor(catalogue, rules, args.data.catalogueId, args.data.query ?? '', args.data.battleSize, args.data.waivedRules),
    () => server.units(args),
  )
export const datasheetOfferedBy = (args: Parameters<typeof server.datasheetOfferedBy>[0]) =>
  constructionRead(
    ({ catalogue, rules }) => booksOffering(catalogue, rules, args.data.entryId, args.data.catalogueIds),
    () => server.datasheetOfferedBy(args),
  )
export const datasheet = (args: Parameters<typeof server.datasheet>[0]) =>
  constructionRead(
    ({ catalogue, rules }) =>
      rosterDatasheet(
        catalogue,
        args.data,
        rosterDatasheetContext(catalogue, datasheetSchema.parse(args.data)),
        args.data.everyWeapon ?? false,
        rules,
      ),
    () => server.datasheet(args),
  )
export const loadoutDatasheets = (args: Parameters<typeof server.loadoutDatasheets>[0]) =>
  constructionRead(
    ({ catalogue, rules }) => rosterLoadoutDatasheets(catalogue, datasheetSchema.parse(args.data), rules),
    () => server.loadoutDatasheets(args),
  )
export const combatantDatasheet = (args: Parameters<typeof server.combatantDatasheet>[0]) =>
  constructionRead(
    ({ catalogue, rules }) =>
      rosterCombatant(catalogue, rules, { ...datasheetSchema.parse(args.data), inactivePicks: args.data.inactivePicks }),
    () => server.combatantDatasheet(args),
  )
export const combatLoadouts = (args: Parameters<typeof server.combatLoadouts>[0]) =>
  constructionRead(
    ({ catalogue }) => combatLoadoutSpace(catalogue, combatLoadoutSchema.parse(args.data)),
    () => server.combatLoadouts(args),
  )
export const unitWounds = (args: Parameters<typeof server.unitWounds>[0]) =>
  constructionRead(
    ({ catalogue }) => unitWoundsIn(catalogue, args.data.catalogueId, args.data.entryIds),
    () => server.unitWounds(args),
  )
export const detachmentRules = (args: Parameters<typeof server.detachmentRules>[0]) =>
  constructionRead(
    ({ catalogue, rules }) => {
      const selected = battleDetachmentData(catalogue, rules, args.data.catalogueId)
      return selected ? selectedBattleDetachmentData(selected, args.data.detachmentNames) : null
    },
    () => server.detachmentRules(args),
  )
export const exportRoster = (args: Parameters<typeof server.exportRoster>[0]) =>
  constructionRead(
    ({ catalogue, rules }) =>
      (() => {
        const priced = calculateRosterPrice(priceSchema.parse(args.data), catalogue, rules)
        if (!priced) throw new Error('Army data is unavailable.')
        return exportRosterFile(
          args.data,
          catalogue,
          { ...priced, disposition: priced.disposition ?? null },
          (priced.disposition ? [priced.disposition] : priced.dispositions).map((id) => rules.dispositions.get(id) ?? id),
        )
      })(),
    () => server.exportRoster(args),
  )
export const importRoster = (args: Parameters<typeof server.importRoster>[0]) =>
  constructionRead(
    ({ catalogue, rules }) => {
      const names = [...new Set(rules.factionNames.values())]
      const stated = importRosterFaction(args.data.file)
      const book = [...catalogue.index.catalogues.values()].find((entry) => stated && matchesImportFaction(stated, entry.name))
      return importRosterFile(args.data, book ? catalogue : null, names)
    },
    () => server.importRoster(args),
  )

function factionFor(id: string) {
  return referenceData()?.queries.find((entry) => entry.key[0] === 'faction' && entry.key[1] === id)?.data as
    | NonNullable<Awaited<ReturnType<typeof server.rosterBootstrap>>>['faction']
    | undefined
}

function accessFor(roster: LocalRoster, state?: LocalState) {
  const cached = localClient()?.getQueryData<Awaited<ReturnType<typeof server.rosterAccess>>>(['roster-access', roster.id, null])
  const members = Object.values(state?.documents ?? {})
    .map((document) => document.data as LocalRoster | null)
    .filter((entry): entry is LocalRoster => Boolean(entry?.catalogueId && entry.picks))
  const baseId = roster.baseRosterId ?? roster.id
  const variants = members.filter((entry) => (entry.baseRosterId ?? entry.id) === baseId).map(summaryFor)
  const base = members.find((entry) => entry.id === roster.baseRosterId)
  const raw = base ? rosterDifferences(base, roster) : null
  const catalogue = localConstruction()?.catalogue
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
  }
}

function pricedRoster(roster: LocalRoster) {
  const data = localConstruction()
  return data ? calculateRosterPrice(savedRosterPriceInput(roster), data.catalogue, data.rules) : null
}

export async function rosterAccess(args: Parameters<typeof server.rosterAccess>[0]): ReturnType<typeof server.rosterAccess> {
  const owner = localOwner()?.id
  const resource = `roster:${args.data.id}`
  const local = !args.data.battle ? await localDocument<LocalRoster | null>(resource) : undefined
  if (local !== undefined && (!navigator.onLine || (await hasLocalChanges(resource))))
    return local ? accessFor(local, await localEngine()?.storage.read()) : null
  try {
    const result = await cachedRead(['roster-access', args.data.id, args.data.battle ?? null], () => server.rosterAccess(args))
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
        localClient()?.setQueryData(['roster-access', args.data.id, args.data.battle ?? null], retained)
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
  const resource = `roster:${args.data.id}`
  const local = !args.data.battle ? await localDocument<LocalRoster | null>(resource) : undefined
  const fromLocal = async () =>
    local
      ? {
          ...accessFor(local, await localEngine()?.storage.read()),
          price: pricedRoster(local),
          changes:
            localClient()?.getQueryData<Awaited<ReturnType<typeof server.rosterBootstrap>>>(['roster-bootstrap', local.id, null])
              ?.changes ?? [],
        }
      : null
  if (local !== undefined && (!navigator.onLine || (await hasLocalChanges(resource)))) return fromLocal()
  try {
    const result = await cachedRead(['roster-bootstrap', args.data.id, args.data.battle ?? null], () => server.rosterBootstrap(args))
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
        const retained = current
          ? { ...accessFor(current, await localEngine()?.storage.read()), price: pricedRoster(current), changes: result?.changes ?? [] }
          : null
        localClient()?.setQueryData(['roster-bootstrap', args.data.id, args.data.battle ?? null], retained)
        return retained
      }
    }
    if (await hasLocalChanges(resource)) {
      const current = await localDocument<LocalRoster | null>(resource)
      return current
        ? { ...accessFor(current, await localEngine()?.storage.read()), price: pricedRoster(current), changes: result?.changes ?? [] }
        : null
    }
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

export async function saveRoster(args: Parameters<typeof server.saveRoster>[0]): ReturnType<typeof server.saveRoster> {
  const owner = localOwner()?.id
  if (!localEngine()) return server.saveRoster(args)
  const input: RosterInput & { id: string } = {
    ...saveRosterSchema.parse(args.data),
    id: args.data.id ?? crypto.randomUUID(),
    baseRosterId: (args.data as RosterInput & { baseRosterId?: string | null }).baseRosterId ?? null,
  } as RosterInput & { id: string; baseRosterId: string | null }
  const previous = await localDocument<LocalRoster | null>(`roster:${input.id}`)
  if (previous === null) throw new Error('This roster was deleted. Save it as a new roster.')
  const now = Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1)
  const roster: LocalRoster = {
    ...input,
    automaticName: !input.name,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    borrowedDetachmentId: input.borrowedDetachmentId ?? null,
    optionalRules: input.optionalRules ?? [],
    waivedRules: input.waivedRules ?? [],
    baseRosterId: previous?.baseRosterId ?? (input as RosterInput & { baseRosterId?: string | null }).baseRosterId ?? null,
    visibility: input.visibility ?? 'private',
    source: input.source ?? 'editable',
    prep: input.prep
      ? { ...input.prep, reminders: input.prep.reminders ?? [], remindersEnabled: input.prep.remindersEnabled ?? true }
      : null,
    reminders: input.prep?.reminders ?? [],
    remindersEnabled: input.prep?.remindersEnabled ?? true,
  }
  const price = pricedRoster(roster)
  if (roster.automaticName) roster.name = price?.label ?? ''
  await queueLocal(
    'saveRoster',
    { ...roster, name: roster.automaticName ? '' : roster.name },
    `roster:${input.id}`,
    roster,
    undefined,
    undefined,
    owner,
  )
  return { id: input.id, updatedAt: now }
}

export async function copyRoster(args: Parameters<typeof server.copyRoster>[0]): ReturnType<typeof server.copyRoster> {
  const owner = localOwner()?.id
  if (!localEngine()) return server.copyRoster(args)
  const access = await rosterAccess({ data: { id: args.data.id } })
  if (!access?.editable) throw new Error('You do not own this roster.')
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
  const input = { ...draftFor(roster), id: undefined, name, visibility: rosterVisibility, baseRosterId: args.data.variant ? baseId : null }
  if (localOwner()?.id !== owner) throw new Error('The account changed before this roster could be copied.')
  const result = await saveRoster({ data: input })
  return { id: result.id }
}

function summaryFor(roster: LocalRoster) {
  return { ...roster, unitCount: attachedUnitCount(roster.picks.map((unit, key) => ({ key, attachedTo: unit.attachedTo }))) }
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
      const league = document.data as Awaited<ReturnType<typeof server.openLeague>>
      client.setQueriesData(
        {
          predicate: (query) =>
            query.queryKey[0] === 'league' &&
            query.queryKey[1] === resource.slice(7) &&
            (query.queryKey[2] === 'current' || query.queryKey[2] === league?.eventToken),
        },
        league,
      )
      continue
    }
    if (!resource.startsWith('roster:')) continue
    const id = resource.slice(7)
    const roster = document.data as LocalRoster | null
    const previous = client.getQueryData<Awaited<ReturnType<typeof server.rosterBootstrap>>>(['roster-bootstrap', id, null])
    if (roster && previous?.roster.updatedAt === roster.updatedAt) continue
    const access = roster ? accessFor(roster, state) : null
    client.setQueryData(['roster-access', id, null], access)
    client.setQueryData(['shared-roster', id, null], roster)
    client.setQueryData(
      ['roster-bootstrap', id, null],
      roster ? { ...previous, ...access, price: pricedRoster(roster), changes: previous?.changes ?? [] } : null,
    )
  }
  const summaries = client.getQueryData<Awaited<ReturnType<typeof server.savedRosterSummaries>>>(['saved-roster-summaries'])
  if (summaries !== undefined || state.operations.some((operation) => operation.resource.startsWith('roster:')))
    client.setQueryData(['saved-roster-summaries'], overlaySummaries(summaries ?? [], state))
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

export async function savedRosterPrice(args: Parameters<typeof server.savedRosterPrice>[0]): ReturnType<typeof server.savedRosterPrice> {
  const roster = await sharedRoster(args)
  return roster && localConstruction() ? pricedRoster(roster) : server.savedRosterPrice(args)
}

export async function savedRosterLoadoutDatasheets(
  args: Parameters<typeof server.savedRosterLoadoutDatasheets>[0],
): ReturnType<typeof server.savedRosterLoadoutDatasheets> {
  const roster = await sharedRoster({ data: { id: args.data.id, ...(args.data.battle ? { battle: args.data.battle } : {}) } })
  const pick = roster?.picks[args.data.pickIndex]
  if (!roster || !pick || !localConstruction()) return server.savedRosterLoadoutDatasheets(args)
  return loadoutDatasheets({
    data: {
      catalogueId: roster.catalogueId,
      entryId: pick.entryId,
      detachmentIds: roster.detachmentIds,
      picks: roster.picks,
      pickIndex: args.data.pickIndex,
      everyWeapon: false,
    },
  })
}

export async function savedRosterSummaries(): ReturnType<typeof server.savedRosterSummaries> {
  const engine = localEngine()
  const owner = localOwner()?.id
  const assertAccount = () => {
    if (localOwner()?.id !== owner || localEngine() !== engine) throw new Error('The account changed while loading these rosters.')
  }
  const summaries = await cachedRead(['saved-roster-summaries'], async () => {
    const before = await engine?.storage.read()
    assertAccount()
    const fresh = await server.savedRosterSummaries()
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

export async function savedRosterPage(args: Parameters<typeof server.savedRosterPage>[0]): ReturnType<typeof server.savedRosterPage> {
  if (!localEngine() || !localConstruction()) return server.savedRosterPage(args)
  const owner = localOwner()!.id
  return Promise.all(
    args.data.ids.map(async (id) => {
      const roster = await sharedRoster({ data: { id } })
      const assessment = roster && (await localRosterAssessment(roster, owner))
      if (localOwner()?.id !== owner) throw new Error('The account changed while loading these rosters.')
      const cached = localClient()
        ?.getQueryCache()
        .findAll({ queryKey: ['saved-roster-page'] })
        .flatMap((query) => (query.state.data as Awaited<ReturnType<typeof server.savedRosterPage>>) ?? [])
        .find((row) => row.id === id)
      return {
        id,
        problem: assessment?.problem ?? null,
        changes: cached?.changes ?? 0,
        points: assessment?.points ?? null,
        label: assessment?.label ?? '',
        differences: roster ? accessFor(roster, await localEngine()?.storage.read()).differences : null,
      }
    }),
  )
}

export async function homeRosters(): ReturnType<typeof server.homeRosters> {
  if (!localEngine() || !localConstruction()) return server.homeRosters()
  const summaries = await savedRosterSummaries()
  const rosters = await Promise.all(
    summaries.slice(0, 5).map(async (summary) => {
      const roster = await sharedRoster({ data: { id: summary.id } })
      const priced = roster ? pricedRoster(roster) : null
      return {
        roster: summary,
        points: priced?.points ?? null,
        label: priced?.label ?? '',
        problem: priced && roster ? (rosterUseProblem(priced, roster.limit, roster.waivedRules)?.kind ?? null) : null,
      }
    }),
  )
  return { count: summaries.length, rosters }
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
  updateOnboardingProgress,
  favouriteFactions,
  favouriteDetachments,
  playerDefaults,
  battleAudience,
  onboardingProgress,
  notificationSettings,
  friendships,
  opponents,
  listLeagues,
  activeFriendInvite,
  friendInvite,
  openLeagueRoster,
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
  updateLeague,
  deleteLeague,
  deleteBattle,
  setOwned,
  setFavouriteFaction,
  setFavouriteDetachment,
  setPlayerDefaults,
  setBattleAudience,
  setPushNotifications,
  createFriendInvite,
  cancelFriendInvite,
  createLeague,
  createLeagueEvent,
  leagueBattleOptions,
} from './offline/actionFunctions'

export const me = (args?: Parameters<typeof server.me>[0]) => cachedRead(['me'], () => server.me(args))
export async function rosterChanges(args: Parameters<typeof server.rosterChanges>[0]): ReturnType<typeof server.rosterChanges> {
  const state = await localEngine()?.storage.read()
  if (
    state?.documents[`roster:${args.data.id}`]?.serverVersion === null &&
    state.operations.some((operation) => operation.resource === `roster:${args.data.id}` && operation.kind === 'saveRoster')
  )
    return []
  return cachedRead(['roster-changes', args.data.id], () => server.rosterChanges(args))
}
export const savedRosterChangedCount = () => cachedRead(['saved-roster-changed-count'], () => server.savedRosterChangedCount())

export const combatUnits = () =>
  constructionRead(
    ({ catalogue, rules }) => combatUnitsFor(catalogue, rules),
    () => server.combatUnits(),
  )

export const publicBattles = (args: Parameters<typeof server.publicBattles>[0]) =>
  cachedPage(['public-battles'], args.data.before, () => server.publicBattles(args))
export const friendBattles = (args: Parameters<typeof server.friendBattles>[0]) =>
  cachedPage(['friend-battles'], args.data.before, () => server.friendBattles(args))
export const listLeagueBattles = (args: Parameters<typeof server.listLeagueBattles>[0]) =>
  cachedPage(['league-battles', args.data.token, args.data.eventToken], args.data.before, () => server.listLeagueBattles(args))
export const standings = () => cachedRead(['standings'], () => server.standings())
export const playerRosters = (args: Parameters<typeof server.playerRosters>[0]) =>
  cachedRead(['player-rosters', args.data.userId], () => server.playerRosters(args))
export const playerRankings = (args: Parameters<typeof server.playerRankings>[0]) =>
  cachedRead(['player-rankings', args.data.userId], () => server.playerRankings(args))
export const userProfile = (args: Parameters<typeof server.userProfile>[0]) =>
  cachedRead(['user-profile', args.data.userId], () => server.userProfile(args))
export const sharedBattles = (args: Parameters<typeof server.sharedBattles>[0]) =>
  cachedRead(['shared-battles', args.data.userId], () => server.sharedBattles(args))
export const playerProfile = (args: Parameters<typeof server.playerProfile>[0]) => {
  const { userId, ...filter } = args.data
  return cachedRead(['player-profile', userId, filter], () => server.playerProfile(args))
}
export const searchPlayers = (args: Parameters<typeof server.searchPlayers>[0]) =>
  cachedRead(['player-search', args.data.query], () => server.searchPlayers(args))
export const catalogueChangeLog = (args: Parameters<typeof server.catalogueChangeLog>[0]) =>
  cachedRead(['catalogue-changes', args.data.faction ?? null, args.data.before ?? null], () => server.catalogueChangeLog(args))
