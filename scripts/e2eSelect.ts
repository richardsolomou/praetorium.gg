/**
 * Chooses the end-to-end specs a pull request needs from the latest coverage map.
 *
 * Reads BASE_SHA, HEAD_SHA and E2E_MAP (a path, possibly missing) and writes `specs`, either
 * `all` or a JSON array of spec files, and `reason` to GITHUB_OUTPUT. Without a usable map, or
 * when the map's revision is not part of the base's history, every spec runs.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import type { E2eMap } from './lib/e2eMap.ts'
import { changedHunks, lineMoves, selectSpecs, type Selection } from './lib/e2eSelection.ts'

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256_000_000 })

function selection(): Selection {
  const { BASE_SHA: base, HEAD_SHA: head, E2E_MAP: mapFile } = process.env
  if (!base || !head) throw new Error('selection requires BASE_SHA and HEAD_SHA')
  if (!mapFile || !existsSync(mapFile)) return { all: true, reason: 'no coverage map is available' }
  const map = JSON.parse(readFileSync(mapFile, 'utf8')) as E2eMap
  // `base...head` numbers its old lines from the merge base, so every comparison starts there.
  const fork = git('merge-base', base, head).trim()
  try {
    git('merge-base', '--is-ancestor', map.revision, fork)
  } catch {
    return { all: true, reason: `the map's revision ${map.revision} is not in the base's history` }
  }
  const show = (revision: string, file: string) => {
    try {
      return git('show', `${revision}:${file}`)
    } catch {
      return null
    }
  }
  const moves = lineMoves(git('diff', '--unified=0', '--no-renames', '--no-color', map.revision, fork))
  const changes = changedHunks(git('diff', '--unified=0', '--no-renames', '--no-color', fork, head))
  const chosen = selectSpecs(map, changes, moves, (file) => ({ base: show(fork, file), head: show(head, file) }))
  // A spec the map remembers may have been deleted since.
  return chosen.all ? chosen : { all: false, specs: chosen.specs.filter((spec) => existsSync(spec)) }
}

const chosen = selection()
const specs = chosen.all ? 'all' : JSON.stringify(chosen.specs)
const reason = chosen.all ? chosen.reason : `${chosen.specs.length} specs exercise the changed code`
const output = `specs=${specs}\nreason=${reason}\n`
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output)
else process.stdout.write(output)
