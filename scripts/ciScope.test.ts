import { expect, it } from 'vitest'
import { needsRuntimeChecks } from './ciScope'

it('skips runtime checks for contributor documentation', () => {
  expect(needsRuntimeChecks(['README.md', 'CONTRIBUTING.md', 'CLAUDE.md', 'AGENTS.md', 'SECURITY.md', 'docs/development/battles.md'])).toBe(
    false,
  )
})

it.each([
  'src/rules.md',
  'catalogue/patches/rules.md',
  '.changeset/fix.md',
  'docs/example.ts',
  'docs/image.svg',
  '.github/workflows/ci.yml',
  'pnpm-lock.yaml',
])('requires runtime checks when documentation accompanies %s', (file) => {
  expect(needsRuntimeChecks(['docs/development/battles.md', file])).toBe(true)
})

it('requires runtime checks when the comparison lists no paths', () => {
  expect(needsRuntimeChecks([])).toBe(true)
})
