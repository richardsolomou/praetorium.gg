import { execFileSync, spawnSync } from 'node:child_process'

export function isAncestor(root: string, older: string, newer: string) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', older, newer], { cwd: root, encoding: 'utf8' })
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(`Cannot compare revisions ${older} and ${newer}: ${result.stderr}`, { cause: result.error })
}

export function changedFiles(...range: string[]) {
  return execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', ...range, '--'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}
