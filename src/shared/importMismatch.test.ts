import { expect, it } from 'vitest'
import { normalized } from './importMismatch'

it.each(['Shield‐Captain', 'Shield‑Captain'])('matches the typographic hyphen in %s', (name) => {
  expect(normalized(name)).toBe('shield-captain')
})
