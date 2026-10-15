import { test as base, type Page, type Response } from '@playwright/test'

/**
 * Resolves a page load once the app has hydrated, as `AppShell` marks the document,
 * because a click before hydration reaches no handler and the test then waits out its timeout.
 * A load that asks to stop at `commit` or `domcontentloaded` gets the server's frame instead.
 */
function awaitHydration(page: Page) {
  const hydrated = async (response: Response | null) => {
    if (response?.headers()['content-type']?.includes('text/html'))
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-hydrated'), null, { timeout: 30_000 })
    return response
  }
  const early = (waitUntil?: string) => waitUntil === 'commit' || waitUntil === 'domcontentloaded'
  const goto = page.goto.bind(page)
  const reload = page.reload.bind(page)
  page.goto = async (url, options) => {
    const response = await goto(url, options)
    return early(options?.waitUntil) ? response : hydrated(response)
  }
  page.reload = async (options) => {
    const response = await reload(options)
    return early(options?.waitUntil) ? response : hydrated(response)
  }
}

export const test = base.extend<{ closeOpenedContexts: void }>({
  context: async ({ context, javaScriptEnabled }, use) => {
    // Playwright opens this context through `browser.newContext`, which attaches the wait before this option is known.
    context.off('page', awaitHydration)
    if (javaScriptEnabled) context.on('page', awaitHydration)
    await use(context)
  },
  /** Closes the contexts a test opens with `browser.newContext()`; Playwright closes only those its fixtures create. */
  closeOpenedContexts: [
    async ({ browser }, use) => {
      const existing = new Set(browser.contexts())
      const newContext = browser.newContext.bind(browser)
      browser.newContext = async (options) => {
        const context = await newContext(options)
        if (options?.javaScriptEnabled !== false) context.on('page', awaitHydration)
        return context
      }
      await use()
      browser.newContext = newContext
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
