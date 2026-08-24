import { describe, expect, it } from 'vitest'
import { localRedirectPath } from './authConfig'

describe('localRedirectPath', () => {
  it.each([
    ['/rosters', '/rosters'],
    ['/battles/123?seat=456#turn', '/battles/123?seat=456#turn'],
  ])('keeps local path %s', (input, expected) => {
    expect(localRedirectPath(input)).toBe(expected)
  })

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '\\evil.example'])('rejects redirect %s', (input) => {
    expect(localRedirectPath(input)).toBeUndefined()
  })
})
