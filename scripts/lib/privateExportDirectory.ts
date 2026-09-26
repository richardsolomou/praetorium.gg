import { mkdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export async function createPrivateExportDirectory(destination: string, repositoryRoot: string): Promise<string> {
  if (!isAbsolute(destination)) throw new Error('export directory must be absolute')
  const directory = resolve(destination)
  const parent = await realpath(dirname(directory))
  const repository = await realpath(repositoryRoot)
  const insideRepository = relative(repository, parent)
  if (insideRepository === '' || (insideRepository !== '..' && !insideRepository.startsWith(`..${sep}`))) {
    throw new Error('export directory must be outside the repository')
  }
  await mkdir(directory, { mode: 0o700 })
  return directory
}
