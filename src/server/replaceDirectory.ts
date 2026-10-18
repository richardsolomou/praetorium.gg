import { randomUUID } from 'node:crypto'
import fs from 'node:fs'

/** Moves a complete staging directory into place, restoring the previous copy if the move fails. */
export function replaceDirectory(staging: string, target: string) {
  const previous = `${target}.previous-${randomUUID()}`
  if (fs.existsSync(target)) fs.renameSync(target, previous)
  try {
    fs.renameSync(staging, target)
  } catch (error) {
    if (fs.existsSync(previous)) fs.renameSync(previous, target)
    throw error
  }
  fs.rmSync(previous, { recursive: true, force: true })
}
