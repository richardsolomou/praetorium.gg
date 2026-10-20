import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compilerSourcesFingerprint } from './compilerSources'

describe('catalogue compiler source fingerprint', () => {
  let root: string
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-sources-'))
    write('scripts/catalogueRefresh.ts', "import { compile } from '../src/server/compiler'; compile()")
    write('src/server/compiler.ts', "export { compile } from '@/core/compiler'")
    write('src/core/compiler.ts', 'export const compile = () => 1')
    write('src/server/leagues.ts', 'export const league = 1')
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  it('reuses prepared catalogues after an unrelated server change', () => {
    const before = compilerSourcesFingerprint(root)
    write('src/server/leagues.ts', 'export const league = 2')
    expect(compilerSourcesFingerprint(root)).toBe(before)
  })

  it('invalidates prepared catalogues after a transitive compiler change', () => {
    const before = compilerSourcesFingerprint(root)
    write('src/core/compiler.ts', 'export const compile = () => 2')
    expect(compilerSourcesFingerprint(root)).not.toBe(before)
  })

  it('follows literal dynamic imports outside the default source directories', () => {
    write('src/core/compiler.ts', "export const compile = () => import('../../tools/compile.ts')")
    write('tools/compile.ts', 'export const version = 1')
    const before = compilerSourcesFingerprint(root)
    write('tools/compile.ts', 'export const version = 2')
    expect(compilerSourcesFingerprint(root)).not.toBe(before)
  })

  it('handles cyclic imports', () => {
    write('src/core/compiler.ts', "import '../../scripts/catalogueRefresh'; export const compile = () => 1")
    expect(compilerSourcesFingerprint(root)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects missing local dependencies', () => {
    write('src/core/compiler.ts', "export { compile } from './missing'")
    expect(() => compilerSourcesFingerprint(root)).toThrow('missing')
  })

  it('rejects computed dynamic imports whose dependencies cannot be tracked', () => {
    write('src/core/compiler.ts', 'export const compile = (file: string) => import(file)')
    expect(() => compilerSourcesFingerprint(root)).toThrow('dynamic import')
  })

  it('hashes configuration without trying to parse its source text as code', () => {
    write('catalogue/patches/rules.json', '{"text":"import(foo)"}')
    const before = compilerSourcesFingerprint(root)
    write('catalogue/patches/rules.json', '{"text":"updated"}')
    expect(compilerSourcesFingerprint(root)).not.toBe(before)
  })
})
