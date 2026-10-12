import { test as base } from '@playwright/test'

/** Closes the contexts a test opens with `browser.newContext()`; Playwright closes only those its fixtures create. */
export const test = base.extend<{ closeOpenedContexts: void }>({
  closeOpenedContexts: [
    async ({ browser }, use) => {
      const existing = new Set(browser.contexts())
      await use()
      await Promise.all(
        browser
          .contexts()
          .filter((context) => !existing.has(context))
          .map((context) => context.close()),
      )
    },
    { auto: true },
  ],
})

export { devices, expect } from '@playwright/test'
export type { Browser, Locator, Page } from '@playwright/test'
