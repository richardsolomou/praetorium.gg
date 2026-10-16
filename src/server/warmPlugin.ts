import { definePlugin } from 'nitro'
import { app } from './app'
import { combatCalculationPool } from './combatCalculationPool'

export default definePlugin((nitro) => {
  // The Vite dev server evaluates a second copy of app.ts here beside the SSR environment's,
  // and warming both builds the catalogue twice, so development warms from its first request.
  if (process.env.NODE_ENV === 'production') void app().ready()
  nitro.hooks.hook('close', () => combatCalculationPool.close())
})
