import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const compilerSources = [
  'pnpm-lock.yaml',
  'catalogue',
  'src/contracts',
  'src/core',
  'src/server',
  'src/shared',
  'scripts/lib',
  'scripts/compileCatalogueRuntime.ts',
]

function* sourceFiles(root: string, relative: string): Generator<string> {
  const target = path.join(root, relative)
  if (!fs.existsSync(target)) return
  if (fs.statSync(target).isFile()) {
    if (!/\.(?:integration\.)?test\.[^.]+$/.test(relative)) yield relative
    return
  }
  for (const entry of fs.readdirSync(target).sort()) yield* sourceFiles(root, path.join(relative, entry))
}

/** Hash compiler inputs from disk because application images omit Git metadata. */
export function compilerSourcesFingerprint(worktree = process.cwd(), inputs = compilerSources) {
  const hash = createHash('sha256')
  for (const file of inputs.flatMap((source) => [...sourceFiles(worktree, source)])) {
    hash
      .update(file)
      .update('\0')
      .update(fs.readFileSync(path.join(worktree, file)))
      .update('\0')
  }
  return hash.digest('hex')
}
