import { createHmac } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { feedbackEmailSchema, feedbackScreenshotSchema } from '../../contracts/feedback'
import { app } from '../app'
import { feedbackEmail } from '../feedbackEmail'
import { storeFeedbackScreenshot } from '../feedbackScreenshots'
import { currentUser, forSignedIn } from '../playerSession'
import { fixedWindowRateLimit } from '../rateLimit'
import { mutationRpc, rpc } from '../rpc'

const screenshotRateLimit = fixedWindowRateLimit('too many screenshot uploads', 3)
const emailRateLimit = fixedWindowRateLimit('too many feedback emails', 5)

export const uploadFeedbackScreenshot = createServerFn({ method: 'POST' })
  .validator(feedbackScreenshotSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const limited = screenshotRateLimit(getRequest())
      if (limited) throw limited
      return storeFeedbackScreenshot(data.image)
    }),
  )

/** Emails every administrator an import report PostHog has already accepted; a no-op where this instance sends no email. */
export const emailFeedback = createServerFn({ method: 'POST' })
  .validator(feedbackEmailSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const limited = emailRateLimit(getRequest())
      if (limited) throw limited
      const delivery = app().email
      if (!delivery) return null
      const [sender, recipients] = await Promise.all([currentUser(), app().repository.adminEmails()])
      const email = feedbackEmail(data, sender)
      await Promise.all(recipients.map((to) => delivery.send({ to, ...email })))
      return null
    }),
  )

/**
 * Proves to PostHog Support that this browser belongs to the signed-in account, so its feedback conversations follow
 * the player to every device; null for a guest or where this instance has no support secret.
 */
export const supportIdentity = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() =>
    forSignedIn(null, (id) => {
      const secret = process.env.POSTHOG_SUPPORT_IDENTITY_SECRET
      return secret ? { distinctId: id, hash: createHmac('sha256', secret).update(id).digest('hex') } : null
    }),
  ),
)
