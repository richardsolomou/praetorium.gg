import { describe, expect, it } from 'vitest'
import { notificationUrl } from './notifications'

describe('notificationUrl', () => {
  it('opens a path on the application origin', () => {
    expect(notificationUrl({ path: '/leagues/abc?event=def' })).toBe('https://praetorium.gg/leagues/abc?event=def')
  })

  it.each([
    { path: 'https://example.com/battles/abc' },
    { path: '//example.com/battles/abc' },
    { path: '/\\example.com' },
    { path: 42 },
    { url: '/battles/abc' },
    null,
    'string',
  ])('opens nothing for %j', (data) => {
    expect(notificationUrl(data)).toBeNull()
  })
})
