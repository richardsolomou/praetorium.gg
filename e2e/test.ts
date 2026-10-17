import fs from 'node:fs'
import path from 'node:path'
import { test as base, type BrowserContext, type Page, type Response } from '@playwright/test'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { retainedSnapshots, upstreamUrl } from '../src/server/sourceTexts'
import { catalogue } from './stackEnv'

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

/** Each upstream file the snapshot was built from, by the address a reader's browser loads it at. */
let upstream: Map<string, string> | undefined
function upstreamFiles() {
  if (upstream) return upstream
  const root = fs.realpathSync(catalogue)
  const composition = readCatalogueComposition(root)
  upstream = new Map()
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`
      if (entry.isDirectory()) visit(file)
      else if (entry.name.endsWith('.json')) {
        // Keyed as the browser requests it: BSData file names have spaces, which it sends encoded.
        const url = upstreamUrl(file, composition, retainedSnapshots(root))
        if (url && !upstream!.has(new URL(url).href)) upstream!.set(new URL(url).href, path.join(root, file))
      }
    }
  }
  const editions = fs.existsSync(path.join(root, 'editions')) ? fs.readdirSync(path.join(root, 'editions')) : []
  for (const prefix of ['', ...editions.map((edition) => `editions/${edition}/`)])
    for (const source of ['definitions', 'datacards']) if (fs.existsSync(path.join(root, prefix, source))) visit(`${prefix}${source}`)
  return upstream
}

/**
 * Rules text loads from GitHub in a reader's browser; here it is served from the snapshot it
 * was verified into, so no test reaches GitHub. A string Praetorium corrected differs from
 * upstream either way, and the browser shows it as unavailable as it would in production.
 */
async function serveRulesText(context: BrowserContext) {
  await context.route('https://raw.githubusercontent.com/**', (route) => {
    const file = upstreamFiles().get(route.request().url())
    return file ? route.fulfill({ path: file, contentType: 'text/plain' }) : route.fulfill({ status: 404 })
  })
  await context.addInitScript(() => {
    // Chosen once per browser context, so a test that stops loading rules text keeps that choice.
    if (localStorage.getItem('praetorium-e2e-rules-text') === null) {
      localStorage.setItem('praetorium-e2e-rules-text', 'set')
      localStorage.setItem('praetorium-rules-text', 'game-datacards')
    }
  })
}

/** Starts a context where a reader who has not chosen to load rules text starts; a choice made later is kept. */
const startUnchosen = (context: BrowserContext) =>
  context.addInitScript(() => {
    if (localStorage.getItem('praetorium-e2e-rules-text-unchosen') !== null) return
    localStorage.setItem('praetorium-e2e-rules-text-unchosen', 'set')
    localStorage.removeItem('praetorium-rules-text')
  })

export const test = base.extend<{ closeOpenedContexts: void; rulesText: boolean }>({
  /** Whether the reader has chosen to load rules text; specs about the unloaded state turn it off. */
  rulesText: [true, { option: true }],
  context: async ({ context, javaScriptEnabled, rulesText }, use) => {
    // Playwright opens this context through `browser.newContext`, which attaches the wait before this option is known.
    context.off('page', awaitHydration)
    if (javaScriptEnabled) context.on('page', awaitHydration)
    if (!rulesText) await startUnchosen(context)
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
        await serveRulesText(context)
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
