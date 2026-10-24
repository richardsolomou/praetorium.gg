import { expect, it } from 'vitest'
import { needsRuntimeChecks } from './ciScope'

it('skips runtime checks for contributor documentation', () => {
  expect(needsRuntimeChecks(['README.md', 'CONTRIBUTING.md', 'CLAUDE.md', 'AGENTS.md', 'SECURITY.md', 'docs/development/battles.md'])).toBe(
    false,
  )
})

it.each([
  'DESIGN.md',
  'PRODUCT.md',
  '.changeset/fix.md',
  'plugin/skills/build-a-roster/SKILL.md',
  'plugin/.claude-plugin/plugin.json',
  'plugin/assets/logo.png',
  'justfile',
  '.github/pull_request_template.md',
])('skips runtime checks for %s, which no runtime lane, build or deploy reads', (file) => {
  expect(needsRuntimeChecks(['docs/development/battles.md', file])).toBe(false)
})

it.each([
  'src/rules.md',
  'src/client/features/docs/content/search.md',
  'catalogue/patches/rules.md',
  'CHANGELOG.md',
  'mobile/CHANGELOG.md',
  '.changeset/config.json',
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
