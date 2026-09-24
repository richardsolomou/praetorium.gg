import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { app } from '../app'
import { requireUserId } from '../playerSession'
import { registerPushDeviceRequest, unregisterPushDeviceRequest } from '../pushDevices'
import { mutationRpc, rpc } from '../rpc'
import { pushDeviceSchema, pushPreferenceSchema, pushTokenOnlySchema } from '../schemas'

/** Whether this instance sends notifications, and whether this player wants them. */
export const notificationSettings = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => ({ available: app().push, enabled: await app().service.pushEnabled(await requireUserId()) })),
)

export const setPushNotifications = createServerFn({ method: 'POST' })
  .validator(pushPreferenceSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.setPushEnabled(await requireUserId(), data.enabled)))

export const registerPushDevice = createServerFn({ method: 'POST' })
  .validator(pushDeviceSchema)
  .handler(({ data }) => registerPushDeviceRequest(getRequest(), data))

export const unregisterPushDevice = createServerFn({ method: 'POST' })
  .validator(pushTokenOnlySchema)
  .handler(({ data }) => unregisterPushDeviceRequest(getRequest(), data.token))
