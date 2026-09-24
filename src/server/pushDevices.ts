import type { z } from 'zod'
import { app } from './app'
import { requireUser, requireUserId } from './playerSession'
import { mutationRpc } from './rpc'
import type { pushDeviceSchema } from './schemas'

/**
 * Bind this device to the signed-in account.
 *
 * Takes the request rather than reaching for it, so the WebView's own headers can
 * be put through the same origin and session checks in a test. The page calls it
 * with `fetch`, which carries an `Origin`, so it keeps the ordinary mutation check.
 */
export function registerPushDeviceRequest(request: Request, device: z.infer<typeof pushDeviceSchema>) {
  return mutationRpc(async () => {
    const player = await requireUser(request)
    // An administrator's phone must not start receiving the impersonated player's notices.
    if (player.impersonatedBy) throw new Response('stop impersonating to register this device', { status: 403 })
    await app().service.registerPushDevice(player.id, device)
    return null
  }, request)
}

export function unregisterPushDeviceRequest(request: Request, token: string) {
  return mutationRpc(async () => {
    await app().service.unregisterPushDevice(await requireUserId(request), token)
    return null
  }, request)
}
