import fs from 'node:fs/promises'
import { validateChangeset } from './changesets'

const { name: expectedName } = JSON.parse(await fs.readFile('package.json', 'utf8'))

const bad: string[] = []

for await (const file of fs.glob('.changeset/*.md')) {
  if (file.endsWith('README.md')) continue
  const contents = await fs.readFile(file, 'utf8')
  bad.push(...validateChangeset(file, contents, expectedName))
}

if (bad.length) throw new Error(`Invalid changesets:\n${bad.join('\n')}`)
console.log('Validated changeset package names.')
