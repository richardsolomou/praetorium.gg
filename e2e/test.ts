import { test as base, type Page, type Response } from '@playwright/test'

/**
 * Resolves a page load once the app has hydrated, as `AppShell` marks the document,
 * because a click before hydration reaches no handler and the test then waits out its timeout.
 * A load that asks to stop at `commit` or `domcontentloaded` gets the server's frame instead.
 * A resize resolves once its media queries apply, a frame later, so a measurement reads the new layout.
 */
function awaitSettled(page: Page) {
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
  const setViewportSize = page.setViewportSize.bind(page)
  page.setViewportSize = async (size) => {
    await setViewportSize(size)
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  }
}

export const roundSummary = (page: Page) => page.locator('[data-round-summary]')

/**
 * A battle covers itself with its scores whenever a round ends, which would stand in front of every
 * spec that plays across one. Each battle reads as having had every summary seen, unless a spec sets
 * `showRoundSummaries` on the page's window first, as one about the summary does.
 */
const SEEN_ROUND_SUMMARIES = `(() => {
  const getItem = Storage.prototype.getItem
  Storage.prototype.getItem = function (key) {
    if (!window.showRoundSummaries && typeof key === 'string' && key.startsWith('praetorium.round-summary.'))
      return '{"round":99,"finished":true}'
    return getItem.call(this, key)
  }
})()`

export const test = base.extend<{ closeOpenedContexts: void }>({
  /** Closes the contexts a test opens with `browser.newContext()`; Playwright closes only those its fixtures create. */
  closeOpenedContexts: [
    async ({ browser }, use) => {
      const existing = new Set(browser.contexts())
      const newContext = browser.newContext.bind(browser)
      browser.newContext = async (options) => {
        const context = await newContext(options)
        if (options?.javaScriptEnabled !== false) context.on('page', awaitSettled)
        await context.addInitScript({ content: SEEN_ROUND_SUMMARIES })
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
