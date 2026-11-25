import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'

/**
 * The application server's live heap and resident memory once it reports ready and after a player opens each kind of
 * reference page, started as a preview container starts it: `scripts/nodeServer.ts` in production mode, seeding the
 * preview, preparing its live catalogue from a published snapshot (`--snapshot`, standing in for the snapshot store),
 * and with the heap a preview's container gives Node (`--heap`, in MiB, which a 3 GiB preview sets to 2048). `--budget <MiB>` fails the run when the live heap at any step exceeds
 * it, so a change that grows what the server holds is caught before a deploy. It borrows `just dev`'s SpacetimeDB.
 *
 *   pnpm build && pnpm exec tsx scripts/measureServingMemory.ts --snapshot catalogue-data [--checkout .] [--heap 2048] [--budget 1500]
 */
const { values } = parseArgs({
  options: {
    checkout: { type: 'string', default: '.' },
    snapshot: { type: 'string' },
    budget: { type: 'string' },
    port: { type: 'string', default: '3917' },
    heap: { type: 'string', default: '2048' },
  },
})
if (!values.snapshot) throw new Error('expected --snapshot <a materialized catalogue snapshot>')
const checkout = path.resolve(values.checkout)
const port = Number(values.port)
const origin = `http://127.0.0.1:${port}`
const stack = JSON.parse(fs.readFileSync('data-dev/active-preview.json', 'utf8')) as {
  spacetimePort: number
  database: string
  dataDir: string
}
const credentials = JSON.parse(fs.readFileSync(path.join(stack.dataDir, 'credentials.json'), 'utf8')) as {
  operator: { token: string }
  authSecret: string
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-serving-memory-'))
const data = path.join(work, 'data')
fs.mkdirSync(data)
// Every Node process the server starts samples itself; collected first, so the numbers are what it holds.
const samples = path.join(work, 'samples')
fs.mkdirSync(samples)
const sampler = path.join(work, 'sampler.cjs')
fs.writeFileSync(
  sampler,
  `const fs = require('node:fs')
const file = ${JSON.stringify(samples)} + '/' + process.pid + '.jsonl'
fs.writeFileSync(file, JSON.stringify({ script: process.argv[1] }) + '\\n')
setInterval(() => {
  globalThis.gc?.()
  const { heapUsed, rss } = process.memoryUsage()
  fs.appendFileSync(file, JSON.stringify({ heapUsed, rss }) + '\\n')
}, 1000).unref()
`,
)

const { CATALOGUE_DIR: _, R2_ACCESS_KEY_ID: _key, R2_SECRET_ACCESS_KEY: _secret, ...environment } = process.env
// A preview's refresh fetches the snapshot's prepared outputs from the store in seconds; this prepares them first,
// without the heap limit, so the limit falls on the application alone, as it does in a preview.
const { key, authoring } = JSON.parse(fs.readFileSync(path.join(checkout, '.output/server/catalogue-compiler.json'), 'utf8')) as {
  key: string
  authoring: string
}
const live = path.join(data, 'catalogues', key)
fs.mkdirSync(live, { recursive: true })
await new Promise<void>((resolve, reject) =>
  spawn(process.execPath, ['.output/server/catalogue-refresh.mjs', '--baseline'], {
    cwd: checkout,
    env: {
      ...environment,
      CATALOGUE_LIVE_DIR: live,
      CATALOGUE_COMPILER: key,
      CATALOGUE_AUTHORING: authoring,
      CATALOGUE_DIR: path.resolve(values.snapshot!),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  }).once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`the catalogue refresh exited with ${code}`)))),
)

const server = spawn(process.execPath, ['scripts/nodeServer.ts'], {
  cwd: checkout,
  env: {
    ...environment,
    NODE_ENV: 'production',
    NODE_OPTIONS: `--max-old-space-size=${Number(values.heap)} --expose-gc --require ${sampler}`,
    PORT: String(port),
    NODE_INTERNAL_PORT: String(port + 1),
    APP_URL: origin,
    DATA_DIR: data,
    AUTH_SQLITE_PATH: path.join(data, 'auth.sqlite'),
    AUTH_INITIALIZE_EMPTY: 'true',
    PRAETORIUM_SEED_PREVIEW: 'true',
    AUTH_SECRET: credentials.authSecret,
    CATALOGUE_RUNTIME_FETCH: 'true',
    CATALOGUE_DIR: path.resolve(values.snapshot),
    CATALOGUE_UPDATE_MODE: 'off',
    SPACETIME_URL: `http://127.0.0.1:${stack.spacetimePort}`,
    SPACETIME_DATABASE: stack.database,
    SPACETIME_AUDIENCE: stack.database,
    SPACETIME_OPERATOR_TOKEN: credentials.operator.token,
  },
  stdio: ['ignore', 'ignore', 'inherit'],
})
const exited = new Promise<number | null>((resolve) => server.once('exit', resolve))

/** The application process's latest sample, and the most it has held so far. */
const application = () => {
  for (const name of fs.readdirSync(samples)) {
    const lines = fs.readFileSync(path.join(samples, name), 'utf8').trim().split('\n')
    if (!(JSON.parse(lines[0]!) as { script?: string }).script?.endsWith('server/index.mjs')) continue
    const taken = lines.slice(1).map((line) => JSON.parse(line) as { heapUsed: number; rss: number })
    if (taken.length) return { latest: taken.at(-1)!, peak: Math.max(...taken.map((sample) => sample.heapUsed)) }
  }
  return null
}
const mib = (bytes: number) => Math.round(bytes / 1024 / 1024)
const rows: { step: string; heap: number; peakHeap: number; rss: number }[] = []
const record = async (step: string) => {
  await delay(3_000)
  if (server.exitCode !== null) throw new Error(`the server exited with ${server.exitCode} after ${rows.at(-1)?.step ?? 'starting'}`)
  const sampled = application()
  if (!sampled) throw new Error('the application recorded no memory sample')
  rows.push({ step, heap: mib(sampled.latest.heapUsed), peakHeap: mib(sampled.peak), rss: mib(sampled.latest.rss) })
}

try {
  const started = performance.now()
  for (let ready = false; !ready;) {
    if (server.exitCode !== null) throw new Error(`the server exited with ${server.exitCode} before it was ready`)
    ready = await fetch(`${origin}/api/health`)
      .then((response) => response.ok)
      .catch(() => false)
    if (!ready) await delay(1_000)
  }
  await record(`ready after ${Math.round((performance.now() - started) / 1_000)}s`)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    for (const [step, address] of [
      ['faction page', '/factions/necrons'],
      ['detachment page', '/factions/necrons/detachments/pantheon-of-woe'],
      ['datasheet', '/factions/necrons/datasheets/immortals'],
      ['rules page', '/rules/core-rules/moving'],
    ] as const) {
      await page.goto(`${origin}${address}`)
      await page.waitForLoadState('networkidle')
      await record(step)
    }
  } finally {
    await browser.close()
  }
  const budget = values.budget === undefined ? null : Number(values.budget)
  const peak = Math.max(...rows.map((row) => row.peakHeap))
  if (budget !== null && peak > budget) {
    console.error(`Live heap reached ${peak} MiB, over the ${budget} MiB budget`)
    process.exitCode = 1
  }
} finally {
  if (rows.length) console.table(rows)
  const sampled = application()
  if (sampled) console.log(`application peak live heap: ${mib(sampled.peak)} MiB`)
  server.kill('SIGTERM')
  await Promise.race([exited, delay(15_000)])
  fs.rmSync(work, { recursive: true, force: true })
}
