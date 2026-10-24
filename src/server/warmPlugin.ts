import { definePlugin } from 'nitro'
import { combatCalculationPool } from './combatCalculationPool'

export default definePlugin((nitro) => {
  // Requests run in the SSR bundle, whose module-level caches (unit lists, pickers) are its own copies, so the
  // warm-up starts through a request there; importing app() here would warm this bundle's unused copies.
  // The Vite dev server evaluates a second copy as well, so development warms from its first request.
  if (process.env.NODE_ENV === 'production')
    setImmediate(() =>
      Promise.resolve(nitro.fetch(new Request('http://localhost/api/health'))).catch((error: unknown) => {
        console.error({ event: 'catalogue_warm_failed', error })
      }),
    )
  nitro.hooks.hook('close', () => combatCalculationPool.close())
})
