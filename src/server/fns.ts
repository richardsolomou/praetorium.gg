import { createServerFn } from '@tanstack/react-start'
import { getRequest, setCookie } from '@tanstack/react-start/server'
import { app } from './app'
import { createId } from './crypto'
import { cookieOptions, PLAYER_COOKIE, playerFor, playerIdFrom, signPlayerId } from './identity'
import { configuredProviders } from './auth'
import { evaluate, type Selection } from '../core/evaluate'
import { attachmentOf } from '../core/attach'
import { buildUnit, modelCountOf, unitChoices, unitToggles, wargearOf } from '../core/roster'
import { datasheetIn, groupOfEntry, unitsIn } from './catalogue'
import { fromRosterXml, toRosterXml } from '../core/rosz'
import { parseXml, rosterXml } from './rosz'
import { ATTRIBUTION, slug } from './rules'
import { mutationRpc, rpc } from './rpc'
import {
  createBattleSchema,
  datasheetSchema,
  detachmentRulesSchema,
  exportRosterSchema,
  importRosterSchema,
  joinBattleSchema,
  priceSchema,
  ownedSchema,
  rosterIdSchema,
  saveRosterSchema,
  submitSchema,
  tokenSchema,
  unitsSchema,
} from './schemas'

/** Reads answer null for a link that points at nothing, so the route can render a real 404. */
function orNull<T>(work: () => T) {
  try {
    return work()
  } catch (error) {
    if (error instanceof Response && error.status === 404) return null
    throw error
  }
}

const allSelections = (selection: Selection): Selection[] => [selection, ...(selection.selections ?? []).flatMap(allSelections)]

/**
 * Who is asking. An account that has claimed a guest identity is that identity, so
 * nothing downstream needs to know which of the two it is talking to.
 */
async function currentPlayerId() {
  const request = getRequest()
  const session = await app().auth.api.getSession({ headers: request.headers })
  return playerFor(
    request.headers,
    app().secret,
    session ? { userId: session.user.id, name: session.user.name } : null,
    (userId, guest, name) => app().service.playerForUser(userId, guest, name),
  )
}

async function requirePlayerId() {
  const id = await currentPlayerId()
  if (!id) throw new Response('say who you are first', { status: 401 })
  return id
}

/**
 * The identity behind the cookie, minting one on the way through. A guest is a
 * durable record from here on — the command log points at it — so this is the
 * only place an id comes into existence.
 */
async function identify(name: string) {
  const request = getRequest()
  const existing = await currentPlayerId()
  const id = existing ?? createId()
  // The cookie is issued whether or not there is an account: it is what a guest is,
  // and an account simply claims one.
  if (!playerIdFrom(request.headers, app().secret)) setCookie(PLAYER_COOKIE, signPlayerId(id, app().secret), cookieOptions(request.headers))
  app().service.identify(id, name)
  return id
}

export const me = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentPlayerId()
    const player = id ? app().service.player(id) : undefined
    return player ? { id: player.id, name: player.name, signedIn: Boolean(player.userId) } : null
  }),
)

/** Establishes a durable guest without making opening a battle the onboarding flow. */
export const identifyPlayer = createServerFn({ method: 'POST' })
  .validator(createBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const id = await identify(data.name)
      return app().service.player(id)!
    }),
  )

export const myBattles = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentPlayerId()
    return id ? app().service.battles(id) : []
  }),
)

export const openBattle = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const player = await currentPlayerId()
      return orNull(() => app().service.screen(data.token, player, app().rules()))
    }),
  )

export const createBattle = createServerFn({ method: 'POST' })
  .validator(createBattleSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.createBattle(await identify(data.name))))

export const joinBattle = createServerFn({ method: 'POST' })
  .validator(joinBattleSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.join(data.token, await identify(data.name))))

/**
 * Every change to a battle comes through here. The result is the domain's answer,
 * not an exception: a refusal is something to show the player, and a stale seq is
 * something the answer's own screen already corrects.
 */
export const submit = createServerFn({ method: 'POST' })
  .validator(submitSchema)
  .handler(({ data }) =>
    mutationRpc(async () => app().service.submit(data.token, await requirePlayerId(), data.expectedSeq, data.command, app().rules())),
  )

/** The datasheets this player owns, so the picker can be asked to show only those. */
export const collection = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentPlayerId()
    return id ? app().service.collection(id) : []
  }),
)

export const setOwned = createServerFn({ method: 'POST' })
  .validator(ownedSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.setOwned(await requirePlayerId(), data.entryId, data.owned)))

/** How the community data is doing, so a fresh instance can say so rather than look broken. */
export const catalogueStatus = createServerFn({ method: 'GET' }).handler(() => rpc(() => app().sync()))

/** Null on an instance with no catalogue data, so the interface can simply not offer list building. */
export const factions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const loaded = app().catalogue()
    if (!loaded) return null
    const rules = app().rules()
    return {
      revision: loaded.index.revision,
      factions: loaded.factions.map((faction) => ({
        id: faction.id,
        name: faction.name,
        displayName: rules?.factionNames.get(slug(faction.name)) ?? faction.name,
        references: faction.references,
        detachments: (loaded.detachments.get(faction.id)?.options ?? []).map((detachment) => {
          const reference = rules?.detachmentReferences.get(slug(faction.name))?.get(slug(detachment.name))
          return {
            id: detachment.id,
            name: detachment.name,
            disposition: detachment.disposition,
            reference: reference
              ? {
                  ...reference,
                  dispositions: reference.dispositions.map((disposition) => rules?.dispositions.get(disposition) ?? disposition),
                }
              : null,
          }
        }),
      })),
    }
  }),
)

export const units = createServerFn({ method: 'GET' })
  .validator(unitsSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      return loaded ? unitsIn(loaded, data.catalogueId, data.query) : []
    }),
  )

export const datasheet = createServerFn({ method: 'GET' })
  .validator(datasheetSchema)
  .handler(({ data }) =>
    rpc(() => {
      const loaded = app().catalogue()
      return loaded ? datasheetIn(loaded, data.catalogueId, data.entryId) : null
    }),
  )

/**
 * Prices a list in progress and says what is wrong with it.
 *
 * A POST because a list is too big for a query string, and it goes through
 * `mutationRpc` for the origin check even though it changes nothing. Each entry is
 * expanded to the smallest selection the data accepts, and the expansion is
 * returned so the roster that gets attached is exactly the one that was priced.
 */
export const priceRoster = createServerFn({ method: 'POST' })
  .validator(priceSchema)
  .handler(({ data }) =>
    mutationRpc(() => {
      const loaded = app().catalogue()
      if (!loaded) return null

      // The detachment goes in first: enhancements and some unit limits are
      // written as conditions on which one the roster holds.
      const detachment = loaded.detachments.get(data.catalogueId)
      const chosen = detachment?.options.find((option) => option.id === data.detachmentId)
      const detachmentSelection: Selection[] = chosen
        ? [
            {
              id: detachment!.wrapperId,
              count: 1,
              selections: [{ id: detachment!.groupId, count: 1, selections: [{ id: chosen.id, count: 1 }] }],
            },
          ]
        : []

      const picked = data.units.flatMap((wanted, key) => {
        const built = buildUnit(wanted.entryId, loaded.index, wanted.models, wanted.choices, {
          primaryCatalogueId: data.catalogueId,
          roster: detachmentSelection,
          spreads: wanted.spreads,
          toggles: wanted.toggles,
        })
        const entry = loaded.index.definitions.get(wanted.entryId)
        return built ? [{ key, entryId: wanted.entryId, name: entry?.name ?? wanted.entryId, ...built }] : []
      })

      const options = { primaryCatalogueId: data.catalogueId }
      const selections = [...detachmentSelection, ...picked.map((unit) => unit.selection)]
      const whole = evaluate(selections, loaded.index, options)

      return {
        revision: loaded.index.revision,
        detachment: chosen?.name ?? null,
        disposition: chosen?.disposition ?? null,
        points: whole.points,
        errors: whole.errors,
        unhandled: whole.unhandled,
        selections,
        units: picked.map((unit) => ({
          key: unit.key,
          entryId: unit.entryId,
          name: unit.name,
          points: evaluate([unit.selection], loaded.index, options).points,
          size: { min: unit.size.min, max: unit.size.max, models: unit.size.models, resizable: unit.size.max > unit.size.min },
          choices: unit.choices,
          toggles: unit.toggles,
          enhancements: unit.choices
            .filter((choice) => choice.name.toLowerCase().includes('enhancement'))
            .flatMap((choice) => choice.options.filter((option) => option.count > 0).map((option) => option.name)),
          // What the datasheet would print under the name, so a card can show the
          // list rather than make the player open the loadout to see it.
          wargear: wargearOf(unit.selection, loaded.index),
          group: groupOfEntry(loaded.index, unit.entryId),
          // Which units this one may join, when its own rules say it may join any.
          attachment: attachmentOf(loaded.index.definitions.get(unit.entryId) ?? { id: unit.entryId }, loaded.index),
        })),
      }
    }),
  )

/** Lists a player keeps between battles. Their own only — there is nothing to share here. */
export const savedRosters = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const id = await currentPlayerId()
    return id ? app().service.savedRosters(id) : []
  }),
)

export const sharedRoster = createServerFn({ method: 'GET' })
  .validator(rosterIdSchema)
  .handler(({ data }) => rpc(() => app().service.sharedRoster(data.id)))

export const saveRoster = createServerFn({ method: 'POST' })
  .validator(saveRosterSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.saveRoster(await requirePlayerId(), data)))

export const deleteRoster = createServerFn({ method: 'POST' })
  .validator(rosterIdSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      app().service.deleteRoster(await requirePlayerId(), data.id)
      return null
    }),
  )

/**
 * The stratagems a detachment brings and the secondary cards on offer.
 *
 * Null when the rules source has not been synced, so the interface falls back to
 * letting a player write their own down rather than offering nothing.
 */
export const detachmentRules = createServerFn({ method: 'GET' })
  .validator(detachmentRulesSchema)
  .handler(({ data }) =>
    rpc(() => {
      const rules = app().rules()
      const catalogue = app().catalogue()
      if (!rules || !catalogue) return null

      const faction = catalogue.index.catalogues.get(data.catalogueId)
      const detachments = faction ? rules.byDetachment.get(slug(faction.name)) : undefined
      return {
        attribution: ATTRIBUTION,
        dataslate: rules.dataslate,
        stratagems: detachments?.get(slug(data.detachmentName)) ?? [],
        core: rules.core,
        secondaries: rules.secondaries,
        primaries: rules.primaries,
      }
    }),
  )

/** The battlefields on offer, as polygons, so the interface can draw one. */
export const deployments = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const rules = app().rules()
    return rules?.deployments ?? []
  }),
)

/** Fetched only when someone opens the account of the battle, not on every nudge. */
export const battleReport = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.report(data.token, await requirePlayerId())))

/**
 * Reads a `.ros` or `.rosz` into picks this instance can price.
 *
 * Both sides read the same community catalogues, so an entry id from another tool
 * is the same id here. Anything that cannot be placed is named in the answer rather
 * than dropped quietly.
 */
export const importRoster = createServerFn({ method: 'POST' })
  .validator(importRosterSchema)
  .handler(({ data }) =>
    mutationRpc(() => {
      const loaded = app().catalogue()
      if (!loaded) throw new Response('this instance has no catalogue', { status: 409 })

      const parsed = fromRosterXml(rosterXml(data.file), loaded.index, parseXml)
      const catalogueId = parsed.catalogueId && loaded.index.catalogues.has(parsed.catalogueId) ? parsed.catalogueId : null
      const detachment = catalogueId ? loaded.detachments.get(catalogueId) : undefined
      const flattened = parsed.selections.flatMap(allSelections)
      const detachmentId = detachment?.options.find((option) => flattened.some((selection) => selection.id === option.id))?.id ?? null
      const importedUnits: { selection: Selection; parent: number | null; catalogueId: string | null }[] = []
      const collectUnits = (selection: Selection, parent: number | null, forceCatalogueId: string | null) => {
        const isDatasheet = loaded.index.datasheets.has(selection.id)
        const at = isDatasheet ? importedUnits.push({ selection, parent, catalogueId: forceCatalogueId }) - 1 : parent
        for (const child of selection.selections ?? []) collectUnits(child, at, forceCatalogueId)
      }
      for (const force of parsed.forces) {
        for (const selection of force.selections) collectUnits(selection, null, force.catalogueId)
      }

      return {
        name: data.name ?? parsed.name,
        catalogueId,
        catalogueName: parsed.catalogueName,
        detachmentId,
        units: importedUnits.map(({ selection, parent, catalogueId: forceCatalogueId }) => {
          const decisions = unitChoices(selection.id, selection, loaded.index, { primaryCatalogueId: catalogueId ?? undefined })
          const entry = loaded.index.definitions.get(selection.id)
          const attachedTo = parent !== null && entry && attachmentOf(entry, loaded.index) ? parent : undefined
          return {
            entryId: selection.id,
            catalogueId: forceCatalogueId ?? loaded.index.catalogueOf.get(selection.id),
            models: Math.max(1, modelCountOf(selection, loaded.index)),
            choices: Object.fromEntries(
              decisions.filter((choice) => choice.room === 1 && choice.chosen).map((choice) => [choice.key, choice.chosen]),
            ),
            spreads: Object.fromEntries(
              decisions
                .filter((choice) => choice.room > 1)
                .map((choice) => [choice.key, Object.fromEntries(choice.options.map((option) => [option.id, option.count]))]),
            ),
            toggles: Object.fromEntries(
              unitToggles(selection.id, selection, loaded.index).map((toggle) => [toggle.key, toggle.selected ? 1 : 0]),
            ),
            attachedTo,
          }
        }),
        unknown: parsed.unknown,
      }
    }),
  )

/** A `.ros` document for the list the builder is showing, ready for another tool. */
export const exportRoster = createServerFn({ method: 'POST' })
  .validator(exportRosterSchema)
  .handler(({ data }) =>
    mutationRpc(() => {
      const loaded = app().catalogue()
      if (!loaded) throw new Response('this instance has no catalogue', { status: 409 })

      const built = data.units.map((wanted) => {
        const result = buildUnit(wanted.entryId, loaded.index, wanted.models, wanted.choices, {
          primaryCatalogueId: data.catalogueId,
          spreads: wanted.spreads,
          toggles: wanted.toggles,
        })
        return result?.selection ?? null
      })
      const selections = built.filter((selection): selection is Selection => selection !== null)
      const detachmentSelection: Selection[] = data.detachmentId ? [{ id: data.detachmentId, count: 1 }] : []
      // The list's cost, worked out from its selections.
      const points = evaluate([...detachmentSelection, ...selections], loaded.index, { primaryCatalogueId: data.catalogueId }).points
      const exported: Selection[] = []
      for (const selection of selections) exported.push({ ...selection, selections: [...(selection.selections ?? [])] })
      data.units.forEach((unit, index) => {
        if (unit.attachedTo === undefined || unit.attachedTo === index) return
        const child = exported[index]
        const parent = exported[unit.attachedTo]
        if (!child || !parent) return
        parent.selections = [...(parent.selections ?? []), child]
      })
      const nested = exported.filter((_, index) => !data.units.some((unit, child) => child === index && unit.attachedTo !== undefined))
      const forceSelections = new Map<string, Selection[]>()
      forceSelections.set(data.catalogueId, [...detachmentSelection])
      nested.forEach((selection) => {
        const unit = data.units[exported.indexOf(selection)]
        const owner = unit?.catalogueId ?? loaded.index.catalogueOf.get(selection.id) ?? data.catalogueId
        const force = forceSelections.get(owner) ?? []
        force.push(selection)
        forceSelections.set(owner, force)
      })
      const forces = [...forceSelections].map(([forceCatalogueId, force]) => ({ catalogueId: forceCatalogueId, selections: force }))

      return {
        filename: `${data.name.replaceAll(/[^\w -]/g, '')}.ros`,
        xml: toRosterXml(
          { name: data.name, catalogueId: data.catalogueId, selections: forces[0]?.selections ?? [], forces },
          loaded.index,
          points,
        ),
      }
    }),
  )

/** What this instance can actually offer at sign-in, so the page shows only that. */
export const signInOptions = createServerFn({ method: 'GET' }).handler(() => rpc(() => ({ providers: configuredProviders() })))
