/**
 * Whether a change can affect a CI lane, so a ready pull request runs only the lanes and browser specs it can move.
 *
 * `node scripts/laneScope.ts <lane>` reads BASE_SHA and HEAD_SHA and writes `needed=true|false` to GITHUB_OUTPUT, and
 * for `e2e` also `specs`: `all`, or the spec files to run. A lane depends on the repository files its entries import and
 * on inputs it reads from disk; anything else cannot change its result. Any other event runs every lane in full.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { testFile } from './lib/compilerSources.ts'
import { isEntryPoint } from './lib/entryPoint.ts'
import { changedFiles } from './lib/git.ts'
import { importClosures } from './lib/moduleGraph.ts'
import { stepOutput } from './lib/stepOutput.ts'

/** Dependencies, the toolchain and CI itself, which every lane reads. */
const everything = [
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|mise\.toml|tsconfig\.json)$/,
  /^\.github\/(?:workflows\/ci(?:-[a-z]+)?\.yml|actions\/)/,
]
const catalogueData = /^catalogue(?:\.json|\/)/
// The browser stack reads these by path or through tools other than the bundler: route files, styles, the database module, migrations, bundled skills.
const browserInputs = [/^(?:src|e2e|public|spacetimedb|drizzle-auth|plugin\/skills)\//, /^CHANGELOG\.md$/, catalogueData]

const lanes = {
  coverage: {
    entries: () => ['scripts/catalogueCoverage.ts', 'scripts/parallelCatalogueCoverage.ts', 'scripts/compareCatalogueCoverage.ts'],
    inputs: [catalogueData],
  },
  points: {
    entries: () => [
      'scripts/checkDescriptions.ts',
      'scripts/checkPoints.ts',
      'scripts/checkRestrictions.ts',
      'scripts/checkJoins.ts',
      'scripts/checkVsDataCoverage.ts',
    ],
    inputs: [catalogueData],
  },
  e2e: {
    // Every application file is an entry, since only some are reached through imports, plus what the build and the test stack run.
    entries: () => [
      ...execFileSync('git', ['ls-files', 'src', 'e2e'], { encoding: 'utf8' })
        .split('\n')
        .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts') && !testFile.test(file)),
      'playwright.config.ts',
      'vite.config.ts',
      'vite.seed.config.ts',
      'scripts/seedPreview.ts',
      'scripts/catalogueRefresh.ts',
      'scripts/compileCatalogueRuntime.ts',
      'scripts/browserTestBuild.ts',
      'scripts/e2eShard.ts',
    ],
    inputs: browserInputs,
  },
}
export type Lane = keyof typeof lanes

const affects = (lane: Lane, file: string, reached: ReadonlySet<string>) =>
  reached.has(file) ||
  everything.some((pattern) => pattern.test(file)) ||
  (!testFile.test(file) && lanes[lane].inputs.some((pattern) => pattern.test(file)))

export function laneNeeded(lane: Lane, files: readonly string[], reached: ReadonlySet<string>) {
  return files.some((file) => affects(lane, file, reached))
}

/** Specs to run for a change: those of the specs it edits, the client features it changes, or its catalogue data. */
export type Selection = { anyFeature: string[]; catalogue: string[]; features: Record<string, string[] | 'all'> }

const featureOf = (file: string) => /^src\/client\/features\/([^/]+)\//.exec(file)?.[1]

/** The client features a feature file reaches through imports, or `all` when code outside them imports it; routes only mount features. */
function featuresReaching(file: string, closures: ReadonlyMap<string, readonly string[]>): Set<string> | 'all' {
  const features = new Set([featureOf(file)!])
  for (const [entry, closure] of closures) {
    if (entry === file || entry.startsWith('src/routes/') || !closure.includes(file)) continue
    const feature = featureOf(entry)
    if (!feature) return 'all'
    features.add(feature)
  }
  return features
}

export function browserSpecs(
  files: readonly string[],
  closures: ReadonlyMap<string, readonly string[]>,
  selection: Selection,
): string[] | 'all' {
  const reached = new Set([...closures.values()].flat())
  const specs = new Set<string>()
  for (const file of files.filter((changed) => affects('e2e', changed, reached))) {
    if (everything.some((pattern) => pattern.test(file))) return 'all'
    const spec = /^e2e\/([^/]+\.spec\.ts)(?:-snapshots\/|$)/.exec(file)?.[1]
    if (spec) {
      specs.add(spec)
    } else if (featureOf(file)) {
      const features = featuresReaching(file, closures)
      if (features === 'all') return 'all'
      for (const feature of features) {
        const listed = selection.features[feature]
        if (listed === undefined || listed === 'all') return 'all'
        for (const name of [...listed, ...selection.anyFeature]) specs.add(name)
      }
    } else if (catalogueData.test(file)) {
      for (const name of selection.catalogue) specs.add(name)
    } else {
      return 'all'
    }
  }
  return [...specs].toSorted()
}

if (isEntryPoint(import.meta.url)) {
  const lane = process.argv[2] as Lane
  if (!(lane in lanes)) throw new Error(`usage: laneScope.ts <${Object.keys(lanes).join('|')}>`)
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
    stepOutput(lane === 'e2e' ? { needed: true, specs: 'all' } : { needed: true })
  } else {
    const { BASE_SHA: base, HEAD_SHA: head } = process.env
    if (!base || !head) throw new Error('lane scope requires BASE_SHA and HEAD_SHA')
    const files = changedFiles(base, head)
    const closures = await importClosures(process.cwd(), [...lanes[lane].entries(), 'scripts/laneScope.ts'])
    if (lane === 'e2e') {
      const specs = browserSpecs(files, closures, JSON.parse(fs.readFileSync('e2e/selection.json', 'utf8')) as Selection)
      stepOutput({ needed: specs.length > 0, specs: specs === 'all' ? 'all' : specs.map((spec) => `e2e/${spec}`).join(' ') })
    } else {
      stepOutput({ needed: laneNeeded(lane, files, new Set([...closures.values()].flat())) })
    }
  }
}
