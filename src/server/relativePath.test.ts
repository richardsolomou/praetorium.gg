import { expect, it } from 'vitest'
import { isSafeRelativePath } from './relativePath'

it('accepts a nested relative path', () => {
  expect(isSafeRelativePath('catalogue/units.json')).toBe(true)
})

it.each(['', '/etc/passwd', 'a//b', 'a/', './a', 'a/../b', '..', 'a\\b'])('refuses %j', (value) => {
  expect(isSafeRelativePath(value)).toBe(false)
})
