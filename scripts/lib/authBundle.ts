import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createPrivateExportDirectory } from './privateExportDirectory'

export async function writeAuthBundle(destination: string, sql: string, secret: string, repositoryRoot: string): Promise<void> {
  const directory = await createPrivateExportDirectory(destination, repositoryRoot)
  await writeFile(join(directory, 'auth.secret'), `${secret}\n`, { mode: 0o600, flag: 'wx' })
  await writeFile(join(directory, 'auth.sql'), sql, { mode: 0o600, flag: 'wx' })
}
