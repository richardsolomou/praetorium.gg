/**
 * Folds a coverage run's per-test records into the map that chooses which specs a change needs.
 *
 * `tsx scripts/e2eMap.ts <build-dir> <revision> <out.json> <coverage-dir>...` reads every record
 * that `E2E_COVERAGE_DIR` runs of `e2e/test.ts` wrote, maps executed code through the build's
 * source maps, adds which files each spec imports and the files every spec depends on that coverage
 * cannot see, and writes the map for `scripts/e2eSelect.ts`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildE2eMap, scriptReader, workerSources, type CoverageRecord } from './lib/e2eMap.ts'
import { harnessFiles } from './lib/e2eHarness.ts'
import { importClosures } from './lib/moduleGraph.ts'

const [buildDirectory, revision, output, ...directories] = process.argv.slice(2)
if (!buildDirectory || !revision || !output || directories.length === 0)
  throw new Error('usage: e2eMap.ts <build-dir> <revision> <out.json> <coverage-dir>...')

function* records() {
  for (const directory of directories)
    for (const file of fs.readdirSync(directory))
      if (file.endsWith('.json')) yield JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as CoverageRecord
}

const build = path.resolve(buildDirectory)
const whole = [...workerSources(build, process.cwd()), ...(await harnessFiles())]
const specs = fs.readdirSync('e2e').flatMap((file) => (file.endsWith('.spec.ts') ? [`e2e/${file}`] : []))
const map = buildE2eMap(
  records(),
  scriptReader(build, process.cwd()),
  process.cwd(),
  revision,
  whole,
  await importClosures(process.cwd(), specs),
)
if (map.specs.length === 0) throw new Error('the coverage run recorded no tests')
fs.writeFileSync(output, JSON.stringify(map))
console.log(`Mapped ${Object.keys(map.files).length} source files across ${map.specs.length} specs at ${revision}`)
