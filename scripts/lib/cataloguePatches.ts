import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export function applyPatches(directory: string, patchesDirectory: string, source: string) {
  if (!fs.existsSync(patchesDirectory)) return null
  const patches = fs
    .readdirSync(patchesDirectory)
    .filter((name) => name.endsWith('.patch'))
    .sort()
  if (!patches.length) return null
  const digest = createHash('sha256')
  for (const name of patches) {
    const patch = path.resolve(patchesDirectory, name)
    const files = execFileSync('git', ['-c', 'core.quotePath=false', 'apply', '--numstat', patch], { cwd: directory, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t').slice(2).join('\t'))
    if (!files.length || files.some((file) => !file.startsWith(`${source}/`))) throw new Error(`${name} changes files outside ${source}`)
    try {
      execFileSync('git', ['apply', '--check', patch], { cwd: directory, stdio: 'pipe' })
    } catch (error) {
      throw new Error(`${name} does not apply to ${source}`, { cause: error })
    }
    execFileSync('git', ['apply', patch], { cwd: directory, stdio: 'pipe' })
    digest.update(name).update('\0').update(fs.readFileSync(patch)).update('\0')
  }
  return digest.digest('hex')
}
