import { globalSingleton } from 'ras-stack/server'
import { postHogEnvironment } from 'ras-stack/posthog'
import { createPostHogServerClient } from 'ras-stack/posthog/server'

export const serverPostHog = () =>
  globalSingleton('praetorium.posthog', () =>
    createPostHogServerClient(
      postHogEnvironment({ projectToken: process.env.VITE_POSTHOG_PROJECT_TOKEN, host: process.env.VITE_POSTHOG_HOST }),
    ),
  )
