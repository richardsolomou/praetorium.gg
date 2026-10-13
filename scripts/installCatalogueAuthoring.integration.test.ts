import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const repository = path.resolve(import.meta.dirname, '..')

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-authoring-'))
  temporaryDirectories.push(root)
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}')
  fs.mkdirSync(path.join(root, 'scripts'))
  fs.mkdirSync(path.join(root, 'catalogue'))
  fs.copyFileSync(path.join(repository, 'scripts/installCatalogueAuthoring.ts'), path.join(root, 'scripts/installCatalogueAuthoring.ts'))
  fs.copyFileSync(path.join(repository, 'catalogue/authoring.json'), path.join(root, 'catalogue/authoring.json'))
  const source = path.join(root, 'source')
  fs.cpSync(path.join(repository, '.catalogue-authoring/catalogue'), path.join(source, 'catalogue'), { recursive: true })
  const output = path.join(root, '.catalogue-authoring')
  fs.mkdirSync(output)
  fs.writeFileSync(path.join(output, 'previous'), 'installed authoring')
  const install = () =>
    spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), path.join(root, 'scripts/installCatalogueAuthoring.ts')], {
      env: { ...process.env, CATALOGUE_AUTHORING_DIR: source },
      encoding: 'utf8',
    })
  return { source, output, install }
}

it('installs a complete authoring checkout including saved-roster compatibility', () => {
  const { source, output, install } = fixture()

  const result = install()
  expect(result.status).toBe(0)
  expect(fs.realpathSync(output)).toBe(fs.realpathSync(source))
})

it.each(['accepted-coverage-losses', 'retained-profile-build', 'retained-roster-rules', 'retired-ids', 'roster-migrations'])(
  'preserves installed authoring when %s is missing',
  (name) => {
    const { source, output, install } = fixture()
    fs.unlinkSync(path.join(source, 'catalogue', `${name}.json`))

    const result = install()
    expect(result.stderr).toContain(`${name}.json`)
    expect(result.status).not.toBe(0)
    expect(fs.readFileSync(path.join(output, 'previous'), 'utf8')).toBe('installed authoring')
  },
)

it('preserves installed authoring when saved-roster compatibility is invalid JSON', () => {
  const { source, output, install } = fixture()
  fs.writeFileSync(path.join(source, 'catalogue/retained-roster-rules.json'), '{')

  const result = install()
  expect(result.stderr).toContain('SyntaxError')
  expect(result.status).not.toBe(0)
  expect(fs.readFileSync(path.join(output, 'previous'), 'utf8')).toBe('installed authoring')
})
