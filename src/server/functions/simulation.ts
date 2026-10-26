import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { rosterCombatantsSchema, combatRequestsSchema } from '../../contracts/combatCalculation'
import { forgetMatchupSchema, rememberMatchupSchema } from '../../contracts/schemas'
import { rosterCombatants } from '../../shared/rosterCombatants'
import { app } from '../app'
import { forSignedIn, requireUserId } from '../playerSession'
import { productActions } from '../productActions'
import { mutationRpc, rpc } from '../rpc'
import { combatCalculationPool } from '../combatCalculationPool'

export const combatantDatasheets = createServerFn({ method: 'POST' })
  .validator(rosterCombatantsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const loaded = await app().catalogueFor(data.catalogueId)
      return loaded ? rosterCombatants(loaded, await app().rulesFor(data.catalogueId), data) : data.pickIndices.map(() => null)
    }),
  )

export const calculateCombatBatch = createServerFn({ method: 'POST' })
  .validator(combatRequestsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const controller = new AbortController()
      const signal = AbortSignal.any([getRequest().signal, controller.signal])
      try {
        return await Promise.all(data.map((request) => combatCalculationPool.calculate(request, signal)))
      } catch (error) {
        controller.abort(error)
        throw error
      }
    }),
  )

/** Empty for a guest, whose matchups stay on their device. */
export const recentMatchups = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.recentMatchups(id))),
)

export const rememberMatchup = createServerFn({ method: 'POST' })
  .validator(rememberMatchupSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.rememberMatchup(userId, data)
    }),
  )

export const forgetMatchup = createServerFn({ method: 'POST' })
  .validator(forgetMatchupSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.forgetMatchup(userId, data)
    }),
  )
