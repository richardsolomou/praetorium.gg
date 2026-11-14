import type { z } from 'zod'
import { app } from './app'
import { requireUser, requireUserId } from './playerSession'
import { mutationRpc } from './rpc'
import type { pushDeviceSchema } from '../contracts/schemas'
import type { WebPushSubscription } from '../core/notifications'

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
    await app().service.preferencesService.registerPushDevice(player.id, device)
    return null
  }, request)
}

export function unregisterPushDeviceRequest(request: Request, token: string) {
  return mutationRpc(async () => {
    await app().repository.unregisterPushToken(await requireUserId(request), token)
    return null
  }, request)
}

/** Bind this browser to the signed-in account, under the same rules as an app device. */
export function registerWebPushRequest(request: Request, subscription: WebPushSubscription) {
  return mutationRpc(async () => {
    const player = await requireUser(request)
    if (player.impersonatedBy) throw new Response('stop impersonating to turn on notifications here', { status: 403 })
    await app().service.registerWebPushSubscription(player.id, subscription)
    return null
  }, request)
}

export function unregisterWebPushRequest(request: Request, endpoint: string) {
  return mutationRpc(async () => {
    await app().repository.unregisterWebPushSubscription(await requireUserId(request), endpoint)
    return null
  }, request)
}
