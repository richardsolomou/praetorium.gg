import { git } from './git'

/** The committed `catalogue/` tree identifies snapshot inputs independently of pointer-only commits and merge refs. */
export function catalogueTree(root: string) {
  if (git(root, 'status', '--porcelain', '--', 'catalogue').trim()) throw new Error('commit catalogue/ before packing a snapshot')
  return git(root, 'rev-parse', 'HEAD:catalogue').trim()
}
