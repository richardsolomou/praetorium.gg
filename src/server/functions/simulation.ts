import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { rosterCombatantsSchema, combatRequestsSchema } from '../../contracts/combatCalculation'
import { rosterCombatants } from '../../shared/rosterCombatants'
import { app } from '../app'
import { mutationRpc } from '../rpc'
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
