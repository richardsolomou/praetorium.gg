import { definePlugin } from 'nitro'
import { shutDownGlobalSingletons } from '../lib/globalSingleton'

/**
 * Sends queued telemetry once Nitro has stopped accepting requests and drained the ones in flight, which it does on
 * `SIGTERM` and `SIGINT`. Two seconds fits inside the three `scripts/nodeServer.ts` gives this process before killing it.
 */
export default definePlugin((nitro) => {
  nitro.hooks.hook('close', () => shutDownGlobalSingletons(2_000))
})
