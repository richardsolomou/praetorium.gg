import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { importAuthSqlite, migrateAuthSqlite } from './nodeAuthSqlite'

/**
 * The built server's live heap and resident memory after startup and after a player opens each kind of reference page,
 * as a container runs it: production mode, the live catalogue a refresh prepared, and the heap a 2 GiB container gives
 * Node. `--budget <MiB>` fails the run when the live heap after any page exceeds it, so a change that grows what the
 * server holds is caught before a deploy. It borrows `just dev`'s SpacetimeDB, which reading the reference barely touches.
 *
 *   pnpm build
 *   CATALOGUE_LIVE_DIR=<root> CATALOGUE_COMPILER=<key> CATALOGUE_AUTHORING=<key> node .output/server/catalogue-refresh.mjs --baseline
 *   pnpm exec tsx scripts/measureServingMemory.ts --live <root> [--build .output] [--budget 600]
 */
const { values } = parseArgs({
  options: {
    build: { type: 'string', default: '.output' },
    live: { type: 'string' },
    budget: { type: 'string' },
    port: { type: 'string', default: '3917' },
  },
})
if (!values.live) throw new Error('expected --live <the live catalogue root a refresh prepared>')
const build = path.resolve(values.build)
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
const samples = path.join(work, 'memory.jsonl')
// Collected first, so the numbers are what the server holds rather than garbage it has yet to free.
const sampler = path.join(work, 'sampler.cjs')
fs.writeFileSync(
  sampler,
  `const fs = require('node:fs')
setInterval(() => {
  globalThis.gc?.()
  const { heapUsed, rss } = process.memoryUsage()
  fs.appendFileSync(${JSON.stringify(samples)}, JSON.stringify({ heapUsed, rss }) + '\\n')
}, 1000).unref()
`,
)
// An empty accounts database, as a new container starts with.
const auth = path.join(work, 'auth.sqlite')
await importAuthSqlite(path.resolve('drizzle-auth/0000_curly_gambit.sql'), auth)
migrateAuthSqlite(auth)

const { CATALOGUE_DIR: _, ...environment } = process.env
const server = spawn(process.execPath, [path.join(build, 'server/index.mjs')], {
  env: {
    ...environment,
    NODE_ENV: 'production',
    NODE_OPTIONS: `--max-old-space-size=1024 --expose-gc --require ${sampler}`,
    NITRO_PORT: String(port),
    NITRO_HOST: '127.0.0.1',
    APP_URL: origin,
    DATA_DIR: path.join(work, 'data'),
    AUTH_SQLITE_PATH: auth,
    AUTH_SECRET: credentials.authSecret,
    CATALOGUE_RUNTIME_FETCH: 'true',
    CATALOGUE_LIVE_DIR: path.resolve(values.live),
    CATALOGUE_UPDATE_MODE: 'off',
    SPACETIME_URL: `http://127.0.0.1:${stack.spacetimePort}`,
    SPACETIME_DATABASE: stack.database,
    SPACETIME_AUDIENCE: stack.database,
    SPACETIME_OPERATOR_TOKEN: credentials.operator.token,
  },
  stdio: ['ignore', 'ignore', 'inherit'],
})
const exited = new Promise<number | null>((resolve) => server.once('exit', resolve))

const latest = () => {
  const lines = fs.existsSync(samples) ? fs.readFileSync(samples, 'utf8').trim().split('\n') : []
  return lines.length ? (JSON.parse(lines.at(-1)!) as { heapUsed: number; rss: number }) : null
}
const mib = (bytes: number) => Math.round(bytes / 1024 / 1024)
const rows: { step: string; heap: number; rss: number }[] = []
const record = async (step: string) => {
  await delay(3_000)
  if (server.exitCode !== null) throw new Error(`the server exited with ${server.exitCode} after ${rows.at(-1)?.step ?? 'starting'}`)
  const sample = latest()
  if (!sample) throw new Error('the server recorded no memory sample')
  rows.push({ step, heap: mib(sample.heapUsed), rss: mib(sample.rss) })
}

try {
  // Health also asks for the accounts database's backups, which this server has none of.
  for (let ready = false; !ready;) {
    if (server.exitCode !== null) throw new Error(`the server exited with ${server.exitCode}`)
    ready = await fetch(`${origin}/rules`)
      .then((response) => response.ok)
      .catch(() => false)
    if (!ready) await delay(500)
  }
  await record('startup')
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
  const peak = Math.max(...rows.map((row) => row.heap))
  if (budget !== null && peak > budget) {
    console.error(`Live heap reached ${peak} MiB, over the ${budget} MiB budget`)
    process.exitCode = 1
  }
} finally {
  if (rows.length) console.table(rows)
  server.kill('SIGTERM')
  await Promise.race([exited, delay(10_000)])
  fs.rmSync(work, { recursive: true, force: true })
}
