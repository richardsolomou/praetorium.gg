import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compilerFingerprint, treeFingerprint } from './compilerSources'

describe('catalogue compiler fingerprint', () => {
  let root: string
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-sources-'))
    write('scripts/catalogueRefresh.ts', "import { compile } from '../src/server/compiler'\nconsole.log(compile())")
    write('scripts/compileCatalogueRuntime.ts', "import { compile } from '../src/server/compiler'\nconsole.log(compile())")
    write(
      'src/server/compiler.ts',
      "import { pack } from 'packer'\nimport { limit } from '../core/limits'\nexport const compile = () => pack(limit)",
    )
    write('src/core/limits.ts', 'export const limit = 1\nexport const unused = 2')
    write('src/server/sealed-events.ts', 'export const sealed event = 1')
    write('node_modules/packer/package.json', '{"name":"packer","type":"module","main":"index.js"}')
    write('node_modules/packer/index.js', 'export const pack = (value) => [value]')
    write('node_modules/unused/package.json', '{"name":"unused","type":"module","main":"index.js"}')
    write('node_modules/unused/index.js', 'export const other = 1')
  })
  afterEach(() => {
    for (const leftover of [root, `${root}-dependencies`]) fs.rmSync(leftover, { recursive: true, force: true })
  })

  const unchangedAfter = async (change: () => void) => {
    const before = await compilerFingerprint(root)
    change()
    return (await compilerFingerprint(root)) === before
  }

  it('reuses prepared catalogues after an unrelated module changes', async () => {
    expect(await unchangedAfter(() => write('src/server/sealed-events.ts', 'export const sealed event = 2'))).toBe(true)
  })

  it('reuses prepared catalogues after a compiler comment changes', async () => {
    const compiler = (comment: string) =>
      write(
        'src/server/compiler.ts',
        `import { pack } from 'packer'\nimport { limit } from '../core/limits'\n/** ${comment} */\nexport function compile() {\n  return pack(limit)\n}`,
      )
    compiler('Packs the limit.')
    expect(await unchangedAfter(() => compiler('Packs the configured limit.'))).toBe(true)
  })

  it('reuses prepared catalogues after an unused export changes', async () => {
    expect(await unchangedAfter(() => write('src/core/limits.ts', 'export const limit = 1\nexport const unused = 3'))).toBe(true)
  })

  it('reuses prepared catalogues after a package the compiler does not import changes', async () => {
    expect(await unchangedAfter(() => write('node_modules/unused/index.js', 'export const other = 2'))).toBe(true)
  })

  it('invalidates prepared catalogues after a transitive compiler change', async () => {
    expect(await unchangedAfter(() => write('src/core/limits.ts', 'export const limit = 2\nexport const unused = 2'))).toBe(false)
  })

  it('invalidates prepared catalogues after a package the compiler imports changes', async () => {
    expect(await unchangedAfter(() => write('node_modules/packer/index.js', 'export const pack = (value) => [value, value]'))).toBe(false)
  })

  it('invalidates prepared catalogues after catalogue configuration changes', async () => {
    write('catalogue/retired-ids.json', '{}')
    expect(await unchangedAfter(() => write('catalogue/retired-ids.json', '{"updated":true}'))).toBe(false)
  })

  it('names the same compiler wherever its dependencies are installed', async () => {
    const before = await compilerFingerprint(root)
    const installed = `${root}-dependencies`
    const checkout = path.join(`${root}-elsewhere`, 'nested')
    fs.mkdirSync(path.dirname(checkout))
    fs.renameSync(path.join(root, 'node_modules'), installed)
    fs.renameSync(root, checkout)
    root = checkout
    fs.symlinkSync(installed, path.join(root, 'node_modules'), 'dir')
    expect(await compilerFingerprint(root)).toBe(before)
  })

  it('rejects missing local dependencies', async () => {
    write('src/core/limits.ts', "export { limit } from './missing'")
    await expect(compilerFingerprint(root)).rejects.toThrow('missing')
  })
})

describe('catalogue authoring fingerprint', () => {
  it('hashes configuration without parsing its text as code', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-authoring-'))
    try {
      fs.mkdirSync(path.join(root, 'catalogue/patches'), { recursive: true })
      fs.writeFileSync(path.join(root, 'catalogue/patches/rules.json'), '{"text":"import(foo)"}')
      const before = treeFingerprint(root, ['catalogue'])
      fs.writeFileSync(path.join(root, 'catalogue/patches/rules.json'), '{"text":"updated"}')
      expect(treeFingerprint(root, ['catalogue'])).not.toBe(before)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
