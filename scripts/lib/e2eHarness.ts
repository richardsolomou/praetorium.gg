import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { compilerEntries } from './compilerSources.ts'
import { importClosures } from './moduleGraph.ts'

/**
 * Where browser tests start processes from: the Playwright config, the app's build and its
 * plugins, the seed and worker build, the SpacetimeDB module, the catalogue compiler, and the
 * actions CI's browser jobs use.
 */
const roots = [
  'playwright.config.ts',
  'vite.config.ts',
  'vite.seed.config.ts',
  'spacetimedb/src/index.ts',
  '.github/actions',
  ...compilerEntries,
]
/**
 * Modules whose application source selection accounts for another way. Coverage records what the
 * seed, the combat workers, the server's startup plugins and the SpacetimeDB module (through
 * `scripts/lib/moduleCoverage.ts`) run; the build's catalogue fingerprint
 * covers the tools that compile the catalogue runtime and the offline reference; and the terrain
 * check only reads, so it can fail the build but not change what a test sees.
 */
const accountedEntries = [
  'scripts/seedPreview.ts',
  'spacetimedb/src/index.ts',
  'src/server/combatCalculation.worker.ts',
  'src/server/warmPlugin.ts',
  'src/server/cspPlugin.ts',
  ...compilerEntries,
  'scripts/catalogueRuntimeKey.ts',
  'scripts/lib/offlineReferenceCache.ts',
  'scripts/lib/checkoutReferenceKey.ts',
  'scripts/checkTerrain.ts',
]
const workflow = '.github/workflows/ci.yml'
// `changes` chooses the specs, so a change to how it scopes or selects needs every spec.
const browserJobs = ['changes', 'browser-build', 'e2e-shard']

const modulePath = /\b(?:scripts|src|e2e|spacetimedb)\/[\w./-]+\.(?:ts|tsx|mts|mjs)\b/g
const workflowPath = /\.github\/workflows\/[\w.-]+\.ya?ml\b/g
const pnpmScript = /\bpnpm (?:run )?([\w:-]+)/g
// Scripts spawn their siblings by bare file name, as in `path.join(import.meta.dirname, 'worker.ts')`.
const siblingPath = /['"`](?:\.\/)?([\w.-]+\.(?:ts|mts|mjs))['"`]/g

function* files(root: string, relative: string): Generator<string> {
  const target = path.join(root, relative)
  if (!fs.existsSync(target)) return
  if (fs.statSync(target).isDirectory()) for (const entry of fs.readdirSync(target)) yield* files(root, path.join(relative, entry))
  else yield relative
}

/**
 * Every repository file a browser-test run executes outside the processes coverage records:
 * everything the roots import, and every module or workflow that CI's browser jobs or a file
 * among them names by path or runs as a package script, followed until nothing new turns up.
 * Application source only `accounted` modules reach is left out; their other files stay.
 */
export async function harnessFiles(root = process.cwd(), accounted: readonly string[] = accountedEntries) {
  const everything = await reachedFiles(root, new Set())
  const reached = await reachedFiles(root, new Set(accounted))
  return [...new Set([...reached, ...everything.filter((file) => !file.startsWith('src/'))])].toSorted()
}

/** The harness traversal, neither following nor listing `stop`. */
async function reachedFiles(root: string, stop: ReadonlySet<string>) {
  const scripts = (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts
  const commands = (text: string, seen = new Set<string>()): string[] =>
    [...text.matchAll(pnpmScript)].flatMap(([, name]) => {
      const command = scripts[name!]
      if (command === undefined || seen.has(name!)) return []
      seen.add(name!)
      return [command, ...commands(command, seen)]
    })
  const jobs = (parse(fs.readFileSync(path.join(root, workflow), 'utf8')) as { jobs: Record<string, unknown> }).jobs
  const found = new Set([workflow])
  let pending = roots.flatMap((entry) => [...files(root, entry)]).filter((file) => !stop.has(file))
  let texts = browserJobs.map((job) => {
    if (!jobs[job]) throw new Error(`${workflow} has no ${job} job; update the browser jobs the harness reads`)
    return JSON.stringify(jobs[job])
  })
  while (pending.length > 0) {
    for (const file of pending) found.add(file)
    const modules = pending.filter((file) => /\.(?:ts|tsx|mts|mjs)$/.test(file))
    const reached = [...(await importClosures(root, modules, stop)).values()].flat().filter((file) => !found.has(file))
    for (const file of reached) found.add(file)
    const named = new Set<string>()
    // Package scripts count only when something runs them, so `package.json` itself is not read.
    const scanned = [...pending, ...reached].filter((file) => /\.(?:ts|tsx|mts|mjs|ya?ml)$/.test(file))
    const sources = [
      ...texts.map((text) => ({ text, directory: '' })),
      ...scanned.map((file) => ({ text: fs.readFileSync(path.join(root, file), 'utf8'), directory: path.dirname(file) })),
    ]
    for (const { text, directory } of sources) {
      const siblings = [...text.matchAll(siblingPath)].map(([, name]) => path.join(directory, name!))
      for (const source of [text, ...commands(text)])
        for (const [match] of [...source.matchAll(modulePath), ...source.matchAll(workflowPath)]) siblings.push(match)
      for (const match of siblings) if (!found.has(match) && !stop.has(match) && fs.existsSync(path.join(root, match))) named.add(match)
    }
    pending = [...named]
    texts = []
  }
  return [...found]
}
