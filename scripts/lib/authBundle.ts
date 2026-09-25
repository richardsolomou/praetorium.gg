import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export async function writeAuthBundle(destination: string, sql: string, secret: string, repositoryRoot: string): Promise<void> {
  if (!isAbsolute(destination)) throw new Error('auth export directory must be absolute')
  const directory = resolve(destination)
  const parent = await realpath(dirname(directory))
  const repository = await realpath(repositoryRoot)
  const insideRepository = relative(repository, parent)
  if (insideRepository === '' || (insideRepository !== '..' && !insideRepository.startsWith(`..${sep}`))) {
    throw new Error('auth export directory must be outside the repository')
  }
  await mkdir(directory, { mode: 0o700 })
  await writeFile(join(directory, 'auth.secret'), `${secret}\n`, { mode: 0o600, flag: 'wx' })
  await writeFile(join(directory, 'auth.sql'), sql, { mode: 0o600, flag: 'wx' })
}
