import { describe, expect, it } from 'vitest'
import { canonicalRedirect } from './canonicalHost'

const canonical = 'https://sealed-lists.ras.sh'

describe('canonicalRedirect', () => {
  it('leaves the canonical host alone', () => {
    expect(canonicalRedirect('https://sealed-lists.ras.sh/g/abc', canonical)).toBeNull()
  })

  it('moves an old hostname to the new one', () => {
    expect(canonicalRedirect('https://sealedlists.ras.sh/g/abc', canonical)).toBe('https://sealed-lists.ras.sh/g/abc')
  })

  it('keeps the path, so a group link still opens the group', () => {
    expect(canonicalRedirect('https://sealedlists.ras.sh/g/tok3n/game/xyz', canonical)).toBe('https://sealed-lists.ras.sh/g/tok3n/game/xyz')
  })

  it('keeps the query string', () => {
    expect(canonicalRedirect('https://sealedlists.ras.sh/signin?next=%2Fg%2Fabc', canonical)).toBe(
      'https://sealed-lists.ras.sh/signin?next=%2Fg%2Fabc',
    )
  })

  it('does nothing when the deployment names no canonical host', () => {
    expect(canonicalRedirect('https://anything.example/g/abc', undefined)).toBeNull()
  })

  it('does nothing when the canonical host is blank', () => {
    expect(canonicalRedirect('https://anything.example/g/abc', '   ')).toBeNull()
  })

  it('ignores a port difference that only the proxy cares about', () => {
    expect(canonicalRedirect('http://localhost:3000/g/abc', 'http://localhost:3000')).toBeNull()
  })

  it('treats a different port as a different host, since links must match exactly', () => {
    expect(canonicalRedirect('http://localhost:3001/g/abc', 'http://localhost:3000')).toBe('http://localhost:3000/g/abc')
  })

  it('leaves the health check alone, since the container asks itself by IP', () => {
    expect(canonicalRedirect('http://127.0.0.1:3000/api/health', canonical)).toBeNull()
  })

  it('still redirects every other path arriving on the wrong host', () => {
    expect(canonicalRedirect('http://127.0.0.1:3000/api/events?group=abc', canonical)).toBe(
      'https://sealed-lists.ras.sh/api/events?group=abc',
    )
  })

  it('serves rather than guesses when the canonical value is not a URL', () => {
    expect(canonicalRedirect('https://sealedlists.ras.sh/g/abc', 'not-a-url')).toBeNull()
  })
})
