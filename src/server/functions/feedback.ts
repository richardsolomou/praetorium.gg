import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { feedbackEmailSchema, feedbackScreenshotSchema } from '../../contracts/feedback'
import { app } from '../app'
import { feedbackEmail } from '../feedbackEmail'
import { storeFeedbackScreenshot } from '../feedbackScreenshots'
import { currentUser } from '../playerSession'
import { fixedWindowRateLimit } from '../rateLimit'
import { mutationRpc } from '../rpc'

const screenshotRateLimit = fixedWindowRateLimit('too many screenshot uploads')
const emailRateLimit = fixedWindowRateLimit('too many feedback emails')

export const uploadFeedbackScreenshot = createServerFn({ method: 'POST' })
  .validator(feedbackScreenshotSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const limited = screenshotRateLimit(getRequest(), 3)
      if (limited) throw limited
      return storeFeedbackScreenshot(data.image)
    }),
  )

/** Emails every administrator a feedback response PostHog has already accepted; a no-op where this instance sends no email. */
export const emailFeedback = createServerFn({ method: 'POST' })
  .validator(feedbackEmailSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const limited = emailRateLimit(getRequest(), 5)
      if (limited) throw limited
      const delivery = app().email
      if (!delivery) return null
      const [sender, recipients] = await Promise.all([currentUser(), app().service.adminEmails()])
      const email = feedbackEmail(data, sender, process.env.APP_URL)
      await Promise.all(recipients.map((to) => delivery.send({ to, ...email })))
      return null
    }),
  )
