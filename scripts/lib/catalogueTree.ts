import { execFileSync } from 'node:child_process'

/** The committed `catalogue/` tree identifies snapshot inputs independently of pointer-only commits and merge refs. */
export function catalogueTree(root: string) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  if (git('status', '--porcelain', '--', 'catalogue')) throw new Error('commit catalogue/ before packing a snapshot')
  return git('rev-parse', 'HEAD:catalogue')
}
