import { createServerFn } from '@tanstack/react-start'
import { getRequest, setCookie } from '@tanstack/react-start/server'
import { app } from './app'
import { createId } from './crypto'
import { cookieOptions, PLAYER_COOKIE, playerIdFrom, signPlayerId } from './identity'
import { evaluate } from '../core/evaluate'
import { buildUnit } from '../core/roster'
import { unitsIn } from './catalogue'
import { mutationRpc, rpc } from './rpc'
import { createBattleSchema, joinBattleSchema, priceSchema, submitSchema, tokenSchema, unitsSchema } from './schemas'

/** Reads answer null for a link that points at nothing, so the route can render a real 404. */
function orNull<T>(work: () => T) {
  try {
    return work()
  } catch (error) {
    if (error instanceof Response && error.status === 404) return null
    throw error
  }
}

function currentPlayerId() {
  return playerIdFrom(getRequest().headers, app().secret)
}

function requirePlayerId() {
  const id = currentPlayerId()
  if (!id) throw new Response('say who you are first', { status: 401 })
  return id
}

/**
 * The identity behind the cookie, minting one on the way through. A guest is a
 * durable record from here on — the command log points at it — so this is the
 * only place an id comes into existence.
 */
function identify(name: string) {
  const request = getRequest()
  const existing = playerIdFrom(request.headers, app().secret)
  const id = existing ?? createId()
  if (!existing) setCookie(PLAYER_COOKIE, signPlayerId(id, app().secret), cookieOptions(request.headers))
  app().service.identify(id, name)
  return id
}

export const me = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const id = currentPlayerId()
    const player = id ? app().service.player(id) : undefined
    return player ? { id: player.id, name: player.name } : null
  }),
)

export const openBattle = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(() => orNull(() => app().service.screen(data.token, currentPlayerId()))))

export const createBattle = createServerFn({ method: 'POST' })
  .validator(createBattleSchema)
  .handler(({ data }) => mutationRpc(() => app().service.createBattle(identify(data.name))))

export const joinBattle = createServerFn({ method: 'POST' })
  .validator(joinBattleSchema)
  .handler(({ data }) => mutationRpc(() => app().service.join(data.token, identify(data.name))))

/**
 * Every change to a battle comes through here. The result is the domain's answer,
 * not an exception: a refusal is something to show the player, and a stale seq is
 * something to refetch from.
 */
export const submit = createServerFn({ method: 'POST' })
  .validator(submitSchema)
  .handler(({ data }) => mutationRpc(() => app().service.submit(data.token, requirePlayerId(), data.expectedSeq, data.command)))

/** Null on an instance with no catalogue data, so the interface can simply not offer list building. */
export const factions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const loaded = app().catalogue()
    return loaded ? { revision: loaded.index.revision, factions: loaded.factions } : null
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

      const picked = data.units.flatMap((wanted) => {
        const built = buildUnit(wanted.entryId, loaded.index, wanted.models)
        const entry = loaded.index.definitions.get(wanted.entryId)
        return built ? [{ entryId: wanted.entryId, name: entry?.name ?? wanted.entryId, ...built }] : []
      })

      const options = { primaryCatalogueId: data.catalogueId }
      const whole = evaluate(
        picked.map((unit) => unit.selection),
        loaded.index,
        options,
      )

      return {
        revision: loaded.index.revision,
        points: whole.points,
        errors: whole.errors,
        unhandled: whole.unhandled,
        selections: picked.map((unit) => unit.selection),
        units: picked.map((unit) => ({
          entryId: unit.entryId,
          name: unit.name,
          points: evaluate([unit.selection], loaded.index, options).points,
          size: { min: unit.size.min, max: unit.size.max, models: unit.size.models, resizable: unit.size.max > unit.size.min },
        })),
      }
    }),
  )
