import fs from 'node:fs'
import path from 'node:path'
import { test as base, type BrowserContext, type Page, type Response } from '@playwright/test'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { retainedSnapshots, upstreamUrl } from '../src/server/sourceTexts'
import { catalogue, inspectPort, processCoverage, root as stackRoot } from './stackEnv'

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

const replaced = new WeakMap<BrowserContext, Map<string, string>>()

/** Serves `body` in place of the upstream file whose address ends with `suffix`, for this context only. */
export function replaceUpstreamFile(context: BrowserContext, suffix: string, body: string) {
  const files = replaced.get(context) ?? new Map<string, string>()
  files.set(suffix, body)
  replaced.set(context, files)
}

/**
 * Rules text loads from GitHub in a reader's browser; here it is answered from the snapshot it
 * was verified into, so no test reaches GitHub. A string Praetorium corrected differs from
 * upstream either way, and the browser shows it as unavailable as it would in production.
 *
 * The page's `fetch` asks a binding rather than the network being routed: any Playwright
 * route intercepts every request in the context and turns its HTTP cache off, which slows
 * every page load enough for tests to act before the app hydrates.
 */
async function serveRulesText(context: BrowserContext) {
  await context.exposeBinding('__praetoriumUpstreamFile', (_source, url: string) => {
    for (const [suffix, body] of replaced.get(context) ?? []) if (url.endsWith(suffix)) return body
    const file = upstreamFiles().get(url)
    return file ? fs.readFileSync(file, 'utf8') : null
  })
  await context.addInitScript(() => {
    const github = 'https://raw.githubusercontent.com/'
    const read = (window as unknown as { __praetoriumUpstreamFile: (url: string) => Promise<string | null> }).__praetoriumUpstreamFile
    const network = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!url.startsWith(github)) return network(input, init)
      const body = await read(new URL(url).href)
      return body === null ? new Response(null, { status: 404 }) : new Response(body, { headers: { 'Content-Type': 'text/plain' } })
    }
    // Chosen once per browser context, so a test that turns a source off keeps that choice.
    if (localStorage.getItem('praetorium-e2e-rules-text') === null) {
      localStorage.setItem('praetorium-e2e-rules-text', 'set')
      localStorage.setItem('praetorium-text-sources', 'bsdata,game-datacards')
    }
  })
}

/** Starts a context where a new device starts, undecided about its sources; a choice made later is kept. */
export const startUnchosen = (context: BrowserContext) =>
  context.addInitScript(() => {
    if (localStorage.getItem('praetorium-e2e-rules-text-unchosen') !== null) return
    localStorage.setItem('praetorium-e2e-rules-text-unchosen', 'set')
    localStorage.removeItem('praetorium-text-sources')
  })

/** Where a coverage run writes each test's executed functions; unset in every ordinary run. */
const coverageDirectory = process.env.E2E_COVERAGE_DIR
const coveredPages = new Set<Page>()

/**
 * Starts coverage before a page's first navigation, so its first scripts are counted. A context
 * without JavaScript runs no scripts to count, and Chromium refuses to start coverage in it.
 */
const coveredContexts = new WeakSet<BrowserContext>()
function coverNewPages(context: BrowserContext, javaScriptEnabled = true) {
  // The default context passes through both the context fixture and the wrapped `newContext`.
  if (!coverageDirectory || !javaScriptEnabled || coveredContexts.has(context)) return
  coveredContexts.add(context)
  const newPage = context.newPage.bind(context)
  context.newPage = async () => {
    const page = await newPage()
    await page.coverage.startJSCoverage({ resetOnNavigation: false })
    coveredPages.add(page)
    const close = page.close.bind(page)
    page.close = async (options) => {
      await collectPage(page)
      return close(options)
    }
    return page
  }
}

type ExecutedFunction = { url: string; start: number; end: number }
type CoverageResult = { url: string; functions: { ranges: { startOffset: number; endOffset: number; count: number }[] }[] }[]
const executed: ExecutedFunction[] = []
const executedFunctions = (result: CoverageResult) =>
  result.flatMap(({ url, functions }) =>
    functions.flatMap(({ ranges: [range] }) => (range && range.count > 0 ? [{ url, start: range.startOffset, end: range.endOffset }] : [])),
  )

/** Asks the app server's inspector for precise coverage; each read resets the counts, so it covers one test. */
let inspector: Promise<(method: string, params?: object) => Promise<{ result?: CoverageResult }>> | undefined
function serverCoverage() {
  inspector ??= (async () => {
    const targets: { webSocketDebuggerUrl: string }[] = await (await fetch(`http://127.0.0.1:${inspectPort}/json/list`)).json()
    const socket = new WebSocket(targets[0].webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.onopen = resolve
      socket.onerror = reject
    })
    let id = 0
    const pending = new Map<number, (message: { result?: unknown; error?: { message: string } }) => void>()
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { id: number; result?: unknown; error?: { message: string } }
      pending.get(message.id)?.(message)
      pending.delete(message.id)
    }
    const send = (method: string, params = {}) =>
      new Promise<{ result?: CoverageResult }>((resolve, reject) => {
        id += 1
        pending.set(id, (message) =>
          message.error ? reject(new Error(message.error.message)) : resolve(message.result as { result?: CoverageResult }),
        )
        socket.send(JSON.stringify({ id, method, params }))
      })
    // Startup ran before any test, so it counts for every spec: `NODE_V8_COVERAGE` writes it now,
    // moved apart from the exit coverage `scripts/e2eMap.ts` skips, and the counts start over.
    const written = (await send('Runtime.evaluate', { expression: "process.getBuiltinModule('node:v8').takeCoverage()" })) as unknown as {
      exceptionDetails?: unknown
    }
    if (written.exceptionDetails || !processCoverage) throw new Error('the app server did not write its startup coverage')
    fs.mkdirSync(path.join(processCoverage, 'startup'), { recursive: true })
    for (const file of fs.readdirSync(path.join(processCoverage, 'server')))
      if (file.endsWith('-0.json')) fs.renameSync(path.join(processCoverage, 'server', file), path.join(processCoverage, 'startup', file))
    await send('Profiler.enable')
    await send('Profiler.startPreciseCoverage', { callCount: true, detailed: false })
    return send
  })()
  return inspector
}
async function collectPage(page: Page) {
  if (!coveredPages.delete(page) || page.isClosed()) return
  executed.push(...executedFunctions(await page.coverage.stopJSCoverage()))
}

export const test = base.extend<{ closeOpenedContexts: void; recordCoverage: void; rulesText: boolean }, { stopCombatWorkers: void }>({
  /**
   * Worker threads write their coverage only when they exit, and the stack may be killed before
   * the server stops its own, so a coverage run stops them once this worker's tests are done.
   */
  stopCombatWorkers: [
    // Playwright reads a fixture's dependencies from this pattern, and this one has none.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use()
      const server = coverageDirectory && inspectPort ? await serverCoverage() : null
      const stopped = (await server?.('Runtime.evaluate', {
        expression: "globalThis[Symbol.for('ras-stack.server.singletons')]?.get('praetorium.combatCalculationPool')?.value.close()",
        awaitPromise: true,
      })) as unknown as { exceptionDetails?: unknown } | undefined
      if (stopped?.exceptionDetails) throw new Error('the app server could not stop its combat workers')
    },
    { scope: 'worker', auto: true },
  ],
  /** Whether the reader has chosen to load rules text; specs about the unloaded state turn it off. */
  rulesText: [true, { option: true }],
  context: async ({ context, javaScriptEnabled, rulesText }, use) => {
    // Playwright opens this context through `browser.newContext`, which attaches the wait before this option is known.
    context.off('page', awaitHydration)
    if (javaScriptEnabled) context.on('page', awaitHydration)
    if (!rulesText) await startUnchosen(context)
    coverNewPages(context, javaScriptEnabled)
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
        coverNewPages(context, options?.javaScriptEnabled !== false)
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
  /** Writes the browser functions this test executed, for the map that picks which specs a change needs. */
  recordCoverage: [
    // Depending on the context fixtures tears this down first, while every page is still open.
    async ({ context: _context, closeOpenedContexts: _contexts }, use, testInfo) => {
      const server = coverageDirectory && inspectPort ? await serverCoverage() : null
      await server?.('Profiler.takePreciseCoverage')
      // The SpacetimeDB module's calls are logged with their time, so the test's window claims them.
      const started = Date.now()
      await use()
      const ended = Date.now()
      if (!coverageDirectory) return
      await Promise.all([...coveredPages].map(collectPage))
      const spec = path.relative(process.cwd(), testInfo.file)
      const serverExecuted = server ? executedFunctions((await server('Profiler.takePreciseCoverage')).result ?? []) : []
      fs.mkdirSync(coverageDirectory, { recursive: true })
      fs.writeFileSync(
        path.join(coverageDirectory, `${testInfo.testId}.json`),
        JSON.stringify({
          spec,
          title: testInfo.title,
          stack: path.basename(stackRoot),
          started,
          ended,
          client: executed,
          server: serverExecuted.filter(({ url }) => url.includes('/server/')),
        }),
      )
      executed.length = 0
    },
    { auto: true },
  ],
})

export { devices, expect } from '@playwright/test'
export type { Browser, Locator, Page } from '@playwright/test'
