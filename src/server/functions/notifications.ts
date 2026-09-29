import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { app } from '../app'
import { requireUserId } from '../playerSession'
import { registerPushDeviceRequest, unregisterPushDeviceRequest } from '../pushDevices'
import { mutationRpc, rpc } from '../rpc'
import { pushDeviceSchema, pushPreferenceSchema, pushTokenOnlySchema } from '../schemas'

/** Whether this instance sends notifications. */
export const notificationSettings = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    await requireUserId()
    return { available: app().push }
  }),
)

export const setPushNotifications = createServerFn({ method: 'POST' })
  .validator(pushPreferenceSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const instance = app()
      const enabled = await instance.service.setPushEnabled(userId, data.enabled)
      await instance.telemetry.capture(userId, 'push_notifications_updated', { enabled })
      return enabled
    }),
  )

export const registerPushDevice = createServerFn({ method: 'POST' })
  .validator(pushDeviceSchema)
  .handler(({ data }) => registerPushDeviceRequest(getRequest(), data))

export const unregisterPushDevice = createServerFn({ method: 'POST' })
  .validator(pushTokenOnlySchema)
  .handler(({ data }) => unregisterPushDeviceRequest(getRequest(), data.token))
