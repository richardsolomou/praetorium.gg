import fs from 'node:fs'
import path from 'node:path'

/** The directory name of a browser-test stack under `/tmp`. */
export const TEST_STACK_NAME = /^praetorium-(e2e|native-auth-ios)-[a-zA-Z0-9-]+$/

/**
 * Browser-test stacks live under `/tmp` and symlink their owner's `node_modules`, so a stack whose
 * link names this worktree, or a worktree that no longer exists, is one of ours to take down.
 */
export function abandonedTestStacks(worktree: string, temporaryRoot = '/tmp') {
  const owned = path.join(worktree, 'node_modules')
  return fs
    .readdirSync(temporaryRoot)
    .filter((name) => TEST_STACK_NAME.test(name))
    .map((name) => path.join(temporaryRoot, name))
    .filter((directory) => {
      let link: string
      try {
        link = fs.readlinkSync(path.join(directory, 'node_modules'))
      } catch {
        return true
      }
      return link === owned || !fs.existsSync(link)
    })
}
