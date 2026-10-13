import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { realpath } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { abandonedTestStacks } from './lib/testStacks.ts'

const worktree = await realpath(process.cwd())
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/dev.ts', 'stop'], { stdio: 'inherit' })

/** Every process whose command line names the stack directory: its runner, server, SpacetimeDB and proxy. */
function processesOf(directory: string) {
  try {
    return execFileSync('pgrep', ['-f', directory], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map(Number)
      .filter((pid) => pid !== process.pid)
  } catch {
    return []
  }
}

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

for (const directory of abandonedTestStacks(worktree)) {
  const pids = processesOf(directory)
  for (const pid of pids) process.kill(pid, 'SIGTERM')
  const deadline = Date.now() + 10_000
  while (pids.some(alive) && Date.now() < deadline) await delay(200)
  for (const pid of pids.filter(alive)) process.kill(pid, 'SIGKILL')
  fs.rmSync(directory, { recursive: true, force: true })
  console.log(`Removed ${directory}${pids.length ? ` and stopped ${pids.length} process${pids.length === 1 ? '' : 'es'}` : ''}`)
}
console.log('Browser-test stacks cleared for this worktree')
