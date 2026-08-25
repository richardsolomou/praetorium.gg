import { expect, it } from 'vitest'
import { validateChangeset } from './changesets'

it('accepts an empty changeset', () => {
  expect(validateChangeset('test.md', '---\n---\n', 'praetorium.gg')).toEqual([])
})

it('accepts CRLF frontmatter', () => {
  expect(validateChangeset('test.md', '---\r\n"praetorium.gg": patch\r\n---\r\n', 'praetorium.gg')).toEqual([])
})

it('rejects missing frontmatter', () => {
  expect(validateChangeset('test.md', 'No frontmatter.\n', 'praetorium.gg')).toEqual(['test.md: missing or invalid frontmatter'])
})

it('rejects another package', () => {
  expect(validateChangeset('test.md', '---\n"another-package": patch\n---\n', 'praetorium.gg')).toEqual([
    'test.md: references package "another-package", but package.json is "praetorium.gg"',
  ])
})
