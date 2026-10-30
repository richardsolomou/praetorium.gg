/**
 * Chooses the end-to-end specs a pull request needs from the latest coverage map and the checked-out
 * head's import graph.
 *
 * Reads BASE_SHA, HEAD_SHA, E2E_MAP (a path, possibly missing) and the head's browser-test build in
 * `data-dev/e2e-build`, and writes `specs`, either `all` or a JSON array of spec files, and `reason`
 * to GITHUB_OUTPUT. Without a usable map, or when the map's revision is not part of the base's
 * history, every spec runs.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { harnessFiles } from './lib/e2eHarness.ts'
import { git, isAncestor } from './lib/git.ts'
import { stepOutput } from './lib/stepOutput.ts'
import { importClosures } from './lib/moduleGraph.ts'
import { builtCatalogue, type E2eMap } from './lib/e2eMap.ts'
import { changedHunks, lineMoves, selectSpecs, type Graph, type Selection } from './lib/e2eSelection.ts'

async function graph(): Promise<Graph> {
  // Playwright finds specs anywhere under `e2e/`.
  const specs = readdirSync('e2e', { recursive: true, encoding: 'utf8' }).flatMap((file) =>
    file.endsWith('.spec.ts') ? [`e2e/${file}`] : [],
  )
  const imports = new Map<string, string[]>()
  for (const [spec, closure] of await importClosures(process.cwd(), specs))
    for (const file of closure) imports.set(file, [...(imports.get(file) ?? []), spec])
  return { harness: new Set(await harnessFiles()), imports, catalogue: builtCatalogue('data-dev/e2e-build') }
}

async function selection(): Promise<Selection> {
  const { BASE_SHA: base, HEAD_SHA: head, E2E_MAP: mapFile } = process.env
  if (!base || !head) throw new Error('selection requires BASE_SHA and HEAD_SHA')
  if (!mapFile || !existsSync(mapFile)) return { all: true, reason: 'no coverage map is available' }
  const map = JSON.parse(readFileSync(mapFile, 'utf8')) as E2eMap
  // `base...head` numbers its old lines from the merge base, so every comparison starts there.
  const fork = git(process.cwd(), 'merge-base', base, head).trim()
  let mapInHistory = false
  try {
    mapInHistory = isAncestor(process.cwd(), map.revision, fork)
  } catch {
    // A revision this clone lacks is no more usable than one outside the base's history.
  }
  if (!mapInHistory) return { all: true, reason: `the map's revision ${map.revision} is not in the base's history` }
  const show = (revision: string, file: string) => {
    try {
      return git(process.cwd(), 'show', `${revision}:${file}`)
    } catch {
      return null
    }
  }
  const moves = lineMoves(git(process.cwd(), 'diff', '--unified=0', '--no-renames', '--no-color', map.revision, fork))
  const changes = changedHunks(git(process.cwd(), 'diff', '--unified=0', '--no-renames', '--no-color', fork, head))
  const chosen = selectSpecs(map, changes, moves, (file) => ({ base: show(fork, file), head: show(head, file) }), await graph())
  // A spec the map remembers may have been deleted since.
  return chosen.all ? chosen : { all: false, specs: chosen.specs.filter((spec) => existsSync(spec)) }
}

const chosen = await selection()
const specs = chosen.all ? 'all' : JSON.stringify(chosen.specs)
const reason = chosen.all ? chosen.reason : `${chosen.specs.length} specs exercise the changed code`
stepOutput({ specs, reason })
