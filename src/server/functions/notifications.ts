import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { app } from '../app'
import { forSignedIn, requireUserId } from '../playerSession'
import { registerPushDeviceRequest, unregisterPushDeviceRequest } from '../pushDevices'
import { mutationRpc, rpc } from '../rpc'
import { captureMutation } from '../mutationTelemetry'
import { pushDeviceSchema, pushTokenOnlySchema } from '../../contracts/schemas'
import { NOTICES_PER_USER } from '../../core/notificationConfig'
import { z } from 'zod'

/** Whether this instance sends notifications. */
export const notificationSettings = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    await requireUserId()
    return { available: app().push }
  }),
)

export const registerPushDevice = createServerFn({ method: 'POST' })
  .validator(pushDeviceSchema)
  .handler(({ data }) => registerPushDeviceRequest(getRequest(), data))

export const unregisterPushDevice = createServerFn({ method: 'POST' })
  .validator(pushTokenOnlySchema)
  .handler(({ data }) => unregisterPushDeviceRequest(getRequest(), data.token))

/** The signed-in player's notices, newest first; none signed out. */
export const notices = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => forSignedIn([], (id) => app().service.preferencesService.notices(id))),
)

/** The signed-in player has read these notices, on whichever device. */
export const markNoticesRead = createServerFn({ method: 'POST' })
  .validator(z.object({ ids: z.array(z.string().max(20)).min(1).max(NOTICES_PER_USER) }))
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const moved = await app().service.preferencesService.markNoticesRead(userId, data.ids)
      if (moved) await captureMutation(userId, 'notices_read', { count: data.ids.length })
      return moved
    }),
  )
