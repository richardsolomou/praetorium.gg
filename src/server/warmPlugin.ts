import { definePlugin } from 'nitro'
import { combatCalculationPool } from './combatCalculationPool'

// No warm-up starts here: this bundle is separate from the SSR bundle that serves requests, so importing app()
// would warm unread copies of its module caches. `scripts/nodeServer.ts` probes /api/health from boot, which
// creates the app in the SSR bundle and starts the warm-up there.
export default definePlugin((nitro) => {
  nitro.hooks.hook('close', () => combatCalculationPool.close())
})
