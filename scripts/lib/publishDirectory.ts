import fs from 'node:fs'

/** Moves a complete staging directory into a shared cache, yielding to another process that published there first. */
export function publishDirectory(staging: string, target: string) {
  fs.rmSync(target, { recursive: true, force: true })
  try {
    fs.renameSync(staging, target)
  } catch (error) {
    if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
  }
}
