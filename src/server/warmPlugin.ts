import { definePlugin } from 'nitro'
import { app } from './app'
import { combatCalculationPool } from './combatCalculationPool'

export default definePlugin((nitro) => {
  void app().ready()
  nitro.hooks.hook('close', () => combatCalculationPool.close())
})
