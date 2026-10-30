import { productActions, signedInAction } from '../productActions'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { app } from '../app'
import { requireUserId } from '../playerSession'
import { registerPushDeviceRequest, unregisterPushDeviceRequest } from '../pushDevices'
import { rpc } from '../rpc'
import { pushDeviceSchema, pushPreferenceSchema, pushTokenOnlySchema } from '../../contracts/schemas'

/** Whether this instance sends notifications. */
export const notificationSettings = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    await requireUserId()
    return { available: app().push }
  }),
)

export const setPushNotifications = createServerFn({ method: 'POST' })
  .validator(pushPreferenceSchema)
  .handler(({ data }) => signedInAction(productActions.setPushNotifications, data))

export const registerPushDevice = createServerFn({ method: 'POST' })
  .validator(pushDeviceSchema)
  .handler(({ data }) => registerPushDeviceRequest(getRequest(), data))

export const unregisterPushDevice = createServerFn({ method: 'POST' })
  .validator(pushTokenOnlySchema)
  .handler(({ data }) => unregisterPushDeviceRequest(getRequest(), data.token))
