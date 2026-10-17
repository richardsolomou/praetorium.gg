import { randomUUID } from 'node:crypto'
import fs from 'node:fs'

/** Writes `file` through a sibling temporary file, so a reader never sees it half-written. */
export function replaceFileSync(file: string, write: (temporary: string) => void) {
  const temporary = `${file}.${randomUUID()}`
  try {
    write(temporary)
    fs.renameSync(temporary, file)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

export async function replaceFile(file: string, write: (temporary: string) => Promise<void>) {
  const temporary = `${file}.${randomUUID()}`
  try {
    await write(temporary)
    fs.renameSync(temporary, file)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}
