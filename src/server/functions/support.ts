import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { supportReferenceSchema, supportSubmissionSchema } from '../../core/supportReport'
import { app } from '../app'
import { requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'

export const supportAvailability = createServerFn({ method: 'GET' }).handler(() => rpc(() => ({ configured: app().support.configured })))

export const ownSupportReports = createServerFn({ method: 'GET' }).handler(() => rpc(async () => app().support.list(await requireUserId())))

export const submitSupportReport = createServerFn({ method: 'POST' })
  .validator(supportSubmissionSchema)
  .handler(({ data }) => mutationRpc(async () => app().support.submit(await requireUserId(), data)))

export const checkSupportReport = createServerFn({ method: 'POST' })
  .validator(z.strictObject({ reference: supportReferenceSchema, page: z.number().int().min(1).max(100) }))
  .handler(({ data }) => mutationRpc(async () => app().support.check(await requireUserId(), data.reference, data.page)))
