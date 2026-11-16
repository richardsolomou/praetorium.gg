import type { NitroAppPlugin } from 'nitro/types'
import { shutDownGlobalSingletons } from '../lib/globalSingleton'

/**
 * Sends queued telemetry once Nitro has stopped accepting requests and drained the ones in flight, which it does on
 * `SIGTERM` and `SIGINT`. Two seconds fits inside the three `scripts/nodeServer.ts` gives this process before killing it.
 */
const shutdown: NitroAppPlugin = (nitro) => {
  nitro.hooks.hook('close', async () => {
    try {
      await shutDownGlobalSingletons(2_000)
    } catch (error) {
      console.error({ event: 'shutdown_failed', error })
      process.exitCode = 1
    }
  })
}

export default shutdown
