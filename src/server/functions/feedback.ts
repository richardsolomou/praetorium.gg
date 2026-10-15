import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { feedbackScreenshotSchema } from '../../contracts/feedback'
import { storeFeedbackScreenshot } from '../feedbackScreenshots'
import { fixedWindowRateLimit } from '../rateLimit'
import { mutationRpc } from '../rpc'

const screenshotRateLimit = fixedWindowRateLimit('too many screenshot uploads')

export const uploadFeedbackScreenshot = createServerFn({ method: 'POST' })
  .validator(feedbackScreenshotSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const limited = screenshotRateLimit(getRequest(), 3)
      if (limited) throw limited
      return storeFeedbackScreenshot(data.image)
    }),
  )
